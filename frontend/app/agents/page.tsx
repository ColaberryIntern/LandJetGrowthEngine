'use client';

import { useState, useEffect } from 'react';
import { getAgents, type AiAgentRecord } from '@/lib/api';
import AgentOrgChart from '@/components/AgentOrgChart';

export default function AgentsPage() {
  const [agents, setAgents] = useState<AiAgentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchAgents() {
    try {
      const res = await getAgents();
      setAgents(res.agents || []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { fetchAgents(); }, []);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI Agent Team</h1>
          <p className="mt-1 text-sm text-gray-500">Your AI workforce operating across all departments</p>
        </div>
        <button
          onClick={() => { setLoading(true); fetchAgents(); }}
          disabled={loading}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
            <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-gray-900 border-t-transparent" />
            <p className="mt-3 text-sm text-gray-500">Loading agents...</p>
          </div>
        ) : agents.length > 0 ? (
          <AgentOrgChart agents={agents} />
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-400">
            No agents registered
          </div>
        )}
      </div>
    </div>
  );
}
