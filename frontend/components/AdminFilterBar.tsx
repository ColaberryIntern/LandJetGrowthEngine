'use client';

import { useEffect, useRef, useState } from 'react';

export type CommType = 'email' | 'linkedin' | 'sms';

export interface AdminFilters {
  // 2026-06-14 refactor: replaced the 3-value `territory` enum with an
  // N-state array so the model scales to per-location ownership (Percy TX,
  // Iowa owner IA, future owners +). Empty / missing = sees all.
  states?: string[];
  city?: string;
  campaign_id?: string;
  comm_type?: CommType;
}

interface CampaignOption { id: string; name: string; }

export type ChipName = 'states' | 'city' | 'campaign' | 'channel';

interface Props {
  value: AdminFilters;
  onChange: (next: AdminFilters) => void;
  // When true, the states chip is read-only. Set for non-admin users so they
  // cannot escape their scope from the UI. (Backend enforcement is still the
  // source of truth -- see listLeads + getLeadsForToday.)
  lockStates?: boolean;
  // Chips to hide on this surface. E.g. the Outreach today queue does not
  // filter by channel (each step has its own channel), so hide it.
  hiddenChips?: ChipName[];
}

const COMM_TYPES: CommType[] = ['email', 'linkedin', 'sms'];

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchDistinct(field: 'state' | 'city', state?: string): Promise<string[]> {
  const qs = new URLSearchParams({ field });
  if (state) qs.set('state', state);
  const r = await fetch(`/api/admin/leads/distinct?${qs.toString()}`, { headers: authHeaders() });
  if (!r.ok) return [];
  const data = await r.json() as { values: string[] };
  return data.values;
}

async function fetchCampaigns(): Promise<CampaignOption[]> {
  const r = await fetch('/api/admin/campaigns', { headers: authHeaders() });
  if (!r.ok) return [];
  const data = await r.json() as { campaigns: CampaignOption[] };
  return (data.campaigns || []).map(c => ({ id: c.id, name: c.name }));
}

interface ChipProps {
  label: string;
  value: string | undefined;
  active: boolean;
  onOpen: () => void;
  onClear: () => void;
  disabled?: boolean;
}

function Chip({ label, value, active, onOpen, onClear, disabled }: ChipProps) {
  return (
    <div className={`relative inline-flex items-center rounded-full border text-xs ${
      value
        ? 'border-blue-300 bg-blue-50 text-blue-900'
        : 'border-gray-300 bg-white text-gray-700'
    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
      <button type="button" disabled={disabled} onClick={onOpen}
        className={`px-3 py-1.5 ${active ? 'ring-2 ring-blue-300 ring-offset-1 rounded-full' : ''} ${disabled ? '' : 'hover:bg-blue-100'}`}>
        <span className="font-medium">{label}</span>
        {value && <span className="ml-1.5 text-blue-700">{value}</span>}
        {!value && <span className="ml-1 text-gray-400">+</span>}
      </button>
      {value && !disabled && (
        <button type="button" onClick={onClear} className="pr-2 text-gray-500 hover:text-red-600" aria-label={`Clear ${label}`}>
          &times;
        </button>
      )}
    </div>
  );
}

interface DropdownProps {
  options: { value: string; label: string }[];
  onPick: (value: string) => void;
  onClose: () => void;
  searchable?: boolean;
}

function Dropdown({ options, onPick, onClose, searchable }: DropdownProps) {
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [onClose]);

  const filtered = q
    ? options.filter(o => o.label.toLowerCase().includes(q.toLowerCase()))
    : options;

  return (
    <div ref={ref} className="absolute left-0 top-full z-40 mt-1 w-64 max-h-72 overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
      {searchable && (
        <div className="sticky top-0 border-b border-gray-100 bg-white p-2">
          <input autoFocus type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Search…"
            className="w-full rounded border border-gray-300 px-2 py-1 text-xs" />
        </div>
      )}
      {filtered.length === 0 ? (
        <div className="px-3 py-2 text-xs text-gray-500">No matches.</div>
      ) : (
        <ul className="py-1">
          {filtered.map(o => (
            <li key={o.value}>
              <button type="button" onClick={() => { onPick(o.value); onClose(); }}
                className="block w-full px-3 py-1.5 text-left text-xs text-gray-800 hover:bg-blue-50">
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface StatesPopoverProps {
  available: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  onClose: () => void;
}

function StatesPopover({ available, selected, onChange, onClose }: StatesPopoverProps) {
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [onClose]);

  const filtered = q ? available.filter(s => s.toLowerCase().includes(q.toLowerCase())) : available;

  function toggle(s: string) {
    const upper = s.trim().toUpperCase();
    if (selected.includes(upper)) {
      onChange(selected.filter(x => x !== upper));
    } else {
      onChange([...selected, upper]);
    }
  }

  return (
    <div ref={ref} className="absolute left-0 top-full z-40 mt-1 w-72 max-h-80 overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
      <div className="sticky top-0 border-b border-gray-100 bg-white p-2">
        <input autoFocus type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Search states…"
          className="w-full rounded border border-gray-300 px-2 py-1 text-xs" />
        {selected.length > 0 && (
          <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
            <span>{selected.length} selected: {selected.join(', ')}</span>
            <button type="button" onClick={() => onChange([])} className="text-red-600 hover:text-red-800">Clear</button>
          </div>
        )}
      </div>
      {filtered.length === 0 ? (
        <div className="px-3 py-2 text-xs text-gray-500">No matches.</div>
      ) : (
        <ul className="py-1">
          {filtered.map(s => {
            const upper = s.trim().toUpperCase();
            const isOn = selected.includes(upper);
            return (
              <li key={s}>
                <button type="button" onClick={() => toggle(s)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-blue-50 ${isOn ? 'bg-blue-50 text-blue-900' : 'text-gray-800'}`}>
                  <span className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${isOn ? 'border-blue-600 bg-blue-600' : 'border-gray-300 bg-white'}`}>
                    {isOn && <span className="text-white text-[10px] leading-none">✓</span>}
                  </span>
                  <span>{s}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="border-t border-gray-100 bg-gray-50 px-3 py-2 text-right">
        <button type="button" onClick={onClose} className="text-xs text-gray-600 hover:text-gray-900">Done</button>
      </div>
    </div>
  );
}

function statesLabel(selected: string[] | undefined): string | undefined {
  if (!selected || selected.length === 0) return undefined;
  if (selected.length <= 2) return selected.join(', ');
  return `${selected[0]}, ${selected[1]} +${selected.length - 2}`;
}

export default function AdminFilterBar({ value, onChange, lockStates, hiddenChips = [] }: Props) {
  const hidden = new Set<ChipName>(hiddenChips);
  const [open, setOpen] = useState<'states' | 'city' | 'campaign' | 'comm' | null>(null);
  const [availableStates, setAvailableStates] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);

  useEffect(() => { fetchDistinct('state').then(setAvailableStates); }, []);
  useEffect(() => { fetchCampaigns().then(setCampaigns); }, []);
  useEffect(() => {
    // City list is scoped to the FIRST selected state. With multiple states, the
    // city chip falls back to "all cities matching any selected state" is too
    // expensive in N round-trips, so we keep the simple behavior: scoped to
    // selected[0] when there is exactly one; unscoped when 0 or many.
    const states = value.states ?? [];
    const scope = states.length === 1 ? states[0] : undefined;
    fetchDistinct('city', scope).then(setCities);
  }, [value.states]);

  function setStates(next: string[]) {
    onChange({ ...value, states: next, city: undefined });
  }
  function setField<K extends keyof AdminFilters>(key: K, next: AdminFilters[K] | undefined) {
    onChange({ ...value, [key]: next });
  }

  const statesValue = statesLabel(value.states);
  const campaignName = campaigns.find(c => c.id === value.campaign_id)?.name;

  return (
    <div className="relative flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
      <span className="text-xs font-medium text-gray-500 mr-1">Filters:</span>

      {!hidden.has('states') && <div className="relative">
        <Chip label="States" value={statesValue} active={open === 'states'}
          onOpen={() => setOpen(open === 'states' ? null : 'states')}
          onClear={() => setStates([])}
          disabled={lockStates}
        />
        {open === 'states' && (
          <StatesPopover available={availableStates} selected={value.states ?? []}
            onChange={setStates} onClose={() => setOpen(null)} />
        )}
      </div>}

      {!hidden.has('city') && <div className="relative">
        <Chip label="City" value={value.city} active={open === 'city'}
          onOpen={() => setOpen(open === 'city' ? null : 'city')}
          onClear={() => setField('city', undefined)}
          disabled={cities.length === 0}
        />
        {open === 'city' && (
          <Dropdown options={cities.map(c => ({ value: c, label: c }))} onPick={v => setField('city', v)}
            onClose={() => setOpen(null)} searchable />
        )}
      </div>}

      {!hidden.has('campaign') && <div className="relative">
        <Chip label="Campaign" value={campaignName} active={open === 'campaign'}
          onOpen={() => setOpen(open === 'campaign' ? null : 'campaign')}
          onClear={() => setField('campaign_id', undefined)}
        />
        {open === 'campaign' && (
          <Dropdown options={campaigns.map(c => ({ value: c.id, label: c.name }))}
            onPick={v => setField('campaign_id', v)} onClose={() => setOpen(null)} searchable />
        )}
      </div>}

      {!hidden.has('channel') && <div className="relative">
        <Chip label="Channel" value={value.comm_type} active={open === 'comm'}
          onOpen={() => setOpen(open === 'comm' ? null : 'comm')}
          onClear={() => setField('comm_type', undefined)}
        />
        {open === 'comm' && (
          <Dropdown options={COMM_TYPES.map(c => ({ value: c, label: c }))}
            onPick={v => setField('comm_type', v as CommType)} onClose={() => setOpen(null)} />
        )}
      </div>}
    </div>
  );
}
