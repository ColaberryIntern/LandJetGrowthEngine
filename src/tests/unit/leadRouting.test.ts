// Tests for the auto-route half of the categorization fix (Ali decision
// 2026-06-19). A pre-built campaign map is passed in, so these exercise the
// routing DECISIONS without any database.

jest.mock('../../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { routeLeadToCorrectCampaign } from '../../services/leadRoutingService';

const bankingCampaign: any = {
  id: 'camp-bank', name: 'Cold Outreach - Banking & Finance',
  sequence_steps: [{ step: 1 }, { step: 2 }, { step: 3 }],
};
const reCampaign: any = {
  id: 'camp-re', name: 'Cold Outreach - Construction & Engineering',
  sequence_steps: [{ step: 1 }, { step: 2 }, { step: 3 }],
};

function campaignMap(): Map<any, any> {
  return new Map<any, any>([
    ['Banking', bankingCampaign],
    ['Real Estate, Construction and Engineering', reCampaign],
  ]);
}

function makeLead(over: Record<string, unknown> = {}): any {
  return {
    id: 1, company: 'Acme', industry: null, vertical: null,
    campaign_id: null, notes: {}, sequence_stage: 1,
    save: jest.fn().mockResolvedValue(undefined),
    ...over,
  };
}

describe('routeLeadToCorrectCampaign', () => {
  it("routes a misfiled lead to the campaign matching its real industry (ZINTEX -> construction)", async () => {
    const lead = makeLead({ industry: 'Construction', campaign_id: 'camp-bank', vertical: 'Banking' });
    const result = await routeLeadToCorrectCampaign(lead, { campaignMap: campaignMap() });

    expect(result.action).toBe('routed');
    expect(lead.campaign_id).toBe('camp-re');
    expect(lead.vertical).toBe('Real Estate, Construction and Engineering');
    expect(lead.next_action_at).toBeNull();
    expect(lead.save).toHaveBeenCalledTimes(1);
  });

  it('keeps a lead already in the correct campaign and corrects its badge', async () => {
    const lead = makeLead({ industry: 'Banking', campaign_id: 'camp-bank', vertical: 'wrong-old-value' });
    const result = await routeLeadToCorrectCampaign(lead, { campaignMap: campaignMap() });

    expect(result.action).toBe('kept');
    expect(lead.campaign_id).toBe('camp-bank');
    expect(lead.vertical).toBe('Banking');
  });

  it('flags a lead whose vertical has no active campaign (left in place)', async () => {
    const lead = makeLead({ industry: 'Law Practice', campaign_id: 'camp-bank' });
    const result = await routeLeadToCorrectCampaign(lead, { campaignMap: campaignMap() });

    expect(result.action).toBe('flagged');
    expect(lead.campaign_id).toBe('camp-bank'); // unchanged
    expect((lead.notes as any).category_review.status).toBe('no_campaign');
  });

  it('marks an unclassifiable industry for review without moving it', async () => {
    const lead = makeLead({ industry: 'Underwater Basket Weaving', campaign_id: 'camp-bank' });
    const result = await routeLeadToCorrectCampaign(lead, { campaignMap: campaignMap() });

    expect(result.action).toBe('unclassified');
    expect(lead.campaign_id).toBe('camp-bank');
    expect((lead.notes as any).category_review.status).toBe('unclassified');
  });

  it('never overrides a manual (human) categorization', async () => {
    const lead = makeLead({
      industry: 'Construction', campaign_id: 'camp-bank',
      notes: { category_source: 'manual' },
    });
    const result = await routeLeadToCorrectCampaign(lead, { campaignMap: campaignMap() });

    expect(result.action).toBe('manual_skip');
    expect(lead.campaign_id).toBe('camp-bank'); // Ryan's choice respected
    expect(lead.save).not.toHaveBeenCalled();
  });

  it('does not persist when persist:false (dry run)', async () => {
    const lead = makeLead({ industry: 'Construction', campaign_id: 'camp-bank' });
    await routeLeadToCorrectCampaign(lead, { campaignMap: campaignMap(), persist: false });
    expect(lead.save).not.toHaveBeenCalled();
  });

  it('is idempotent: re-running a routed lead reports kept and stops moving it', async () => {
    const lead = makeLead({ industry: 'Construction', campaign_id: 'camp-bank' });
    const first = await routeLeadToCorrectCampaign(lead, { campaignMap: campaignMap() });
    expect(first.action).toBe('routed');

    const second = await routeLeadToCorrectCampaign(lead, { campaignMap: campaignMap() });
    expect(second.action).toBe('kept');
    expect(lead.campaign_id).toBe('camp-re');
  });
});
