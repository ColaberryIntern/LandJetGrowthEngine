# AI Agent Network Visualization -- Implementation Guide

A reusable pattern for building interactive agent org-chart visualizations in any Next.js / React project.

---

## Overview

This creates an interactive network graph that displays AI agents grouped by department, connected to a central "AI Control Tower" node, with a "Human in the Loop" (HITL) node off to the side. Agents are draggable with spring physics -- pulling one drags its department mates along, and they snap back on release. Clicking any agent shows a detail card with run history.

![Agent Network Screenshot](screenshot reference -- see /system page)

---

## Architecture

```
Database (ai_agents table)
  |
  v
GET /api/admin/agents  -->  Returns all agents with: name, type, department, schedule, status, last_run_at, metrics
  |
  v
AgentOrgChart Component (React, client-side)
  |
  ├── Groups agents by department
  ├── Positions nodes in department clusters
  ├── Renders SVG connection lines
  ├── Handles drag with spring physics
  └── On click: fetches GET /api/admin/agents/:name/history --> shows run log
```

---

## Data Model

### 1. Agent Registry Table (`ai_agents`)

```sql
CREATE TABLE ai_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) UNIQUE NOT NULL,
  type VARCHAR(100) NOT NULL,           -- e.g. 'content_generation', 'orchestration', 'nlp'
  department VARCHAR(100),              -- e.g. 'outreach', 'campaigns', 'operations', 'growth'
  status VARCHAR(20) DEFAULT 'active',  -- 'active' | 'paused' | 'disabled' | 'error'
  config JSONB,
  schedule VARCHAR(255),                -- Human-readable trigger: 'Every 15 min' or 'Triggered when draft generated'
  last_run_at TIMESTAMP,
  metrics JSONB,                        -- Latest run metrics
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 2. Agent Run History Table (`agent_runs`)

```sql
CREATE TABLE agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'success',  -- 'success' | 'failed' | 'skipped'
  duration_ms INTEGER,
  details JSONB,                    -- What the agent did: { leads_scored: 25, tone: 'shorter' }
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_agent_runs_name_created ON agent_runs (agent_name, created_at);
```

### 3. Special Nodes (Not in DB, rendered by frontend)

- **AI Control Tower**: A real agent in the DB with `department: 'orchestration'`, rendered as the large central black node
- **HITL (Human in the Loop)**: A virtual node (not in DB), rendered as a white card in the top-left corner, connected only to the Control Tower

---

## API Endpoints

### List All Agents
```
GET /api/admin/agents
Response: { agents: AgentRecord[], total: number }
```

### Get Agent Run History
```
GET /api/admin/agents/:name/history?limit=30
Response: { runs: AgentRunRecord[], total: number }
```

### Record Agent Run (called from backend services)
```typescript
// In your service code, after an agent executes:
import { recordAgentRun } from '../intelligence/agents/agentRegistry';

// On success:
recordAgentRun('draft_writer', { leads_drafted: 5 }).catch(() => {});

// On failure:
recordAgentRun('scheduler_engine', { error: 'timeout' }, 'failed', 'Connection timed out').catch(() => {});
```

---

## Frontend Component: AgentOrgChart

### Props

```typescript
interface AgentOrgChartProps {
  agents: AiAgentRecord[];  // Array of all agents from the API
}
```

### Department Configuration

```typescript
const DEPT_COLORS: Record<string, { bg: string; text: string; light: string; label: string }> = {
  outreach:       { bg: '#3B82F6', text: '#1E40AF', light: '#DBEAFE', label: 'Outreach' },
  campaigns:      { bg: '#10B981', text: '#065F46', light: '#D1FAE5', label: 'Campaigns' },
  operations:     { bg: '#F59E0B', text: '#92400E', light: '#FEF3C7', label: 'Operations' },
  growth:         { bg: '#8B5CF6', text: '#5B21B6', light: '#EDE9FE', label: 'Growth' },
  infrastructure: { bg: '#6B7280', text: '#1F2937', light: '#F3F4F6', label: 'Infrastructure' },
  orchestration:  { bg: '#111827', text: '#FFFFFF', light: '#374151', label: 'Control Tower' },
};
```

### Department Cluster Positions

Each department has a fixed anchor point on the canvas. Agents are positioned radially around their department's anchor.

```typescript
const DEPT_ANCHORS: Record<string, { x: number; y: number }> = {
  outreach:       { x: 160, y: 130 },   // Top-left area
  operations:     { x: 640, y: 130 },   // Top-right area
  campaigns:      { x: 640, y: 390 },   // Bottom-right area
  growth:         { x: 160, y: 390 },   // Bottom-left area
  infrastructure: { x: 400, y: 470 },   // Bottom-center
};

// Control Tower is always center: { x: 400, y: 260 }
// HITL is always top-left corner: { x: 60, y: 50 }
```

### Agent Positioning Algorithm

```typescript
// For each department, arrange agents in a circle around the anchor:
for (const dept of departments) {
  const anchor = DEPT_ANCHORS[dept];
  const agents = grouped[dept];
  agents.forEach((agent, i) => {
    const angle = (i / agents.length) * Math.PI * 2 - Math.PI / 2;
    const radius = 45 + agents.length * 8;  // Radius grows with dept size
    positions[agent.name] = {
      x: anchor.x + Math.cos(angle) * radius,
      y: anchor.y + Math.sin(angle) * radius,
    };
  });
}
```

---

## Rendering Layers (Z-Index Order)

The visualization is built with overlapping layers inside a relative-positioned container:

```
Layer 1 (z-index: 1)  -- SVG lines (connections)
Layer 2 (z-index: 2)  -- Department labels (text only, pointer-events: none)
Layer 3 (z-index: 5)  -- Agent nodes (colored circles, draggable)
Layer 4 (z-index: 10) -- Control Tower + HITL nodes (always on top)
Layer 5 (z-index: 20) -- Currently dragged node (highest)
```

### SVG Connection Lines

Three types of connections, all rendered in a single `<svg>` overlay:

```tsx
<svg className="absolute inset-0 w-full h-full pointer-events-none">
  {/* 1. HITL to Control Tower -- dashed gray line */}
  <line x1={hitl.x} y1={hitl.y} x2={ct.x} y2={ct.y}
    stroke="#111827" strokeWidth={2} strokeOpacity={0.25} strokeDasharray="6 3" />

  {/* 2. Control Tower to each agent -- dept-colored, very faint */}
  {agents.map(a => (
    <line x1={ct.x} y1={ct.y} x2={pos.x} y2={pos.y}
      stroke={deptColor} strokeWidth={1} strokeOpacity={0.15} />
  ))}

  {/* 3. Intra-department connections -- ring connecting agents within a dept */}
  {deptAgents.map((a, i) => {
    const next = deptAgents[(i + 1) % deptAgents.length];
    return <line x1={a.x} y1={a.y} x2={next.x} y2={next.y}
      stroke={deptColor} strokeWidth={0.7} strokeOpacity={0.12} />;
  })}
</svg>
```

### Node Types

**HITL Node (Ryan):**
```tsx
<div className="rounded-xl bg-white border-2 border-gray-300 shadow-md"
  style={{ width: 64, height: 44 }}>
  👤 RYAN (HITL)
</div>
```

**Control Tower Node:**
```tsx
<div className="rounded-full bg-gray-900 text-white shadow-xl"
  style={{ width: 76, height: 76 }}>
  🏯 AI CONTROL TOWER
</div>
```

**Agent Node:**
```tsx
<div className="rounded-full shadow-md"
  style={{ width: 42, height: 42, backgroundColor: deptColor }}>
  <span className="text-white text-[10px] font-bold">{abbreviation}</span>
  {/* Status dot: bottom-right corner */}
  <div className="h-2.5 w-2.5 rounded-full border-2 border-white"
    style={{ backgroundColor: status === 'active' ? '#10B981' : '#9CA3AF' }} />
</div>
```

**Abbreviation logic:** `agent.name.split('_').map(w => w[0].toUpperCase()).join('').slice(0, 2)`
- `draft_writer` → `DW`
- `campaign_qa` → `CQ`
- `email_polisher` → `EP`

---

## Drag & Spring Physics

### Drag Implementation

```typescript
const [dragging, setDragging] = useState<string | null>(null);
const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

// On mouse down on a node:
function onDown(name: string, e: MouseEvent) {
  setDragging(name);
  setDragOffset({ x: e.clientX - positions[name].x, y: e.clientY - positions[name].y });
}

// On mouse move (on the container):
function onMove(e: MouseEvent) {
  if (!dragging) return;
  setPositions(prev => ({
    ...prev,
    [dragging]: { x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y }
  }));
}

// On mouse up:
function onUp() { setDragging(null); }
```

### Spring Pull (Same-Department Agents Follow)

While dragging, an interval runs every 25ms that pulls same-department agents toward the dragged node:

```typescript
useEffect(() => {
  if (!dragging) return;
  const interval = setInterval(() => {
    setPositions(prev => {
      const draggedPos = prev[dragging];
      const next = { ...prev };
      // Find agents in same department
      for (const agent of sameDeptAgents) {
        const ap = next[agent.name];
        const dx = draggedPos.x - ap.x;
        const dy = draggedPos.y - ap.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 60) {
          // Pull 3% toward dragged position per tick
          next[agent.name] = { x: ap.x + dx * 0.03, y: ap.y + dy * 0.03 };
        }
      }
      return next;
    });
  }, 25);
  return () => clearInterval(interval);
}, [dragging]);
```

### Snap Back (On Release)

When the user releases, nodes animate back to their home positions:

```typescript
useEffect(() => {
  if (dragging) return;  // Only snap when NOT dragging
  let frame;
  let iterations = 0;
  function snap() {
    if (iterations > 15) return;  // Stop after 15 frames
    iterations++;
    setPositions(prev => {
      const next = { ...prev };
      let moved = false;
      for (const key of Object.keys(homePositions)) {
        const cur = next[key];
        const home = homePositions[key];
        const dx = home.x - cur.x;
        const dy = home.y - cur.y;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          // Ease 20% toward home per frame
          next[key] = { x: cur.x + dx * 0.2, y: cur.y + dy * 0.2 };
          moved = true;
        }
      }
      if (moved) frame = requestAnimationFrame(snap);
      return next;
    });
  }
  setTimeout(() => { frame = requestAnimationFrame(snap); }, 50);
  return () => cancelAnimationFrame(frame);
}, [dragging]);
```

---

## Click → Detail Card + Run History

When a user clicks an agent node:

1. Set `selectedAgent` state to the clicked agent
2. Fetch run history: `GET /api/admin/agents/:name/history?limit=30`
3. Render detail panel below the graph

### Detail Panel Structure

```
┌─────────────────────────────────────────┐
│ [Color Circle] Agent Name               │
│ [Type Badge] [Department]        [×]    │
│                                         │
│ Trigger: Every 15 min on weekdays       │
│ Last Run: 8m ago                        │
│ Status: ● Active                        │
├─────────────────────────────────────────┤
│ RUN HISTORY                             │
│ ● success  leads_scored: 25     3m ago  │
│ ● success  leads_scored: 20     8m ago  │
│ ● failed   Connection timeout   23m ago │
│ ● success  leads_scored: 18     38m ago │
│ ● success  leads_scored: 22     53m ago │
│ ...                                     │
└─────────────────────────────────────────┘
```

Run history rows are color-coded:
- `success` → green background (`bg-emerald-50`)
- `failed` → red background (`bg-red-50`)
- `skipped` → gray background (`bg-gray-50`)

---

## Recording Agent Runs (Backend Wiring)

Every agent should call `recordAgentRun()` when it executes. This logs to both the `agent_runs` history table AND updates `last_run_at` on the agent record.

### Where to Add Tracking

```typescript
// In your service file, after the agent's work is done:
import { recordAgentRun } from '../intelligence/agents/agentRegistry';

// Example: after generating an AI draft
async function generateDraft(lead) {
  const draft = await callOpenAI(...);
  recordAgentRun('draft_writer', { lead_id: lead.id }).catch(() => {});
  return draft;
}

// Example: after a scheduled job runs
async function runHealthScan() {
  try {
    const results = await scanCampaigns();
    recordAgentRun('health_scanner', { campaigns_scanned: results.length }).catch(() => {});
  } catch (error) {
    recordAgentRun('health_scanner', null, 'failed', error.message).catch(() => {});
  }
}
```

The `.catch(() => {})` ensures agent tracking never crashes the main flow.

---

## Adapting for Another Project

### Step 1: Create the two database tables
Copy the `ai_agents` and `agent_runs` schemas above.

### Step 2: Register your agents
```typescript
await registerAgent({
  name: 'your_agent_name',
  type: 'your_type',
  department: 'your_department',
  schedule: 'Human-readable trigger description',
  enabled: true,
});
```

### Step 3: Define your departments
Update `DEPT_COLORS` and `DEPT_ANCHORS` for your project's department structure. The visualization auto-adapts to any number of departments.

### Step 4: Wire recordAgentRun
Add `recordAgentRun('agent_name', { ...details })` calls wherever your agents execute.

### Step 5: Drop in the component
```tsx
<AgentOrgChart agents={agentsFromAPI} />
```

### Step 6: Customize
- Change the Control Tower icon/label
- Change the HITL label (could be any human operator)
- Adjust `DEPT_ANCHORS` positions for your layout
- Adjust the canvas height (default 540px)
- Add more fields to the detail card

---

## File References (LandJet Implementation)

| File | Purpose |
|------|---------|
| `src/models/AiAgent.ts` | Agent registry model |
| `src/models/AgentRun.ts` | Run history model |
| `src/intelligence/agents/agentRegistry.ts` | registerAgent, recordAgentRun, getAgentRunHistory |
| `src/routes/admin/agentRoutes.ts` | API endpoints for agents + history |
| `frontend/components/AgentOrgChart.tsx` | The visualization component |
| `frontend/lib/api.ts` | Frontend API functions (getAgents, getAgentRunHistory) |
| `frontend/app/system/page.tsx` | Page that renders AgentOrgChart |
| `migrations/20260416000001-create-agent-runs.js` | Migration for run history table |

---

## Dependencies

- **React 18+** with hooks (useState, useEffect, useCallback, useRef)
- **Next.js** (or any React framework with client components)
- **Tailwind CSS** for styling
- **No external visualization libraries** -- pure HTML/CSS/SVG with React state management
- **No canvas** -- uses absolutely positioned divs + SVG overlay for lines
