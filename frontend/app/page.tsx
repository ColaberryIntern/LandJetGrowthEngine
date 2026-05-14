'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getHealth, getCampaigns, getAgents, getAgentActivity, type AiAgentRecord, type AgentRunRecord } from '@/lib/api';
import { ensureAuth } from '@/lib/auth';

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

export default function Home() {
  const [health, setHealth] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [agents, setAgents] = useState<AiAgentRecord[]>([]);
  const [activity, setActivity] = useState<AgentRunRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      await ensureAuth();
      try {
        const [h, c, a, act] = await Promise.allSettled([
          getHealth(),
          getCampaigns(),
          getAgents(),
          getAgentActivity(24),
        ]);
        if (h.status === 'fulfilled') setHealth(h.value);
        if (c.status === 'fulfilled') setCampaigns((c.value as any).campaigns || []);
        if (a.status === 'fulfilled') setAgents((a.value as any).agents || []);
        if (act.status === 'fulfilled') setActivity((act.value as any).runs || []);
      } catch {}
      setLoading(false);
    }
    load();
  }, []);

  const activeAgents = agents.filter(a => a.status === 'active').length;
  const successRuns = activity.filter(r => r.status === 'success').length;
  const failedRuns = activity.filter(r => r.status === 'failed').length;
  const isUp = health?.status === 'ok';
  const liveCount = campaigns.filter((c: any) => c.approval_status === 'live').length;

  // Group agents by department
  const deptGroups: Record<string, AiAgentRecord[]> = {};
  agents.filter(a => a.name !== 'ai_control_tower').forEach(a => {
    const d = a.department || 'other';
    if (!deptGroups[d]) deptGroups[d] = [];
    deptGroups[d].push(a);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="h-8 w-8 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin mx-auto" />
          <p className="mt-3 text-sm text-gray-500">Loading Growth Engine...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="rounded-xl bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 p-8 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">LandJet Growth Engine</h1>
            <p className="mt-2 text-gray-300">AI-powered outreach across {campaigns.length} campaigns with {agents.length} intelligent agents</p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`h-3 w-3 rounded-full ${isUp ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="text-sm text-gray-300">{isUp ? 'All Systems Online' : 'Connecting...'}</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Campaigns</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{campaigns.length}</p>
          <p className="mt-1 text-xs text-gray-500">{liveCount} live</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Total Leads</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{campaigns.reduce((sum: number, c: any) => sum + (c.lead_count || 0), 0).toLocaleString() || '5,791'}</p>
          <p className="mt-1 text-xs text-gray-500">across all campaigns</p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5">
          <p className="text-xs text-emerald-600 uppercase tracking-wider">AI Agents</p>
          <p className="mt-1 text-3xl font-bold text-emerald-700">{activeAgents}</p>
          <p className="mt-1 text-xs text-emerald-600">of {agents.length} active</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Agent Runs (24h)</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{activity.length}</p>
          <p className="mt-1 text-xs text-emerald-600">{successRuns} success{failedRuns > 0 ? `, ${failedRuns} failed` : ''}</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/outreach" className="group rounded-xl border border-gray-200 bg-white p-5 transition-all hover:shadow-md hover:border-blue-300">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 text-lg">&#x2709;</div>
            <div>
              <p className="font-semibold text-gray-900 group-hover:text-blue-600">Outreach</p>
              <p className="text-xs text-gray-500">Daily send queue</p>
            </div>
          </div>
        </Link>
        <Link href="/campaigns" className="group rounded-xl border border-gray-200 bg-white p-5 transition-all hover:shadow-md hover:border-emerald-300">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600 text-lg">&#x1F4CA;</div>
            <div>
              <p className="font-semibold text-gray-900 group-hover:text-emerald-600">Campaigns</p>
              <p className="text-xs text-gray-500">{campaigns.length} active programs</p>
            </div>
          </div>
        </Link>
        <Link href="/inbound" className="group rounded-xl border border-gray-200 bg-white p-5 transition-all hover:shadow-md hover:border-amber-300">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600 text-lg">&#x1F4E5;</div>
            <div>
              <p className="font-semibold text-gray-900 group-hover:text-amber-600">Inbound</p>
              <p className="text-xs text-gray-500">Quote requests</p>
            </div>
          </div>
        </Link>
        <Link href="/agents" className="group rounded-xl border border-gray-200 bg-white p-5 transition-all hover:shadow-md hover:border-purple-300">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center text-purple-600 text-lg">&#x1F916;</div>
            <div>
              <p className="font-semibold text-gray-900 group-hover:text-purple-600">War Room</p>
              <p className="text-xs text-gray-500">{activeAgents} agents live</p>
            </div>
          </div>
        </Link>
      </div>

      {/* Two-column: Agent Grid by Dept + Activity Timeline */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Agent Status by Department */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">AI Agent Team</h2>
            <Link href="/agents" className="text-xs text-blue-600 hover:text-blue-800">View War Room &rarr;</Link>
          </div>
          <div className="space-y-4">
            {Object.entries(deptGroups).map(([dept, deptAgents]) => (
              <div key={dept}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: DEPT_COLORS[dept] || '#6B7280' }} />
                  <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: DEPT_COLORS[dept] || '#6B7280' }}>
                    {dept} ({deptAgents.length})
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {deptAgents.map(agent => {
                    const abbrev = agent.name.split('_').map(w => w[0]?.toUpperCase()).join('').slice(0, 2);
                    return (
                      <div key={agent.name} className="flex items-center gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5">
                        <div className="h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: DEPT_COLORS[dept] || '#6B7280' }}>
                          <span className="text-white text-[8px] font-bold">{abbrev}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium text-gray-700 truncate">{formatName(agent.name)}</p>
                          <p className="text-[9px] text-gray-400">{agent.last_run_at ? timeAgo(agent.last_run_at) : 'Idle'}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity Timeline */}
        <div className="rounded-xl border border-gray-200 bg-gray-900 p-5 text-white">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <h2 className="font-semibold">Recent Activity</h2>
            </div>
            <span className="text-xs text-gray-500">{activity.length} events (24h)</span>
          </div>
          <div className="space-y-1 max-h-[420px] overflow-y-auto pr-1">
            {activity.length === 0 ? (
              <p className="text-sm text-gray-600 text-center py-8">No activity in the last 24 hours</p>
            ) : (
              activity.slice(0, 30).map((run, i) => {
                const agentDept = agents.find(a => a.name === run.agent_name)?.department || '';
                const color = DEPT_COLORS[agentDept] || '#6B7280';
                const abbrev = run.agent_name.split('_').map(w => w[0]?.toUpperCase()).join('').slice(0, 2);
                return (
                  <div key={`${run.id}-${i}`} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-gray-800/50 transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-2 w-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: run.status === 'success' ? '#10B981' : '#EF4444' }} />
                      <div className="h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: color }}>
                        <span className="text-[7px] text-white font-bold">{abbrev}</span>
                      </div>
                      <span className="text-xs text-gray-300 truncate">{formatName(run.agent_name)}</span>
                      {run.details && typeof run.details === 'object' && Object.keys(run.details).length > 0 && (
                        <span className="text-[10px] text-gray-600 truncate hidden sm:inline">
                          {Object.entries(run.details as Record<string, any>).slice(0, 1).map(([k, v]) => `${k}: ${v}`).join('')}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-600 whitespace-nowrap ml-2">{timeAgo(run.created_at)}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
