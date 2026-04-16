'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { type AiAgentRecord } from '@/lib/api';

const DEPT_COLORS: Record<string, { bg: string; border: string; fill: string; text: string; light: string }> = {
  outreach: { bg: '#3B82F6', border: '#2563EB', fill: '#EFF6FF', text: '#1E40AF', light: '#DBEAFE' },
  campaigns: { bg: '#10B981', border: '#059669', fill: '#ECFDF5', text: '#065F46', light: '#D1FAE5' },
  operations: { bg: '#F59E0B', border: '#D97706', fill: '#FFFBEB', text: '#92400E', light: '#FEF3C7' },
  growth: { bg: '#8B5CF6', border: '#7C3AED', fill: '#F5F3FF', text: '#5B21B6', light: '#EDE9FE' },
  infrastructure: { bg: '#6B7280', border: '#4B5563', fill: '#F9FAFB', text: '#1F2937', light: '#F3F4F6' },
};

const DEFAULT_COLOR = { bg: '#9CA3AF', border: '#6B7280', fill: '#F9FAFB', text: '#374151', light: '#F3F4F6' };

const TYPE_LABELS: Record<string, string> = {
  content_quality: 'Content Quality', content_generation: 'Content Gen', nlp: 'NLP',
  validation: 'Validation', repair: 'Repair', recovery: 'Recovery',
  engagement_analysis: 'Engagement', orchestration: 'Orchestration', scoring: 'Scoring',
  compliance: 'Compliance', monitoring: 'Monitoring', governance: 'Governance', matching: 'Matching',
};

function formatName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface NodePos { x: number; y: number; }

interface AgentOrgChartProps {
  agents: AiAgentRecord[];
}

export default function AgentOrgChart({ agents }: AgentOrgChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedAgent, setSelectedAgent] = useState<AiAgentRecord | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<NodePos>({ x: 0, y: 0 });
  const [positions, setPositions] = useState<Record<string, NodePos>>({});
  const [containerSize, setContainerSize] = useState({ w: 800, h: 500 });

  // Group by department
  const grouped: Record<string, AiAgentRecord[]> = {};
  for (const agent of agents) {
    const dept = agent.department || 'other';
    if (!grouped[dept]) grouped[dept] = [];
    grouped[dept].push(agent);
  }
  const depts = Object.keys(grouped);

  // Initialize positions in a radial layout around center
  useEffect(() => {
    if (agents.length === 0) return;
    const el = containerRef.current;
    const w = el?.clientWidth || 800;
    const h = 520;
    setContainerSize({ w, h });

    const cx = w / 2;
    const cy = h / 2;
    const newPos: Record<string, NodePos> = {};

    // Center node (Ryan)
    newPos['__control_tower__'] = { x: cx, y: cy };

    // Position agents by department in clusters
    const deptAngles: Record<string, number> = {};
    depts.forEach((d, i) => { deptAngles[d] = (i / depts.length) * Math.PI * 2 - Math.PI / 2; });

    for (const dept of depts) {
      const baseAngle = deptAngles[dept];
      const deptAgents = grouped[dept];
      const radius = 180;

      deptAgents.forEach((agent, i) => {
        const spread = 0.4;
        const agentAngle = baseAngle + (i - (deptAgents.length - 1) / 2) * spread;
        newPos[agent.name] = {
          x: cx + Math.cos(agentAngle) * radius + (Math.random() - 0.5) * 20,
          y: cy + Math.sin(agentAngle) * radius + (Math.random() - 0.5) * 20,
        };
      });
    }

    setPositions(newPos);
  }, [agents.length]);

  // Drag handlers
  const handleMouseDown = useCallback((name: string, e: React.MouseEvent) => {
    e.preventDefault();
    const pos = positions[name];
    if (!pos) return;
    setDragging(name);
    setDragOffset({ x: e.clientX - pos.x, y: e.clientY - pos.y });
  }, [positions]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    setPositions(prev => ({
      ...prev,
      [dragging]: { x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y },
    }));
  }, [dragging, dragOffset]);

  const handleMouseUp = useCallback(() => { setDragging(null); }, []);

  const center = positions['__control_tower__'] || { x: containerSize.w / 2, y: containerSize.h / 2 };
  const totalActive = agents.filter(a => a.status === 'active').length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-sm font-semibold text-gray-900">{totalActive} of {agents.length} agents active across {depts.length} departments</span>
        </div>
        <div className="flex gap-1.5">
          {depts.map(d => {
            const c = DEPT_COLORS[d] || DEFAULT_COLOR;
            return (
              <span key={d} className="rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: c.light, color: c.text }}>
                {d} ({grouped[d].length})
              </span>
            );
          })}
        </div>
      </div>

      {/* Network Graph */}
      <div
        ref={containerRef}
        className="relative rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white overflow-hidden select-none"
        style={{ height: containerSize.h }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Connection Lines (SVG) */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
          {agents.map(agent => {
            const pos = positions[agent.name];
            if (!pos) return null;
            const c = DEPT_COLORS[agent.department || ''] || DEFAULT_COLOR;
            return (
              <line
                key={agent.name}
                x1={center.x} y1={center.y}
                x2={pos.x} y2={pos.y}
                stroke={c.bg}
                strokeWidth={1.5}
                strokeOpacity={0.25}
                strokeDasharray={agent.status === 'active' ? 'none' : '4 4'}
              />
            );
          })}
        </svg>

        {/* Central Control Tower Node */}
        <div
          className="absolute flex flex-col items-center justify-center rounded-full bg-gray-900 text-white shadow-xl cursor-grab active:cursor-grabbing"
          style={{
            left: center.x - 38, top: center.y - 38,
            width: 76, height: 76, zIndex: 10,
          }}
          onMouseDown={e => handleMouseDown('__control_tower__', e)}
        >
          <span className="text-lg">&#x1F9E0;</span>
          <span className="text-[9px] font-bold tracking-wide">RYAN</span>
        </div>

        {/* "Human in the Loop" label */}
        <div
          className="absolute text-xs text-gray-400 font-medium text-center pointer-events-none"
          style={{ left: center.x - 50, top: center.y + 44, width: 100, zIndex: 11 }}
        >
          Human in the Loop
        </div>

        {/* Agent Nodes */}
        {agents.map(agent => {
          const pos = positions[agent.name];
          if (!pos) return null;
          const c = DEPT_COLORS[agent.department || ''] || DEFAULT_COLOR;
          const isSelected = selectedAgent?.name === agent.name;
          const abbrev = agent.name.split('_').map(w => w[0]?.toUpperCase()).join('').slice(0, 2);

          return (
            <div
              key={agent.name}
              className={`absolute flex flex-col items-center justify-center rounded-full shadow-md cursor-grab active:cursor-grabbing transition-shadow ${isSelected ? 'ring-2 ring-offset-2' : 'hover:shadow-lg'}`}
              style={{
                left: pos.x - 24, top: pos.y - 24,
                width: 48, height: 48,
                backgroundColor: c.bg,
                borderColor: c.border,
                ringColor: c.border,
                zIndex: dragging === agent.name ? 20 : 5,
              }}
              onMouseDown={e => { e.stopPropagation(); handleMouseDown(agent.name, e); }}
              onClick={() => setSelectedAgent(isSelected ? null : agent)}
              title={formatName(agent.name)}
            >
              <span className="text-white text-xs font-bold">{abbrev}</span>
              {/* Status dot */}
              <div
                className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white"
                style={{ backgroundColor: agent.status === 'active' ? '#10B981' : agent.status === 'error' ? '#EF4444' : '#9CA3AF' }}
              />
            </div>
          );
        })}

        {/* Department Labels */}
        {depts.map(dept => {
          const deptAgents = grouped[dept];
          const avgX = deptAgents.reduce((s, a) => s + (positions[a.name]?.x || 0), 0) / deptAgents.length;
          const avgY = deptAgents.reduce((s, a) => s + (positions[a.name]?.y || 0), 0) / deptAgents.length;
          const c = DEPT_COLORS[dept] || DEFAULT_COLOR;
          if (!avgX) return null;

          // Position label away from center
          const dx = avgX - center.x;
          const dy = avgY - center.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const labelX = center.x + (dx / dist) * (dist + 45);
          const labelY = center.y + (dy / dist) * (dist + 45);

          return (
            <div
              key={dept}
              className="absolute text-xs font-semibold uppercase tracking-wider pointer-events-none"
              style={{ left: labelX - 40, top: labelY - 8, width: 80, textAlign: 'center', color: c.text, zIndex: 2 }}
            >
              {dept}
            </div>
          );
        })}
      </div>

      {/* Selected Agent Detail Card */}
      {selectedAgent && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div
                className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                style={{ backgroundColor: (DEPT_COLORS[selectedAgent.department || ''] || DEFAULT_COLOR).bg }}
              >
                {selectedAgent.name.split('_').map(w => w[0]?.toUpperCase()).join('').slice(0, 2)}
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">{formatName(selectedAgent.name)}</h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{
                      backgroundColor: (DEPT_COLORS[selectedAgent.department || ''] || DEFAULT_COLOR).light,
                      color: (DEPT_COLORS[selectedAgent.department || ''] || DEFAULT_COLOR).text,
                    }}
                  >
                    {TYPE_LABELS[selectedAgent.type] || selectedAgent.type}
                  </span>
                  <span className="text-xs text-gray-400">{selectedAgent.department}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className={`h-2.5 w-2.5 rounded-full ${selectedAgent.status === 'active' ? 'bg-emerald-500' : selectedAgent.status === 'error' ? 'bg-red-500' : 'bg-gray-300'}`} />
              <span className="text-sm font-medium text-gray-700 capitalize">{selectedAgent.status}</span>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium text-gray-400">Trigger</p>
              <p className="mt-0.5 text-sm text-gray-700">{selectedAgent.schedule || 'Not configured'}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-400">Last Run</p>
              <p className="mt-0.5 text-sm text-gray-700">{timeAgo(selectedAgent.last_run_at)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-400">Enabled</p>
              <p className="mt-0.5 text-sm text-gray-700">{selectedAgent.enabled ? 'Yes' : 'No'}</p>
            </div>
          </div>

          {selectedAgent.metrics && typeof selectedAgent.metrics === 'object' && Object.keys(selectedAgent.metrics).length > 0 && (
            <div className="mt-4 border-t border-gray-100 pt-3">
              <p className="text-xs font-medium text-gray-400 mb-2">Latest Metrics</p>
              <div className="flex flex-wrap gap-3">
                {Object.entries(selectedAgent.metrics as Record<string, any>).map(([k, v]) => (
                  <div key={k} className="rounded-md bg-gray-50 px-3 py-1.5">
                    <span className="text-xs text-gray-500">{k.replace(/_/g, ' ')}: </span>
                    <span className="text-xs font-semibold text-gray-700">{typeof v === 'number' ? v.toLocaleString() : String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => setSelectedAgent(null)}
            className="mt-4 text-xs text-gray-400 hover:text-gray-600"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
