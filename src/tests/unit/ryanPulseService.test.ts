// Tests cover the date-window math, the rendering shape, and the
// aggregation flow. The DB layer is mocked so unit tests stay fast and
// deterministic; the SQL itself is implicitly tested by tsc + future
// integration tests.

jest.mock('../../models/Lead', () => ({
  Lead: { findAll: jest.fn(), count: jest.fn() },
  PIPELINE_STAGES: ['new_lead', 'contacted', 'replied', 'meeting_scheduled', 'proposal_sent', 'negotiation', 'enrolled', 'lost'],
}));
jest.mock('../../models/CommunicationLog', () => ({
  CommunicationLog: { findAll: jest.fn(), count: jest.fn() },
}));
jest.mock('../../models/ScheduledEmail', () => ({
  ScheduledEmail: { findAll: jest.fn() },
}));

import { buildPulseSnapshot, renderPulseSubject, renderPulseText, renderPulseHtml, reportingWindows } from '../../services/ryanPulseService';
import { Lead } from '../../models/Lead';
import { CommunicationLog } from '../../models/CommunicationLog';
import { ScheduledEmail } from '../../models/ScheduledEmail';

const mockLeadFindAll = Lead.findAll as jest.Mock;
const mockLeadCount = Lead.count as jest.Mock;
const mockCommFindAll = CommunicationLog.findAll as jest.Mock;
const mockCommCount = CommunicationLog.count as jest.Mock;
const mockSchedFindAll = ScheduledEmail.findAll as jest.Mock;

describe('reportingWindows', () => {
  it('yesterday window is exactly 24h wide', () => {
    const now = new Date('2026-06-09T16:00:00Z');
    const w = reportingWindows(now);
    expect(w.yesterdayEnd.getTime() - w.yesterdayStart.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('last-week window is the same weekday 8 days back', () => {
    const now = new Date('2026-06-09T16:00:00Z'); // Tuesday
    const w = reportingWindows(now);
    // 8 days before 2026-06-09 = 2026-06-01 (Monday). Anchor=8 days before now;
    // start-of-day Chicago for that anchor. We only assert the gap matches and
    // the duration is 24h -- TZ-exact start moment depends on DST.
    expect(w.lastWeekEnd.getTime() - w.lastWeekStart.getTime()).toBe(24 * 60 * 60 * 1000);
    const gapDays = Math.round((w.yesterdayStart.getTime() - w.lastWeekStart.getTime()) / (24 * 60 * 60 * 1000));
    expect(gapDays).toBe(7);
  });

  it('next-24 window starts from now and lasts 24h', () => {
    const now = new Date('2026-06-09T16:00:00Z');
    const w = reportingWindows(now);
    expect(w.next24Start.getTime()).toBe(now.getTime());
    expect(w.next24End.getTime() - w.next24Start.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});

function setupHappyMocks() {
  // Sends yesterday: 5 cold (step 1) + 2 followup (step 3) = 7
  mockCommFindAll.mockImplementation(({ where }: any) => {
    if (where.direction === 'outbound') {
      return Promise.resolve([
        { cnt: '5', metadata: { step_number: 1 } },
        { cnt: '2', metadata: { step_number: 3 } },
      ]);
    }
    // inbound replies for the "needs you" section -- 1 reply
    return Promise.resolve([
      { lead_id: 42, body: 'Yes, can we talk Thursday?', subject: 'Re: Quick intro', created_at: new Date('2026-06-08T22:42:00Z') },
    ]);
  });
  mockCommCount.mockResolvedValue(1); // replies = 1

  // Lead.findAll -- distinguish by attributes/group/lead-list path
  mockLeadFindAll.mockImplementation((args: any) => {
    // hot leads have order + status='active' + temperature='hot'
    if (args.where?.temperature === 'hot') {
      return Promise.resolve([
        { id: 42, first_name: 'Mary', last_name: 'Shilkaitis', company: 'Rush', state: 'IL', lead_score: 88 },
        { id: 43, first_name: 'Brad', last_name: 'Mahoney', company: 'Mahoney Co', state: 'TX', lead_score: 82 },
      ]);
    }
    // leads-added grouping by lead_source
    if (args.attributes?.[0] === 'lead_source') {
      return Promise.resolve([
        { lead_source: 'api', cnt: '9' },
        { lead_source: 'manual', cnt: '3' },
      ]);
    }
    // pipeline grouping by stage
    if (args.attributes?.[0] === 'pipeline_stage') {
      return Promise.resolve([
        { pipeline_stage: 'new_lead', cnt: '38' },
        { pipeline_stage: 'contacted', cnt: '71' },
        { pipeline_stage: 'replied', cnt: '18' },
        { pipeline_stage: 'meeting_scheduled', cnt: '11' },
        { pipeline_stage: 'enrolled', cnt: '4' },
      ]);
    }
    // inbound-replies pluck (rows have created_at, body, subject, lead_id)
    if (args.where?.direction === 'inbound') {
      return Promise.resolve([]);
    }
    // hot-lead lookup follow-up (Lead.findAll by id list to hydrate names for inbound)
    if (args.where?.id?.[Symbol.for('seq') as any]) return Promise.resolve([]);
    return Promise.resolve([]);
  });
  mockLeadCount.mockResolvedValue(0); // meetings booked yesterday = 0

  // Scheduled emails next 24h -- 3 sends
  mockSchedFindAll.mockResolvedValue([
    { scheduled_for: new Date('2026-06-09T18:00:00Z'), campaign_id: 'c1' },
    { scheduled_for: new Date('2026-06-09T18:05:00Z'), campaign_id: 'c1' },
    { scheduled_for: new Date('2026-06-09T20:00:00Z'), campaign_id: 'c2' },
  ]);
}

describe('buildPulseSnapshot', () => {
  beforeEach(() => { jest.clearAllMocks(); setupHappyMocks(); });

  it('aggregates yesterday + pipeline + needs-you + upcoming in one snapshot', async () => {
    const snap = await buildPulseSnapshot(new Date('2026-06-09T16:00:00Z'));
    expect(snap.yesterday.sends).toBe(7);
    expect(snap.yesterday.sends_cold).toBe(5);
    expect(snap.yesterday.sends_followup).toBe(2);
    expect(snap.yesterday.replies).toBe(1);
    expect(snap.yesterday.leads_added).toBe(12);
    expect(snap.yesterday.leads_added_apollo).toBe(9);
    expect(snap.yesterday.leads_added_other).toBe(3);
    expect(snap.pipeline.total).toBe(38 + 71 + 18 + 11 + 4);
    expect(snap.pipeline.by_stage.contacted).toBe(71);
    expect(snap.pipeline.by_stage.replied).toBe(18);
    expect(snap.pipeline.hot_leads.length).toBe(2);
    expect(snap.pipeline.hot_leads[0]!.name).toBe('Mary Shilkaitis');
    expect(snap.whats_next.upcoming_sends_24h).toBe(3);
    // 3 sends clustered into 2 half-hour buckets (18:00, 18:05 same bucket; 20:00 separate)
    expect(snap.whats_next.upcoming_clusters.length).toBe(2);
  });

  it('vs-last-week deltas use the same windowed counts', async () => {
    const snap = await buildPulseSnapshot(new Date('2026-06-09T16:00:00Z'));
    // last-week numbers are identical to yesterday (mocks return same values),
    // so all deltas should be 0
    expect(snap.vs_last_week.sends_delta).toBe(0);
    expect(snap.vs_last_week.replies_delta).toBe(0);
    expect(snap.vs_last_week.leads_added_delta).toBe(0);
  });
});

describe('renderPulseSubject', () => {
  it('mentions queued sends and pending replies when both > 0', () => {
    const snap = {
      generated_at: new Date('2026-06-09T16:00:00Z'),
      whats_next: { upcoming_sends_24h: 12, upcoming_clusters: [] },
      needs_you: { inbound_reply_count: 3, inbound_replies: [] },
    } as any;
    const s = renderPulseSubject(snap);
    expect(s).toContain('12 sends queued');
    expect(s).toContain('3 replies need you');
  });

  it('says "all clear" when nothing is queued or pending', () => {
    const snap = {
      generated_at: new Date('2026-06-09T16:00:00Z'),
      whats_next: { upcoming_sends_24h: 0, upcoming_clusters: [] },
      needs_you: { inbound_reply_count: 0, inbound_replies: [] },
    } as any;
    expect(renderPulseSubject(snap)).toContain('all clear');
  });
});

describe('renderPulseText', () => {
  it('renders the 4 mandatory section headers in order', async () => {
    const snap = await buildPulseSnapshot(new Date('2026-06-09T16:00:00Z'));
    const txt = renderPulseText(snap);
    const idxYesterday = txt.indexOf('YESTERDAY');
    const idxStand = txt.indexOf('WHERE WE STAND');
    const idxNeeds = txt.indexOf('WHAT NEEDS YOU TODAY');
    const idxNext = txt.indexOf('WHAT IS NEXT');
    expect(idxYesterday).toBeGreaterThan(-1);
    expect(idxStand).toBeGreaterThan(idxYesterday);
    expect(idxNeeds).toBeGreaterThan(idxStand);
    expect(idxNext).toBeGreaterThan(idxNeeds);
  });

  it('contains no em-dash characters (client-facing rule)', async () => {
    const snap = await buildPulseSnapshot(new Date('2026-06-09T16:00:00Z'));
    expect(renderPulseText(snap)).not.toMatch(/—/);
  });
});

describe('renderPulseHtml', () => {
  it('produces a single-root HTML document (DOCTYPE + html + body)', async () => {
    const snap = await buildPulseSnapshot(new Date('2026-06-09T16:00:00Z'));
    const html = renderPulseHtml(snap);
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<html>');
    expect(html).toContain('</html>');
  });

  it('renders an empty-state row when nothing needs Ryan', () => {
    const snap = {
      generated_at: new Date('2026-06-09T16:00:00Z'),
      yesterday: { sends: 0, sends_cold: 0, sends_followup: 0, replies: 0, leads_added: 0, leads_added_apollo: 0, leads_added_other: 0, meetings_booked: 0 },
      pipeline: { total: 0, by_stage: { new_lead: 0, contacted: 0, replied: 0, meeting_scheduled: 0, proposal_sent: 0, negotiation: 0, enrolled: 0, lost: 0 }, hot_leads: [] },
      needs_you: { inbound_reply_count: 0, inbound_replies: [] },
      whats_next: { upcoming_sends_24h: 0, upcoming_clusters: [] },
      vs_last_week: { sends_delta: 0, replies_delta: 0, leads_added_delta: 0, meetings_delta: 0 },
    } as any;
    const html = renderPulseHtml(snap);
    expect(html).toContain('Quiet inbox');
    expect(html).toContain('No sends queued');
  });
});
