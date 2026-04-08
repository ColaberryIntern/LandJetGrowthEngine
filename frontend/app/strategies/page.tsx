'use client';

import { useState, useEffect } from 'react';
import { getCampaigns, updateCampaignPrompt, createStrategy } from '@/lib/api';

interface Strategy {
  id: string;
  name: string;
  status: string;
  ai_system_prompt: string | null;
}

export default function StrategiesPage() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [promptValue, setPromptValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  // New strategy form
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPrompt, setNewPrompt] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const res = await getCampaigns() as { campaigns: Strategy[]; total: number };
        setStrategies(res.campaigns);
      } catch {}
      setLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  function handleEdit(s: Strategy) {
    setEditingId(s.id);
    setPromptValue(s.ai_system_prompt || '');
    setFlash(null);
  }

  async function handleSave(id: string) {
    const trimmed = promptValue.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await updateCampaignPrompt(id, trimmed);
      setStrategies(prev => prev.map(s => s.id === id ? { ...s, ai_system_prompt: trimmed } : s));
      setEditingId(null);
      setFlash(id);
      setTimeout(() => setFlash(null), 3000);
    } catch {}
    setSaving(false);
  }

  async function handleCreate() {
    if (!newName.trim() || !newPrompt.trim()) return;
    setCreating(true);
    try {
      const res = await createStrategy(newName.trim(), newPrompt.trim());
      setStrategies(prev => [...prev, { id: res.strategy.id, name: res.strategy.name, status: 'active', ai_system_prompt: res.strategy.prompt }]);
      setNewName('');
      setNewPrompt('');
      setShowNew(false);
    } catch {}
    setCreating(false);
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Messaging Strategies</h1>
        <p className="mt-4 text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Messaging Strategies</h1>
          <p className="mt-1 text-sm text-gray-500">Each strategy defines the AI prompt used to generate outreach emails</p>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {strategies.map(s => (
          <div key={s.id} className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">{s.name}</p>
                <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                  s.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {s.status === 'active' ? 'Active' : s.status}
                </span>
              </div>
              {flash === s.id && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Saved</span>
              )}
            </div>

            {editingId === s.id ? (
              <div className="mt-3">
                <textarea
                  value={promptValue}
                  onChange={e => setPromptValue(e.target.value)}
                  rows={4}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                />
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => handleSave(s.id)}
                    disabled={saving || !promptValue.trim()}
                    className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="rounded-md px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3">
                {s.ai_system_prompt ? (
                  <p className="rounded-md bg-gray-50 p-3 text-sm text-gray-600">{s.ai_system_prompt}</p>
                ) : (
                  <p className="text-sm text-gray-400 italic">No prompt set</p>
                )}
                <button
                  onClick={() => handleEdit(s)}
                  className="mt-2 text-sm font-medium text-gray-500 hover:text-gray-900"
                >
                  Edit Prompt
                </button>
              </div>
            )}
          </div>
        ))}

        {strategies.length === 0 && (
          <div className="text-center text-sm text-gray-400 py-8">
            No strategies yet. Create one to get started.
          </div>
        )}
      </div>

      {showNew ? (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5">
          <p className="font-medium text-gray-900">New Strategy</p>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Strategy name (e.g., Manufacturing Outreach)"
            className="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
          />
          <textarea
            value={newPrompt}
            onChange={e => setNewPrompt(e.target.value)}
            placeholder="AI prompt for this strategy..."
            rows={4}
            className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim() || !newPrompt.trim()}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create Strategy'}
            </button>
            <button
              onClick={() => { setShowNew(false); setNewName(''); setNewPrompt(''); }}
              className="rounded-md px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowNew(true)}
          className="mt-6 w-full rounded-lg border border-dashed border-gray-300 py-3 text-sm font-medium text-gray-500 hover:border-gray-400 hover:text-gray-700"
        >
          + Add Strategy
        </button>
      )}
    </div>
  );
}
