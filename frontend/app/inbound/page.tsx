'use client';

import { useState, useEffect } from 'react';
import {
  scanInboundInquiries, generateQuoteResponse, sendInboundResponse, login,
  type InboundInquiry, type QuoteResponseBody,
} from '@/lib/api';

async function ensureAuth() {
  if (typeof window === 'undefined') return;
  const existing = localStorage.getItem('token');
  if (existing) {
    try { const p = JSON.parse(atob(existing.split('.')[1])); if (p.exp * 1000 > Date.now()) return; } catch {}
    localStorage.removeItem('token');
  }
  try { const r = await login('admin@landjet.com', 'Admin123!'); localStorage.setItem('token', r.token); } catch {}
}

const TYPE_COLORS: Record<string, string> = {
  quote_request: 'bg-emerald-100 text-emerald-700',
  service_inquiry: 'bg-blue-100 text-blue-700',
  partnership_inquiry: 'bg-purple-100 text-purple-700',
  lead_referral: 'bg-amber-100 text-amber-700',
  investor_inquiry: 'bg-indigo-100 text-indigo-700',
  deal_opportunity: 'bg-rose-100 text-rose-700',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 1) return 'Just now';
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function InboundPage() {
  const [inquiries, setInquiries] = useState<InboundInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftSubject, setDraftSubject] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [draftMeta, setDraftMeta] = useState<QuoteResponseBody | null>(null);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  async function fetchInquiries() {
    await ensureAuth();
    setLoading(true);
    try {
      const res = await scanInboundInquiries(72);
      setInquiries(res.inquiries || []);
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
  }

  useEffect(() => { fetchInquiries(); }, []);

  async function handleSelect(inquiry: InboundInquiry) {
    setSelectedId(inquiry.gmail_id);
    setGenerating(true);
    setError(null);
    try {
      const res = await generateQuoteResponse({
        name: inquiry.from_name,
        email: inquiry.from_email,
        message: inquiry.body,
      });
      setDraftSubject(res.subject);
      setDraftBody(res.body);
      setDraftMeta(res);
    } catch (e) {
      setError((e as Error).message);
    }
    setGenerating(false);
  }

  async function handleSend() {
    const inquiry = inquiries.find(i => i.gmail_id === selectedId);
    if (!inquiry) return;
    setSending(true);
    try {
      // Forward-only mode (KC): send to forward_to recipients instead of original sender
      if (draftMeta?.pricing_mode === 'forward_only' && draftMeta.forward_to?.length) {
        for (const recipient of draftMeta.forward_to) {
          await sendInboundResponse(recipient, draftSubject, draftBody);
        }
      } else {
        await sendInboundResponse(inquiry.from_email, draftSubject, draftBody);
      }
      setSent(prev => new Set([...prev, inquiry.gmail_id]));
      setSelectedId(null);
      setDraftSubject('');
      setDraftBody('');
      setDraftMeta(null);
    } catch (e) {
      setError((e as Error).message);
    }
    setSending(false);
  }

  const selected = inquiries.find(i => i.gmail_id === selectedId);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inbound Inquiries</h1>
          <p className="mt-1 text-sm text-gray-500">Quote requests and service inquiries from email</p>
        </div>
        <button onClick={fetchInquiries} disabled={loading}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          {loading ? 'Scanning...' : 'Scan Emails'}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Inquiry List */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-3">
            {loading ? 'Scanning...' : `${inquiries.length} Inquiries Found`}
          </h2>
          <div className="space-y-3">
            {inquiries.length === 0 && !loading && (
              <div className="rounded-lg border-2 border-dashed border-gray-200 p-8 text-center">
                <p className="text-sm text-gray-500">No inquiries found</p>
                <p className="mt-1 text-xs text-gray-400">Scanning rlandry@landjet.com inbox for quote requests and business inquiries</p>
              </div>
            )}
            {inquiries.map(inquiry => (
              <div
                key={inquiry.gmail_id}
                onClick={() => !sent.has(inquiry.gmail_id) && handleSelect(inquiry)}
                className={`rounded-lg border bg-white p-4 cursor-pointer transition-all ${
                  selectedId === inquiry.gmail_id ? 'border-gray-900 ring-1 ring-gray-900' :
                  sent.has(inquiry.gmail_id) ? 'border-emerald-200 bg-emerald-50 opacity-60' :
                  'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900 text-sm truncate">{inquiry.from_name || inquiry.from_email}</p>
                      {sent.has(inquiry.gmail_id) && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Replied</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate">{inquiry.subject}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[inquiry.type] || 'bg-gray-100 text-gray-500'}`}>
                      {inquiry.type?.replace(/_/g, ' ') || 'inquiry'}
                    </span>
                    <span className="text-xs text-gray-400">{timeAgo(inquiry.received_at)}</span>
                  </div>
                </div>
                <p className="mt-2 text-xs text-gray-500 line-clamp-2">{inquiry.summary || inquiry.body.slice(0, 120)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Response Draft */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-3">Response</h2>
          {!selected ? (
            <div className="rounded-lg border-2 border-dashed border-gray-200 p-8 text-center">
              <p className="text-sm text-gray-500">Select an inquiry to generate a response</p>
              <p className="mt-1 text-xs text-gray-400">AI will draft a reply based on the inquiry content</p>
            </div>
          ) : generating ? (
            <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
              <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-gray-900 border-t-transparent" />
              <p className="mt-3 text-sm text-gray-500">Generating response for {selected.from_name}...</p>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
              {/* Pricing engine status banner */}
              {draftMeta?.pricing_mode === 'priced' && draftMeta.quote_summary && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Auto-priced by engine</span>
                    <span className="text-xs text-emerald-600">{draftMeta.market?.replace(/_/g, ' ')} • {draftMeta.quote_summary.customer_category.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-xs text-emerald-600">Subtotal</span>
                      <div className="font-semibold text-emerald-900">${draftMeta.quote_summary.subtotal.toFixed(2)}</div>
                    </div>
                    <div>
                      <span className="text-xs text-emerald-600">Grand Total</span>
                      <div className="font-semibold text-emerald-900">${draftMeta.quote_summary.grand_total.toFixed(2)}</div>
                    </div>
                  </div>
                  {draftMeta.quote_summary.warnings.length > 0 && (
                    <div className="mt-2 text-xs text-amber-700">
                      <span className="font-medium">Warnings:</span> {draftMeta.quote_summary.warnings.join('; ')}
                    </div>
                  )}
                  {draftMeta.quote_summary.approvals_needed.length > 0 && (
                    <div className="mt-1 text-xs text-rose-700">
                      <span className="font-medium">Needs approval:</span> {draftMeta.quote_summary.approvals_needed.join('; ')}
                    </div>
                  )}
                </div>
              )}
              {draftMeta?.pricing_mode === 'forward_only' && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-amber-700">Forward to local team</div>
                  <p className="mt-1 text-sm text-amber-900">{draftMeta.forward_reason}</p>
                  <p className="mt-2 text-xs text-amber-700">
                    <span className="font-medium">Sending to:</span> {draftMeta.forward_to?.join(', ')}
                  </p>
                </div>
              )}
              {draftMeta?.pricing_mode === 'manual' && (
                <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-600">Manual draft</div>
                  <p className="mt-1 text-xs text-gray-600">No structured pricing detected. AI drafted a generic response; concierge to review and add quote details.</p>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-gray-400">To</label>
                  <span className="text-xs text-gray-500">
                    {draftMeta?.pricing_mode === 'forward_only' && draftMeta.forward_to?.length
                      ? draftMeta.forward_to.join(', ')
                      : selected.from_email}
                  </span>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400">Subject</label>
                <input
                  type="text"
                  value={draftSubject}
                  onChange={e => setDraftSubject(e.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 focus:border-gray-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400">Body</label>
                <textarea
                  value={draftBody}
                  onChange={e => setDraftBody(e.target.value)}
                  rows={10}
                  className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-600 focus:border-gray-400 focus:outline-none resize-y"
                />
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <button onClick={() => { setSelectedId(null); setDraftSubject(''); setDraftBody(''); setDraftMeta(null); }}
                  className="rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
                <button onClick={handleSend} disabled={sending || !draftSubject || !draftBody}
                  className={`rounded-md px-5 py-2 text-sm font-medium text-white disabled:opacity-50 ${
                    draftMeta?.pricing_mode === 'forward_only'
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : 'bg-gray-900 hover:bg-gray-800'
                  }`}>
                  {sending ? 'Sending...' :
                    draftMeta?.pricing_mode === 'forward_only' ? 'Forward to Local Team' : 'Send Response'}
                </button>
              </div>
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-medium text-gray-400 mb-1">Original Inquiry</p>
                <div className="rounded bg-gray-50 p-3">
                  <p className="text-xs text-gray-600 font-medium">{selected.subject}</p>
                  <p className="mt-1 text-xs text-gray-500 whitespace-pre-wrap">{selected.body}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
