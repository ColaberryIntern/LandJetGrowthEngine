'use client';

import { type AiAgentRecord } from '@/lib/api';

const DEPT_CONFIG: Record<string, { label: string; color: string; border: string; bg: string; badge: string; dot: string }> = {
  outreach: { label: 'Outreach', color: 'text-blue-700', border: 'border-l-blue-500', bg: 'bg-blue-50', badge: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  campaigns: { label: 'Campaigns', color: 'text-emerald-700', border: 'border-l-emerald-500', bg: 'bg-emerald-50', badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  operations: { label: 'Operations', color: 'text-amber-700', border: 'border-l-amber-500', bg: 'bg-amber-50', badge: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  growth: { label: 'Growth', color: 'text-purple-700', border: 'border-l-purple-500', bg: 'bg-purple-50', badge: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
  infrastructure: { label: 'Infrastructure', color: 'text-gray-700', border: 'border-l-gray-500', bg: 'bg-gray-50', badge: 'bg-gray-200 text-gray-700', dot: 'bg-gray-500' },
};

const DEFAULT_DEPT = { label: 'Other', color: 'text-gray-600', border: 'border-l-gray-400', bg: 'bg-gray-50', badge: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' };

const STATUS_COLORS: Record<string, { dot: string; label: string }> = {
  active: { dot: 'bg-emerald-500', label: 'Active' },
  paused: { dot: 'bg-amber-400', label: 'Paused' },
  disabled: { dot: 'bg-gray-300', label: 'Disabled' },
  error: { dot: 'bg-red-500', label: 'Error' },
};

const TYPE_LABELS: Record<string, string> = {
  content_quality: 'Content Quality',
  content_generation: 'Content Generation',
  nlp: 'NLP',
  validation: 'Validation',
  repair: 'Repair',
  recovery: 'Recovery',
  engagement_analysis: 'Engagement',
  orchestration: 'Orchestration',
  scoring: 'Scoring',
  compliance: 'Compliance',
  monitoring: 'Monitoring',
  governance: 'Governance',
  matching: 'Matching',
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never run';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

interface AgentOrgChartProps {
  agents: AiAgentRecord[];
}

export default function AgentOrgChart({ agents }: AgentOrgChartProps) {
  // Group by department
  const grouped: Record<string, AiAgentRecord[]> = {};
  for (const agent of agents) {
    const dept = agent.department || 'other';
    if (!grouped[dept]) grouped[dept] = [];
    grouped[dept].push(agent);
  }

  // Sort departments by defined order
  const deptOrder = ['outreach', 'operations', 'campaigns', 'growth', 'infrastructure'];
  const sortedDepts = Object.keys(grouped).sort((a, b) => {
    const ai = deptOrder.indexOf(a);
    const bi = deptOrder.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const totalActive = agents.filter(a => a.status === 'active').length;

  return (
    <div>
      {/* Summary bar */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-sm font-medium text-gray-900">{totalActive} of {agents.length} agents active</span>
        </div>
        <div className="flex gap-2">
          {sortedDepts.map(dept => {
            const cfg = DEPT_CONFIG[dept] || DEFAULT_DEPT;
            return (
              <span key={dept} className={`rounded-full px-2 py-0.5 text-xs font-medium ${cfg.badge}`}>
                {cfg.label} ({grouped[dept].length})
              </span>
            );
          })}
        </div>
      </div>

      {/* Department columns */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {sortedDepts.map(dept => {
          const cfg = DEPT_CONFIG[dept] || DEFAULT_DEPT;
          const deptAgents = grouped[dept];

          return (
            <div key={dept} className="space-y-2">
              {/* Department header */}
              <div className={`flex items-center gap-2 rounded-lg ${cfg.bg} px-4 py-2.5`}>
                <div className={`h-3 w-3 rounded-full ${cfg.dot}`} />
                <h3 className={`text-sm font-semibold ${cfg.color}`}>{cfg.label}</h3>
                <span className="text-xs text-gray-400 ml-auto">{deptAgents.length} agent{deptAgents.length !== 1 ? 's' : ''}</span>
              </div>

              {/* Agent cards */}
              {deptAgents.map(agent => {
                const statusCfg = STATUS_COLORS[agent.status] || STATUS_COLORS.disabled;
                const typeLabel = TYPE_LABELS[agent.type] || agent.type;

                return (
                  <div
                    key={agent.id}
                    className={`rounded-lg border border-gray-200 bg-white p-3.5 border-l-4 ${cfg.border} hover:shadow-md transition-shadow`}
                  >
                    {/* Top row: name + status */}
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-gray-900 text-sm">{formatName(agent.name)}</span>
                      <div className="flex items-center gap-1.5">
                        <div className={`h-2 w-2 rounded-full ${statusCfg.dot}`} />
                        <span className="text-xs text-gray-400">{statusCfg.label}</span>
                      </div>
                    </div>

                    {/* Type badge */}
                    <div className="mt-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cfg.badge}`}>{typeLabel}</span>
                    </div>

                    {/* Trigger */}
                    <p className="mt-2 text-xs text-gray-500 leading-relaxed">
                      {agent.schedule || 'No trigger configured'}
                    </p>

                    {/* Footer: last run + metrics */}
                    <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2">
                      <span className="text-xs text-gray-400">
                        {agent.last_run_at ? `Last: ${timeAgo(agent.last_run_at)}` : 'Never run'}
                      </span>
                      {agent.metrics && typeof agent.metrics === 'object' && Object.keys(agent.metrics).length > 0 && (
                        <span className="text-xs text-gray-400">
                          {(agent.metrics as any).success_rate ? `${(agent.metrics as any).success_rate}% success` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
