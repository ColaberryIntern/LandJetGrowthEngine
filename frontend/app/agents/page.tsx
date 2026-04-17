'use client';

import { useState, useEffect, useRef } from 'react';
import { getAgents, getAgentActivity, type AiAgentRecord, type AgentRunRecord } from '@/lib/api';
import AgentOrgChart from '@/components/AgentOrgChart';

const DEPT_COLORS: Record<string, string> = {
  outreach: '#3B82F6', campaigns: '#10B981', operations: '#F59E0B',
  growth: '#8B5CF6', infrastructure: '#6B7280', orchestration: '#111827',
};

function formatName(n: string) { return n.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }
function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return 'Just now'; if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<AiAgentRecord[]>([]);
  const [activity, setActivity] = useState<AgentRunRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeAgents, setActiveAgents] = useState<Set<string>>(new Set());
  const [flashRun, setFlashRun] = useState<string | null>(null);
  const activityRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevRunCountRef = useRef(0);

  async function fetchAll() {
    try {
      const [agentRes, actRes] = await Promise.allSettled([
        getAgents(),
        getAgentActivity(24),
      ]);
      if (agentRes.status === 'fulfilled') setAgents(agentRes.value.agents || []);
      if (actRes.status === 'fulfilled') {
        const runs = actRes.value.runs || [];
        setActivity(runs);

        // Flash new runs
        if (prevRunCountRef.current > 0 && runs.length > prevRunCountRef.current) {
          const newRuns = runs.slice(0, runs.length - prevRunCountRef.current);
          for (const r of newRuns) {
            setActiveAgents(prev => new Set([...prev, r.agent_name]));
            setFlashRun(r.id);
            setTimeout(() => {
              setActiveAgents(prev => { const n = new Set(prev); n.delete(r.agent_name); return n; });
              setFlashRun(null);
            }, 2000);
          }
        }
        prevRunCountRef.current = runs.length;
      }
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    fetchAll();
    // Poll every 10 seconds for live updates
    pollRef.current = setInterval(fetchAll, 10000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Stats
  const totalRuns = activity.length;
  const successRuns = activity.filter(r => r.status === 'success').length;
  const failedRuns = activity.filter(r => r.status === 'failed').length;
  const activeAgentNames = new Set(activity.map(r => r.agent_name));
  const successRate = totalRuns > 0 ? Math.round((successRuns / totalRuns) * 100) : 100;

  // Group activity by hour for the timeline bar
  const hourBuckets: Record<number, number> = {};
  for (const r of activity) {
    const h = new Date(r.created_at).getHours();
    hourBuckets[h] = (hourBuckets[h] || 0) + 1;
  }
  const maxBucket = Math.max(...Object.values(hourBuckets), 1);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">AI War Room</h1>
          <p className="mt-1 text-sm text-gray-500">Live agent operations -- last 24 hours</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-gray-500">Live</span>
          </div>
          <button onClick={() => { setLoading(true); fetchAll(); }} disabled={loading}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid gap-3 grid-cols-4">
        <div className="rounded-lg bg-gray-900 p-4 text-white">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Executions (24h)</p>
          <p className="mt-1 text-2xl font-bold">{totalRuns}</p>
        </div>
        <div className="rounded-lg bg-emerald-600 p-4 text-white">
          <p className="text-xs text-emerald-200 uppercase tracking-wider">Success Rate</p>
          <p className="mt-1 text-2xl font-bold">{successRate}%</p>
        </div>
        <div className={`rounded-lg p-4 text-white ${failedRuns > 0 ? 'bg-red-600' : 'bg-gray-700'}`}>
          <p className="text-xs opacity-70 uppercase tracking-wider">Failed</p>
          <p className="mt-1 text-2xl font-bold">{failedRuns}</p>
        </div>
        <div className="rounded-lg bg-blue-600 p-4 text-white">
          <p className="text-xs text-blue-200 uppercase tracking-wider">Active Agents</p>
          <p className="mt-1 text-2xl font-bold">{activeAgentNames.size} / {agents.length}</p>
        </div>
      </div>

      {/* Activity Timeline Bar */}
      <div className="rounded-lg border border-gray-200 bg-white p-3">
        <p className="text-xs text-gray-400 mb-2">Activity by Hour (24h)</p>
        <div className="flex items-end gap-0.5 h-10">
          {Array.from({ length: 24 }, (_, i) => {
            const hour = (new Date().getHours() - 23 + i + 24) % 24;
            const count = hourBuckets[hour] || 0;
            const height = count > 0 ? Math.max(4, (count / maxBucket) * 40) : 2;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                <div className="w-full rounded-sm transition-all" style={{ height, backgroundColor: count > 0 ? '#10B981' : '#E5E7EB' }}
                  title={`${hour}:00 - ${count} runs`} />
                {i % 6 === 0 && <span className="text-[8px] text-gray-400">{hour}h</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Layout: Graph + Activity Feed */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Network Graph (2/3 width) */}
        <div className="lg:col-span-2">
          {agents.length > 0 ? (
            <AgentOrgChart agents={agents} activeAgents={activeAgents} />
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-400">
              Loading agents...
            </div>
          )}
        </div>

        {/* Live Activity Feed (1/3 width) */}
        <div className="rounded-xl border border-gray-200 bg-gray-900 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-sm font-semibold text-white">Live Activity</span>
            </div>
            <span className="text-xs text-gray-500">{totalRuns} events</span>
          </div>
          <div ref={activityRef} className="overflow-y-auto" style={{ maxHeight: 520 }}>
            {activity.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-600">No activity in the last 24 hours</div>
            ) : (
              <div className="divide-y divide-gray-800">
                {activity.map(run => {
                  const isNew = flashRun === run.id;
                  const color = DEPT_COLORS[agents.find(a => a.name === run.agent_name)?.department || ''] || '#6B7280';
                  return (
                    <div key={run.id}
                      className={`px-4 py-2.5 transition-all duration-500 ${isNew ? 'bg-emerald-900/30' : 'hover:bg-gray-800/50'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: run.status === 'success' ? '#10B981' : run.status === 'failed' ? '#EF4444' : '#6B7280' }} />
                          <div className="h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: color }}>
                            <span className="text-[7px] text-white font-bold">
                              {run.agent_name.split('_').map(w => w[0]?.toUpperCase()).join('').slice(0, 2)}
                            </span>
                          </div>
                          <span className="text-xs text-gray-300 font-medium truncate">{formatName(run.agent_name)}</span>
                        </div>
                        <span className="text-[10px] text-gray-600 whitespace-nowrap ml-2">{timeAgo(run.created_at)}</span>
                      </div>
                      {run.details && typeof run.details === 'object' && Object.keys(run.details).length > 0 && (
                        <p className="mt-0.5 ml-[38px] text-[10px] text-gray-500 truncate">
                          {Object.entries(run.details as Record<string, any>).map(([k, v]) => `${k}: ${v}`).join(', ')}
                        </p>
                      )}
                      {run.error_message && (
                        <p className="mt-0.5 ml-[38px] text-[10px] text-red-400 truncate">{run.error_message}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
