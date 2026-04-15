'use client';

import { useState, useEffect } from 'react';
import {
  getQADashboard,
  getQACampaigns,
  runQACycle,
  getTestSuiteInfo,
  type QADashboard,
  type CampaignQADetail,
  type QAResult,
} from '../../lib/api';

const QA_COLORS: Record<string, string> = {
  passed: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  untested: 'bg-gray-100 text-gray-500',
  degraded: 'bg-amber-100 text-amber-700',
};

const HEALTH_COLORS: Record<string, string> = {
  healthy: 'bg-emerald-100 text-emerald-700',
  degraded: 'bg-amber-100 text-amber-700',
  critical: 'bg-red-100 text-red-700',
  unknown: 'bg-gray-100 text-gray-500',
};

function healthScoreColor(score: number | null): string {
  if (score === null) return 'text-gray-400';
  if (score >= 80) return 'text-emerald-600';
  if (score >= 60) return 'text-amber-600';
  return 'text-red-600';
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

export default function QAPage() {
  const [tab, setTab] = useState<'campaigns' | 'agents' | 'tests'>('campaigns');
  const [dashboard, setDashboard] = useState<QADashboard | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignQADetail[]>([]);
  const [testSuite, setTestSuite] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState<QAResult[] | null>(null);
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [d, c, t] = await Promise.all([
          getQADashboard(),
          getQACampaigns(),
          getTestSuiteInfo(),
        ]);
        setDashboard(d);
        setCampaigns((c as any).campaigns || []);
        setTestSuite(t);
      } catch {}
      setLoading(false);
    }
    load();
  }, []);

  async function handleRunScan() {
    setScanning(true);
    setScanResults(null);
    try {
      const res = await runQACycle();
      setScanResults(res.results);
      // Refresh dashboard and campaigns after scan
      const [d, c] = await Promise.all([getQADashboard(), getQACampaigns()]);
      setDashboard(d);
      setCampaigns((c as any).campaigns || []);
    } catch {}
    setScanning(false);
  }

  const totalCampaigns = dashboard
    ? dashboard.qa_status_counts.passed + dashboard.qa_status_counts.failed + dashboard.qa_status_counts.untested
    : 0;
  const healthyPct = dashboard && (dashboard.health_counts.healthy + dashboard.health_counts.degraded + dashboard.health_counts.critical + dashboard.health_counts.unknown) > 0
    ? Math.round((dashboard.health_counts.healthy / (dashboard.health_counts.healthy + dashboard.health_counts.degraded + dashboard.health_counts.critical + dashboard.health_counts.unknown)) * 100)
    : 0;
  const totalAgentFixes = dashboard
    ? dashboard.agent_activity.email_retries + dashboard.agent_activity.voice_fallbacks + dashboard.agent_activity.bounce_cleanups + dashboard.agent_activity.self_healing_retries
    : 0;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Testing &amp; Quality Assurance</h1>
      <p className="mt-1 text-sm text-gray-500">Campaign quality, health monitoring, and agent activity</p>

      {/* Stats Row */}
      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">QA Passed</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-600">
            {dashboard ? `${dashboard.qa_status_counts.passed}/${totalCampaigns}` : '...'}
          </p>
          <p className="mt-1 text-xs text-gray-400">active campaigns</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">System Health</p>
          <p className={`mt-1 text-2xl font-semibold ${healthyPct >= 80 ? 'text-emerald-600' : healthyPct >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
            {dashboard ? `${healthyPct}%` : '...'}
          </p>
          <p className="mt-1 text-xs text-gray-400">campaigns healthy</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Unresolved Errors</p>
          <p className={`mt-1 text-2xl font-semibold ${(dashboard?.error_summary.unresolved ?? 0) > 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {dashboard?.error_summary.unresolved ?? '...'}
          </p>
          <p className="mt-1 text-xs text-gray-400">{dashboard?.error_summary.today ?? 0} today</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Agent Fixes (24h)</p>
          <p className="mt-1 text-2xl font-semibold text-blue-600">
            {dashboard ? totalAgentFixes : '...'}
          </p>
          <p className="mt-1 text-xs text-gray-400">auto-repairs</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex gap-1 border-b border-gray-200">
        {([
          { key: 'campaigns' as const, label: 'Campaign QA' },
          { key: 'agents' as const, label: 'Agent Activity' },
          { key: 'tests' as const, label: 'Test Suite' },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="mt-4">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading...</div>
        ) : tab === 'campaigns' ? (
          <CampaignQATab
            campaigns={campaigns}
            scanning={scanning}
            scanResults={scanResults}
            expandedCampaign={expandedCampaign}
            onRunScan={handleRunScan}
            onToggleExpand={(id) => setExpandedCampaign(expandedCampaign === id ? null : id)}
          />
        ) : tab === 'agents' ? (
          <AgentActivityTab activity={dashboard?.agent_activity} errorSummary={dashboard?.error_summary} />
        ) : (
          <TestSuiteTab testSuite={testSuite} />
        )}
      </div>
    </div>
  );
}

// --- Campaign QA Tab ---

function CampaignQATab({
  campaigns, scanning, scanResults, expandedCampaign, onRunScan, onToggleExpand,
}: {
  campaigns: CampaignQADetail[];
  scanning: boolean;
  scanResults: QAResult[] | null;
  expandedCampaign: string | null;
  onRunScan: () => void;
  onToggleExpand: (id: string) => void;
}) {
  const scanResultMap = new Map(scanResults?.map(r => [r.campaignId, r]) || []);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{campaigns.length} active campaign{campaigns.length !== 1 ? 's' : ''}</p>
        <button
          onClick={onRunScan}
          disabled={scanning}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {scanning ? 'Scanning...' : 'Run QA Scan'}
        </button>
      </div>

      {/* Scan Results Banner */}
      {scanResults && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-sm font-medium text-blue-800">
            Scan complete: {scanResults.filter(r => r.status === 'passed').length} passed,{' '}
            {scanResults.filter(r => r.status === 'failed').length} failed,{' '}
            {scanResults.filter(r => r.status === 'degraded').length} degraded
          </p>
        </div>
      )}

      {campaigns.length === 0 ? (
        <div className="p-8 text-center text-sm text-gray-400">No active campaigns</div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-5 py-3">Campaign</th>
                <th className="px-5 py-3">QA Status</th>
                <th className="px-5 py-3">Health</th>
                <th className="px-5 py-3">Errors</th>
                <th className="px-5 py-3">Leads</th>
                <th className="px-5 py-3">Last Scan</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map(c => {
                const result = scanResultMap.get(c.id);
                return (
                  <Fragment key={c.id}>
                    <tr
                      className="border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer"
                      onClick={() => onToggleExpand(c.id)}
                    >
                      <td className="px-5 py-3 font-medium text-gray-900">{c.name}</td>
                      <td className="px-5 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${QA_COLORS[c.qa_status] || QA_COLORS.untested}`}>
                          {c.qa_status}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        {c.health_score !== null ? (
                          <span className="flex items-center gap-2">
                            <span className={`text-sm font-semibold ${healthScoreColor(c.health_score)}`}>{c.health_score}</span>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${HEALTH_COLORS[c.health_status || 'unknown']}`}>
                              {c.health_status}
                            </span>
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">No data</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {c.unresolved_errors > 0 ? (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">{c.unresolved_errors}</span>
                        ) : (
                          <span className="text-xs text-gray-400">0</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-gray-500">{c.active_leads.toLocaleString()}</td>
                      <td className="px-5 py-3 text-xs text-gray-400">{timeAgo(c.last_scan_at)}</td>
                    </tr>
                    {expandedCampaign === c.id && (
                      <tr className="bg-gray-50/50">
                        <td colSpan={6} className="px-5 py-3">
                          {result ? (
                            <div>
                              <p className="text-sm font-medium text-gray-700 mb-2">
                                QA Score: <span className={healthScoreColor(result.score)}>{result.score}/100</span>
                              </p>
                              {result.issues.length > 0 ? (
                                <ul className="space-y-1">
                                  {result.issues.map((issue, i) => (
                                    <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                                      <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-red-400 flex-shrink-0" />
                                      {issue}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-sm text-emerald-600">All checks passed</p>
                              )}
                            </div>
                          ) : (
                            <p className="text-sm text-gray-400">Run a QA scan to see detailed results for this campaign</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Need Fragment import
import { Fragment } from 'react';

// --- Agent Activity Tab ---

function AgentActivityTab({
  activity,
  errorSummary,
}: {
  activity?: QADashboard['agent_activity'];
  errorSummary?: QADashboard['error_summary'];
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-3">Auto-Repair Activity (Last 24 Hours)</h3>
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-500">Email Retries</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{activity?.email_retries ?? '...'}</p>
            <p className="mt-1 text-xs text-gray-400">Failed emails re-queued</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-500">Voice Fallbacks</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{activity?.voice_fallbacks ?? '...'}</p>
            <p className="mt-1 text-xs text-gray-400">Voice to email fallback</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-500">Bounce Cleanups</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{activity?.bounce_cleanups ?? '...'}</p>
            <p className="mt-1 text-xs text-gray-400">Bounced leads removed</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-500">Self-Healing</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{activity?.self_healing_retries ?? '...'}</p>
            <p className="mt-1 text-xs text-gray-400">Failed actions retried</p>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-3">Error Breakdown</h3>
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          {errorSummary?.bySeverity && Object.keys(errorSummary.bySeverity).length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="px-5 py-3">Severity</th>
                  <th className="px-5 py-3">Unresolved</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(errorSummary.bySeverity).map(([sev, count]) => (
                  <tr key={sev} className="border-b border-gray-50">
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        sev === 'critical' || sev === 'error' ? 'bg-red-100 text-red-700' :
                        sev === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                      }`}>{sev}</span>
                    </td>
                    <td className="px-5 py-3 font-medium text-gray-900">{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-8 text-center text-sm text-gray-400">No unresolved errors</div>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-3">Agent Schedule</h3>
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-5 py-3">Agent</th>
                <th className="px-5 py-3">Function</th>
                <th className="px-5 py-3">Frequency</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {[
                { name: 'Campaign QA', fn: 'Validate sequences, check config', freq: 'Every 15 min (weekdays)', status: 'active' },
                { name: 'Campaign Repair', fn: 'Email retry, voice fallback, bounce cleanup', freq: 'Every 20 min', status: 'active' },
                { name: 'Self-Healing', fn: 'Retry failed actions within max attempts', freq: 'Every 30 min', status: 'active' },
                { name: 'Email Polisher', fn: 'Content quality scoring, grammar, readability', freq: 'On-demand', status: 'active' },
                { name: 'Health Scanner', fn: 'Campaign health score computation', freq: 'Every 15 min', status: 'active' },
              ].map(agent => (
                <tr key={agent.name} className="border-b border-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-900">{agent.name}</td>
                  <td className="px-5 py-3 text-gray-500">{agent.fn}</td>
                  <td className="px-5 py-3 text-gray-500">{agent.freq}</td>
                  <td className="px-5 py-3">
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">{agent.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// --- Test Suite Tab ---

function TestSuiteTab({ testSuite }: { testSuite: any }) {
  if (!testSuite) return <div className="p-8 text-center text-sm text-gray-400">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Framework</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">{testSuite.framework}</p>
          <p className="mt-1 text-xs text-gray-400">{testSuite.runner}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Total Tests</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{testSuite.total}</p>
          <p className="mt-1 text-xs text-gray-400">across all categories</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Coverage Areas</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{testSuite.test_files?.length || 0}</p>
          <p className="mt-1 text-xs text-gray-400">service modules tested</p>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-3">Test Categories</h3>
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3">Test Files</th>
                <th className="px-5 py-3">Coverage</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(testSuite.categories || {}).map(([cat, count]) => (
                <tr key={cat} className="border-b border-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-900 capitalize">{cat}</td>
                  <td className="px-5 py-3 text-gray-900">{count as number}</td>
                  <td className="px-5 py-3">
                    <div className="h-1.5 w-32 rounded-full bg-gray-100">
                      <div
                        className={`h-1.5 rounded-full ${(count as number) > 0 ? 'bg-emerald-500' : 'bg-gray-200'}`}
                        style={{ width: `${Math.min(100, ((count as number) / 25) * 100)}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-3">Unit Test Coverage</h3>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex flex-wrap gap-2">
            {(testSuite.test_files || []).map((file: string) => (
              <span key={file} className="rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                {file}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
