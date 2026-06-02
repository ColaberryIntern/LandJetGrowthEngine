'use client';

import { useEffect, useState } from 'react';
import { ensureAuth } from '@/lib/auth';

type Method = 'paste' | 'manual';

interface TrailStep {
  phase: string;
  explanation: string;
  inputs: Record<string, unknown>;
  output: { label: string; amount: number } | null;
  running_total: number;
}

interface QuoteLine { label: string; amount: number; note?: string; }
interface QuoteOutput {
  market: string;
  customer_category: string;
  service_type: string;
  pricing_mode: string;
  lines: QuoteLine[];
  subtotal: number;
  secondary_total: number;
  third_total: number;
  grand_total: number;
  warnings: string[];
  approvals_needed: string[];
  forward_to?: string[];
  forward_reason?: string;
}

interface MarginResult {
  configured: boolean;
  total_revenue: number;
  total_cost: number;
  margin_amount: number;
  margin_pct: number;
  band: 'green' | 'amber' | 'red';
  approval: 'auto' | 'reservation_desk' | 'ryan';
  cost_breakdown: { label: string; amount: number }[];
}

interface MapInfo {
  origin: string | null;
  destination: string | null;
  round_trip: boolean;
  embed_url: string | null;
  configured: boolean;
}

interface TestResponse {
  method: Method;
  parse_error: string | null;
  parsed_trip: any;
  input: any;
  quote: QuoteOutput;
  trail: TrailStep[];
  margin: MarginResult;
  map?: MapInfo;
}

interface DistanceInfo {
  miles: number;
  duration_min: number;
  embed_url: string | null;
}

interface Sample { name: string; email_body: string; category?: string; blurb?: string; }

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const MARKETS = [
  { value: 'quad_cities', label: 'Quad Cities' },
  { value: 'des_moines', label: 'Des Moines' },
  { value: 'dallas', label: 'Dallas' },
  { value: 'san_antonio', label: 'San Antonio' },
  { value: 'omaha', label: 'Omaha' },
  { value: 'austin', label: 'Austin' },
  { value: 'kansas_city', label: 'Kansas City (forward-only)' },
];

const CUSTOMER_CATEGORIES = [
  { value: 'standard', label: 'Standard' },
  { value: 'jd_employee', label: 'JD Employee' },
  { value: 'jd_shuttle', label: 'JD Shuttle' },
  { value: 'lockton_employee', label: 'Lockton Employee' },
  { value: 'investor', label: 'Investor' },
  { value: 'lj_member', label: 'LJ Member' },
];

export default function QuoteTesterPage() {
  const [method, setMethod] = useState<Method>('paste');
  const [emailBody, setEmailBody] = useState('');
  const [samples, setSamples] = useState<Sample[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Manual form
  const [market, setMarket] = useState('quad_cities');
  const [serviceType, setServiceType] = useState('one_way');
  const [passengerMiles, setPassengerMiles] = useState(250);
  const [deadlegMiles, setDeadlegMiles] = useState(0);
  const [customerCategory, setCustomerCategory] = useState('standard');
  const [payment, setPayment] = useState('credit_card');

  // Google Maps -- address lookup + distance auto-fill (manual mode only)
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [distanceInfo, setDistanceInfo] = useState<DistanceInfo | null>(null);
  const [distanceLoading, setDistanceLoading] = useState(false);
  const [distanceError, setDistanceError] = useState<string | null>(null);

  async function fetchDistance() {
    if (!pickup.trim() || !dropoff.trim()) return;
    setDistanceLoading(true);
    setDistanceError(null);
    try {
      const r = await fetch('/api/admin/quotes/distance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          origin: pickup.trim(),
          destination: dropoff.trim(),
          round_trip: serviceType === 'round_trip',
        }),
      });
      const data = await r.json();
      if (data.error) {
        setDistanceError(data.error);
        // Even on error, an embed URL may still be available if the key is set
        if (data.embed_url) setDistanceInfo({ miles: 0, duration_min: 0, embed_url: data.embed_url });
        return;
      }
      const info: DistanceInfo = { miles: data.miles, duration_min: data.duration_min, embed_url: data.embed_url };
      setDistanceInfo(info);
      // Auto-fill passenger miles -- round trip doubles for billing purposes
      const billedMiles = serviceType === 'round_trip' ? Math.round(info.miles * 2) : Math.round(info.miles);
      setPassengerMiles(billedMiles);
    } catch (e) {
      setDistanceError((e as Error).message);
    } finally {
      setDistanceLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      await ensureAuth();
      try {
        const r = await fetch('/api/admin/quotes/samples', { headers: authHeaders() });
        if (r.ok) setSamples(await r.json());
      } catch {}
    })();
  }, []);

  async function runQuote() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const body = method === 'paste'
        ? { method, email_body: emailBody }
        : {
            method,
            quote_input: {
              market, service_type: serviceType,
              passenger_miles: Number(passengerMiles) || 0,
              deadleg_miles: Number(deadlegMiles) || 0,
              customer_category: customerCategory === 'standard' ? undefined : customerCategory,
              payment,
            },
            pickup_address: pickup.trim() || undefined,
            dropoff_address: dropoff.trim() || undefined,
          };
      const r = await fetch('/api/admin/quotes/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const errBody = await r.json().catch(() => ({}));
        throw new Error(errBody.error || `Status ${r.status}`);
      }
      setResult(await r.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const fmt = (n: number) => '$' + n.toFixed(2);

  const bandClasses = {
    green: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    red: 'bg-red-50 border-red-200 text-red-800',
  };
  const bandLabel = {
    green: 'Auto-approve (60%+ margin)',
    amber: 'Reservation desk review (50-60% margin)',
    red: 'Ryan approval required (<50% margin)',
  };
  const bandIcon = { green: '✓', amber: '!', red: '×' };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Quote Tester</h1>
          <p className="mt-1 text-sm text-gray-500">Paste an inbound email or enter trip details manually. See the full pricing engine breakdown, margin, and approval routing.</p>
        </div>
        <span className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 border border-blue-200">v1 internal</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* LEFT: input */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="mb-3 flex gap-2">
              <button onClick={() => setMethod('paste')}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${method === 'paste' ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}>
                Paste email
              </button>
              <button onClick={() => setMethod('manual')}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${method === 'manual' ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}>
                Manual entry
              </button>
            </div>

            {method === 'paste' ? (
              <>
                <label className="block text-xs font-medium text-gray-600 mb-1">BookRides email body</label>
                <textarea value={emailBody} onChange={e => setEmailBody(e.target.value)} rows={10}
                  placeholder="Paste the full BookRides email body (Office, Service Type, Pickup, Dropoff, Distance, Passengers, Customer)…"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs font-mono focus:border-gray-500 focus:outline-none" />
              </>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Market</label>
                    <select value={market} onChange={e => setMarket(e.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm">
                      {MARKETS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Service type</label>
                    <select value={serviceType} onChange={e => setServiceType(e.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm">
                      <option value="one_way">One-way</option>
                      <option value="round_trip">Round-trip</option>
                      <option value="hourly_local">Hourly local</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Pickup address</label>
                    <input type="text" value={pickup} onChange={e => setPickup(e.target.value)}
                      placeholder="e.g. 123 Main St, Davenport, IA"
                      className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Dropoff address</label>
                    <input type="text" value={dropoff} onChange={e => setDropoff(e.target.value)}
                      placeholder="e.g. O'Hare Airport, Chicago, IL"
                      className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
                  </div>
                  <button type="button" onClick={fetchDistance} disabled={!pickup.trim() || !dropoff.trim() || distanceLoading}
                    className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                    {distanceLoading ? 'Looking up…' : (distanceInfo ? `Auto-filled: ${distanceInfo.miles} mi (${distanceInfo.duration_min} min via Google)` : '↗ Auto-fill mileage from addresses (Google)')}
                  </button>
                  {distanceError && (
                    <div className="text-[11px] text-amber-700 leading-snug">{distanceError}</div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Passenger miles</label>
                    <input type="number" value={passengerMiles} onChange={e => setPassengerMiles(Number(e.target.value))}
                      className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Dead-leg miles</label>
                    <input type="number" value={deadlegMiles} onChange={e => setDeadlegMiles(Number(e.target.value))}
                      className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Customer category</label>
                    <select value={customerCategory} onChange={e => setCustomerCategory(e.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm">
                      {CUSTOMER_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Payment</label>
                    <select value={payment} onChange={e => setPayment(e.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm">
                      <option value="credit_card">Credit card</option>
                      <option value="check">Check</option>
                      <option value="invoice">Invoice</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Generate button + error appear IMMEDIATELY -- no scrolling */}
            <button onClick={runQuote} disabled={loading || (method === 'paste' && !emailBody.trim())}
              className="mt-4 w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? 'Calculating…' : 'Generate quote'}
            </button>

            {error && (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>
            )}

            {/* Samples list BELOW the button so the Generate button is always above the fold */}
            {method === 'paste' && samples.length > 0 && (
              <div className="mt-5 pt-4 border-t border-gray-200">
                <div className="text-xs text-gray-500 mb-1.5">Try a sample (click to load):</div>
                <div className="space-y-1.5">
                  {samples.map(s => (
                    <button key={s.name} onClick={() => setEmailBody(s.email_body)}
                      className="w-full text-left rounded-md border border-gray-200 bg-gray-50 px-2.5 py-2 hover:bg-gray-100 hover:border-gray-300 transition-colors">
                      <div className="flex items-center gap-2">
                        {s.category && (
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wider ${
                            s.category === 'real' ? 'bg-emerald-100 text-emerald-700' :
                            s.category === 'flat_rate' ? 'bg-blue-100 text-blue-700' :
                            s.category === 'distance' ? 'bg-gray-200 text-gray-700' :
                            s.category === 'customer_category' ? 'bg-purple-100 text-purple-700' :
                            s.category === 'forward_only' ? 'bg-amber-100 text-amber-700' :
                            s.category === 'surcharge' ? 'bg-orange-100 text-orange-700' :
                            s.category === 'hourly' ? 'bg-cyan-100 text-cyan-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>{s.category.replace('_', ' ')}</span>
                        )}
                        <span className="text-xs font-medium text-gray-900">{s.name}</span>
                      </div>
                      {s.blurb && <div className="text-[11px] text-gray-500 mt-1 leading-snug">{s.blurb}</div>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: output */}
        <div className="lg:col-span-3 space-y-4">
          {!result && !loading && (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-10 text-center">
              <div className="text-gray-500 text-sm">Enter trip details on the left to see a full quote breakdown.</div>
            </div>
          )}

          {result && (
            <>
              {/* HERO: total + margin */}
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 rounded-lg border border-gray-200 bg-white p-5">
                  <div className="text-xs font-medium uppercase tracking-wider text-gray-500">Grand total</div>
                  <div className="mt-1 text-4xl font-bold text-gray-900">{fmt(result.quote.grand_total)}</div>
                  <div className="mt-2 flex gap-2 text-xs text-gray-600">
                    <span className="rounded-md bg-gray-100 px-2 py-0.5">{result.quote.pricing_mode.replace('_', ' ')}</span>
                    <span className="rounded-md bg-gray-100 px-2 py-0.5">{result.quote.customer_category.replace('_', ' ')}</span>
                    <span className="rounded-md bg-gray-100 px-2 py-0.5">{result.quote.market.replace('_', ' ')}</span>
                  </div>
                </div>
                <div className={`rounded-lg border p-5 ${bandClasses[result.margin.band]}`}>
                  <div className="text-xs font-medium uppercase tracking-wider opacity-75">Margin</div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-3xl font-bold">{result.margin.margin_pct}%</span>
                    <span className="text-sm opacity-75">{fmt(result.margin.margin_amount)}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 text-xs font-medium">
                    <span className="text-base">{bandIcon[result.margin.band]}</span>
                    <span>{bandLabel[result.margin.band]}</span>
                  </div>
                  {!result.margin.configured && (
                    <div className="mt-2 text-[10px] opacity-60">Using placeholder cost inputs — calibrate once Ryan provides actuals.</div>
                  )}
                </div>
              </div>

              {/* ROUTE MAP -- Google Embed Directions, auto-fits both endpoints */}
              {result.map?.embed_url && (
                <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-gray-700">Route</div>
                      <div className="mt-0.5 text-xs text-gray-500">
                        {result.map.origin} <span className="text-gray-400">→</span> {result.map.destination}
                        {result.map.round_trip && <span className="text-gray-400"> → {result.map.origin} <span className="ml-1 rounded bg-blue-50 text-blue-700 px-1.5 py-0.5 text-[10px] font-medium border border-blue-200">round trip</span></span>}
                      </div>
                    </div>
                  </div>
                  <iframe
                    src={result.map.embed_url}
                    title="Route map"
                    width="100%"
                    height="320"
                    style={{ border: 0, display: 'block' }}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    allowFullScreen
                  />
                </div>
              )}
              {result.map && !result.map.embed_url && result.map.origin && result.map.destination && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  Map unavailable — {result.map.configured ? 'addresses could not be embedded.' : 'GOOGLE_MAPS_API_KEY is not configured on the server.'}
                </div>
              )}

              {/* WARNINGS */}
              {result.quote.warnings.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-amber-900 mb-2">Concierge alerts</div>
                  <ul className="space-y-1 text-xs text-amber-900">
                    {result.quote.warnings.map((w, i) => <li key={i}>• {w}</li>)}
                  </ul>
                </div>
              )}

              {/* CALCULATION TRAIL */}
              <div className="rounded-lg border border-gray-200 bg-white">
                <div className="border-b border-gray-200 px-5 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-700">How this quote was built</div>
                </div>
                <div className="divide-y divide-gray-100">
                  {result.trail.map((step, i) => (
                    <div key={i} className="px-5 py-3 grid grid-cols-12 items-start gap-3">
                      <div className="col-span-3">
                        <div className="text-sm font-medium text-gray-900">{step.phase}</div>
                        {step.output && (
                          <div className="mt-0.5 text-xs text-gray-500">{step.output.label}</div>
                        )}
                      </div>
                      <div className="col-span-7 text-xs text-gray-600 leading-relaxed">{step.explanation}</div>
                      <div className="col-span-2 text-right">
                        {step.output && (
                          <>
                            <div className="text-sm font-semibold text-gray-900">{step.output.amount >= 0 ? '+ ' : ''}{fmt(step.output.amount)}</div>
                            <div className="text-[10px] text-gray-400">running {fmt(step.running_total)}</div>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="rounded-b-lg border-t-2 border-gray-900 bg-gray-50 px-5 py-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-900">Grand total</span>
                  <span className="text-lg font-bold text-gray-900">{fmt(result.quote.grand_total)}</span>
                </div>
              </div>

              {/* COST + MARGIN BREAKDOWN */}
              <div className="rounded-lg border border-gray-200 bg-white p-5">
                <div className="text-xs font-semibold uppercase tracking-wider text-gray-700 mb-3">Cost + margin breakdown</div>
                <div className="space-y-1.5 text-sm">
                  {result.margin.cost_breakdown.map((c, i) => (
                    <div key={i} className="flex justify-between text-gray-700">
                      <span>{c.label}</span>
                      <span className="font-mono">{fmt(c.amount)}</span>
                    </div>
                  ))}
                  <div className="border-t border-gray-200 pt-1.5 flex justify-between text-gray-900 font-semibold">
                    <span>Total estimated cost</span>
                    <span className="font-mono">{fmt(result.margin.total_cost)}</span>
                  </div>
                  <div className="flex justify-between text-gray-900">
                    <span>Revenue (grand total)</span>
                    <span className="font-mono">{fmt(result.margin.total_revenue)}</span>
                  </div>
                  <div className={`mt-2 flex justify-between font-bold rounded-md px-3 py-2 ${bandClasses[result.margin.band]}`}>
                    <span>Projected margin</span>
                    <span className="font-mono">{fmt(result.margin.margin_amount)} ({result.margin.margin_pct}%)</span>
                  </div>
                </div>
              </div>

              {/* PARSED TRIP (when paste mode) */}
              {result.parsed_trip && (
                <div className="rounded-lg border border-gray-200 bg-white p-5">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-700 mb-3">Parsed from email</div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-700">
                    {Object.entries(result.parsed_trip).filter(([, v]) => v != null && v !== '').map(([k, v]) => (
                      <div key={k}>
                        <span className="text-gray-500">{k}:</span>{' '}
                        <span className="font-mono">{String(v).slice(0, 60)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
