'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { type AiAgentRecord, getAgentRunHistory, type AgentRunRecord } from '@/lib/api';

const DEPT_COLORS: Record<string, { bg: string; text: string; light: string; label: string }> = {
  outreach: { bg: '#3B82F6', text: '#1E40AF', light: '#DBEAFE', label: 'Outreach' },
  campaigns: { bg: '#10B981', text: '#065F46', light: '#D1FAE5', label: 'Campaigns' },
  operations: { bg: '#F59E0B', text: '#92400E', light: '#FEF3C7', label: 'Operations' },
  growth: { bg: '#8B5CF6', text: '#5B21B6', light: '#EDE9FE', label: 'Growth' },
  infrastructure: { bg: '#6B7280', text: '#1F2937', light: '#F3F4F6', label: 'Infrastructure' },
  orchestration: { bg: '#111827', text: '#FFFFFF', light: '#374151', label: 'Control Tower' },
};
const DEFAULT_COLOR = { bg: '#9CA3AF', text: '#374151', light: '#F3F4F6', label: 'Other' };

const TYPE_LABELS: Record<string, string> = {
  content_quality: 'Content Quality', content_generation: 'Content Gen', nlp: 'NLP',
  validation: 'Validation', repair: 'Repair', recovery: 'Recovery',
  engagement_analysis: 'Engagement', orchestration: 'Orchestration', scoring: 'Scoring',
  compliance: 'Compliance', monitoring: 'Monitoring', governance: 'Governance', matching: 'Matching',
};

function formatName(n: string) { return n.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }
function timeAgo(d: string | null) {
  if (!d) return 'Never';
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return 'Just now'; if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

interface Pos { x: number; y: number; }

// Department cluster anchor positions
const DEPT_ANCHORS: Record<string, Pos> = {
  outreach: { x: 160, y: 130 },
  operations: { x: 640, y: 130 },
  campaigns: { x: 640, y: 390 },
  growth: { x: 160, y: 390 },
  infrastructure: { x: 400, y: 470 },
};

export default function AgentOrgChart({ agents }: { agents: AiAgentRecord[] }) {
  const [positions, setPositions] = useState<Record<string, Pos>>({});
  const [homePositions, setHomePositions] = useState<Record<string, Pos>>({});
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<Pos>({ x: 0, y: 0 });
  const [selectedAgent, setSelectedAgent] = useState<AiAgentRecord | null>(null);
  const [runHistory, setRunHistory] = useState<AgentRunRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const grouped: Record<string, AiAgentRecord[]> = {};
  for (const a of agents) { const d = a.department || 'other'; if (!grouped[d]) grouped[d] = []; grouped[d].push(a); }
  const depts = Object.keys(grouped).filter(d => d !== 'orchestration');
  const controlTower = agents.find(a => a.name === 'ai_control_tower');

  // Initialize positions
  useEffect(() => {
    if (agents.length === 0) return;
    const p: Record<string, Pos> = {};
    p['__hitl__'] = { x: 60, y: 50 };
    p['__ct__'] = { x: 400, y: 260 };

    for (const dept of depts) {
      const anchor = DEPT_ANCHORS[dept] || { x: 400, y: 260 };
      const da = grouped[dept].filter(a => a.name !== 'ai_control_tower');
      da.forEach((a, i) => {
        const angle = (i / Math.max(da.length, 1)) * Math.PI * 2 - Math.PI / 2;
        const r = 45 + da.length * 8;
        p[a.name] = { x: anchor.x + Math.cos(angle) * r, y: anchor.y + Math.sin(angle) * r };
      });
    }
    setPositions(p);
    setHomePositions({ ...p });
  }, [agents.length]);

  // Snap back animation on release
  useEffect(() => {
    if (dragging) return;
    let frame: number;
    let iterations = 0;
    function snap() {
      if (iterations > 15) return;
      iterations++;
      setPositions(prev => {
        const next = { ...prev };
        let moved = false;
        for (const key of Object.keys(homePositions)) {
          if (key === '__hitl__' || key === '__ct__') continue;
          const cur = next[key]; const home = homePositions[key];
          if (!cur || !home) continue;
          const dx = home.x - cur.x; const dy = home.y - cur.y;
          if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
            next[key] = { x: cur.x + dx * 0.2, y: cur.y + dy * 0.2 };
            moved = true;
          }
        }
        if (moved) frame = requestAnimationFrame(snap);
        return next;
      });
    }
    const timeout = setTimeout(() => { frame = requestAnimationFrame(snap); }, 50);
    return () => { clearTimeout(timeout); cancelAnimationFrame(frame); };
  }, [dragging, homePositions]);

  // Pull connected nodes when dragging
  useEffect(() => {
    if (!dragging || dragging === '__hitl__' || dragging === '__ct__') return;
    const interval = setInterval(() => {
      setPositions(prev => {
        const draggedPos = prev[dragging]; if (!draggedPos) return prev;
        const next = { ...prev };
        const agent = agents.find(a => a.name === dragging);
        const dept = agent?.department || '';
        const sameGroup = (grouped[dept] || []).filter(a => a.name !== dragging && a.name !== 'ai_control_tower');
        for (const a of sameGroup) {
          const ap = next[a.name]; if (!ap) continue;
          const dx = draggedPos.x - ap.x; const dy = draggedPos.y - ap.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 60) { next[a.name] = { x: ap.x + dx * 0.03, y: ap.y + dy * 0.03 }; }
        }
        return next;
      });
    }, 25);
    return () => clearInterval(interval);
  }, [dragging]);

  const onDown = useCallback((name: string, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const p = positions[name]; if (!p) return;
    setDragging(name);
    setDragOffset({ x: e.clientX - p.x, y: e.clientY - p.y });
  }, [positions]);
  const onMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    setPositions(prev => ({ ...prev, [dragging]: { x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y } }));
  }, [dragging, dragOffset]);
  const onUp = useCallback(() => setDragging(null), []);

  async function clickAgent(agent: AiAgentRecord) {
    if (selectedAgent?.name === agent.name) { setSelectedAgent(null); return; }
    setSelectedAgent(agent);
    setLoadingHistory(true);
    try { const r = await getAgentRunHistory(agent.name, 30); setRunHistory(r.runs || []); } catch { setRunHistory([]); }
    setLoadingHistory(false);
  }

  const ct = positions['__ct__'] || { x: 400, y: 260 };
  const hitl = positions['__hitl__'] || { x: 60, y: 50 };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-sm font-semibold text-gray-900">{agents.filter(a => a.status === 'active').length} of {agents.length} agents active</span>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {depts.map(d => {
            const c = DEPT_COLORS[d] || DEFAULT_COLOR;
            return <span key={d} className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: c.light, color: c.text }}>{c.label} ({grouped[d].length})</span>;
          })}
        </div>
      </div>

      {/* Canvas */}
      <div className="relative rounded-xl border border-gray-200 bg-gradient-to-br from-slate-50 via-white to-slate-50 overflow-hidden select-none" style={{ height: 540 }}
        onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}>

        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
          {/* HITL to CT */}
          <line x1={hitl.x} y1={hitl.y} x2={ct.x} y2={ct.y} stroke="#111827" strokeWidth={2} strokeOpacity={0.25} strokeDasharray="6 3" />
          {/* CT to each agent */}
          {agents.filter(a => a.name !== 'ai_control_tower').map(a => {
            const p = positions[a.name]; if (!p) return null;
            return <line key={a.name} x1={ct.x} y1={ct.y} x2={p.x} y2={p.y} stroke={(DEPT_COLORS[a.department || ''] || DEFAULT_COLOR).bg} strokeWidth={1} strokeOpacity={0.15} />;
          })}
          {/* Intra-dept connections */}
          {depts.map(dept => {
            const da = grouped[dept].filter(a => a.name !== 'ai_control_tower');
            return da.map((a, i) => {
              const b = da[(i + 1) % da.length]; const p1 = positions[a.name]; const p2 = positions[b.name];
              if (!p1 || !p2 || da.length < 2) return null;
              return <line key={`${a.name}-${b.name}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={(DEPT_COLORS[dept] || DEFAULT_COLOR).bg} strokeWidth={0.7} strokeOpacity={0.12} />;
            });
          })}
        </svg>

        {/* Dept Labels */}
        {depts.map(dept => {
          const anchor = DEPT_ANCHORS[dept]; if (!anchor) return null;
          const c = DEPT_COLORS[dept] || DEFAULT_COLOR;
          const r = 45 + (grouped[dept].length || 1) * 8;
          return <div key={`lbl-${dept}`} className="absolute pointer-events-none" style={{ left: anchor.x - 40, top: anchor.y - r - 18, width: 80, textAlign: 'center', zIndex: 3 }}>
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: c.text }}>{c.label}</span>
          </div>;
        })}

        {/* HITL */}
        <div className="absolute flex flex-col items-center justify-center rounded-xl bg-white border-2 border-gray-300 shadow-md cursor-grab active:cursor-grabbing"
          style={{ left: hitl.x - 32, top: hitl.y - 22, width: 64, height: 44, zIndex: 10 }}
          onMouseDown={e => onDown('__hitl__', e)}>
          <span className="text-sm">&#128100;</span>
          <span className="text-[7px] font-bold text-gray-600">RYAN (HITL)</span>
        </div>

        {/* Control Tower */}
        <div className="absolute flex flex-col items-center justify-center rounded-full bg-gray-900 text-white shadow-xl cursor-grab active:cursor-grabbing"
          style={{ left: ct.x - 38, top: ct.y - 38, width: 76, height: 76, zIndex: 10 }}
          onMouseDown={e => onDown('__ct__', e)}
          onClick={() => controlTower && clickAgent(controlTower)}>
          <span className="text-lg">&#x1F3EF;</span>
          <span className="text-[8px] font-bold tracking-wider">AI CONTROL</span>
          <span className="text-[7px] opacity-70">TOWER</span>
        </div>

        {/* Agent Nodes */}
        {agents.filter(a => a.name !== 'ai_control_tower').map(agent => {
          const pos = positions[agent.name]; if (!pos) return null;
          const c = DEPT_COLORS[agent.department || ''] || DEFAULT_COLOR;
          const isSel = selectedAgent?.name === agent.name;
          const ab = agent.name.split('_').map(w => w[0]?.toUpperCase()).join('').slice(0, 2);
          return (
            <div key={agent.name}
              className={`absolute flex items-center justify-center rounded-full shadow-md cursor-grab active:cursor-grabbing transition-transform ${isSel ? 'scale-125 ring-2 ring-offset-2 ring-gray-400' : 'hover:scale-110 hover:shadow-lg'}`}
              style={{ left: pos.x - 21, top: pos.y - 21, width: 42, height: 42, backgroundColor: c.bg, zIndex: dragging === agent.name ? 20 : 5 }}
              onMouseDown={e => onDown(agent.name, e)}
              onClick={() => clickAgent(agent)}
              title={formatName(agent.name)}>
              <span className="text-white text-[10px] font-bold">{ab}</span>
              <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white"
                style={{ backgroundColor: agent.status === 'active' ? '#10B981' : agent.status === 'error' ? '#EF4444' : '#9CA3AF' }} />
            </div>
          );
        })}
      </div>

      {/* Detail + History Panel */}
      {selectedAgent && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                  style={{ backgroundColor: (DEPT_COLORS[selectedAgent.department || ''] || DEFAULT_COLOR).bg }}>
                  {selectedAgent.name.split('_').map(w => w[0]?.toUpperCase()).join('').slice(0, 2)}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{formatName(selectedAgent.name)}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: (DEPT_COLORS[selectedAgent.department || ''] || DEFAULT_COLOR).light, color: (DEPT_COLORS[selectedAgent.department || ''] || DEFAULT_COLOR).text }}>
                      {TYPE_LABELS[selectedAgent.type] || selectedAgent.type}
                    </span>
                    <span className="text-xs text-gray-400">{selectedAgent.department}</span>
                  </div>
                </div>
              </div>
              <button onClick={() => { setSelectedAgent(null); setRunHistory([]); }} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div><p className="text-xs text-gray-400">Trigger</p><p className="text-sm text-gray-700">{selectedAgent.schedule || 'Not configured'}</p></div>
              <div><p className="text-xs text-gray-400">Last Run</p><p className="text-sm text-gray-700">{timeAgo(selectedAgent.last_run_at)}</p></div>
              <div><p className="text-xs text-gray-400">Status</p>
                <div className="flex items-center gap-1.5"><div className={`h-2 w-2 rounded-full ${selectedAgent.status === 'active' ? 'bg-emerald-500' : 'bg-gray-300'}`} /><span className="text-sm capitalize">{selectedAgent.status}</span></div>
              </div>
            </div>
          </div>
          <div className="p-5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Run History</h4>
            {loadingHistory ? (
              <div className="text-center py-6"><div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" /></div>
            ) : runHistory.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">No runs recorded yet. Runs are logged automatically when this agent executes.</p>
            ) : (
              <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
                {runHistory.map(run => (
                  <div key={run.id} className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs ${run.status === 'success' ? 'bg-emerald-50' : run.status === 'failed' ? 'bg-red-50' : 'bg-gray-50'}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`h-2 w-2 rounded-full flex-shrink-0 ${run.status === 'success' ? 'bg-emerald-500' : run.status === 'failed' ? 'bg-red-500' : 'bg-gray-400'}`} />
                      <span className={`font-medium ${run.status === 'success' ? 'text-emerald-700' : run.status === 'failed' ? 'text-red-700' : 'text-gray-600'}`}>{run.status}</span>
                      {run.details && typeof run.details === 'object' && Object.keys(run.details).length > 0 && (
                        <span className="text-gray-400 truncate">{Object.entries(run.details as Record<string, any>).map(([k, v]) => `${k}: ${v}`).join(', ')}</span>
                      )}
                      {run.error_message && <span className="text-red-400 truncate">{run.error_message}</span>}
                    </div>
                    <span className="text-gray-400 whitespace-nowrap ml-2">{timeAgo(run.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
