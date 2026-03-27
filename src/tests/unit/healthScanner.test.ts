import { computeHealthScore } from '../../services/campaignHealthScanner';
import { CampaignMetrics } from '../../services/campaignAnalyticsService';

function makeMetrics(overrides: Partial<CampaignMetrics> = {}): CampaignMetrics {
  return {
    sent: 100, opened: 25, clicked: 5, replied: 3, bounced: 2, booked_meeting: 1,
    open_rate: 25, click_rate: 5, reply_rate: 3, bounce_rate: 2, meeting_rate: 1,
    ...overrides,
  };
}

describe('Campaign Health Scanner', () => {
  it('should return 100 (healthy) for good metrics', () => {
    const result = computeHealthScore(makeMetrics());
    expect(result.score).toBe(100);
    expect(result.status).toBe('healthy');
    expect(result.penalties).toHaveLength(0);
  });

  it('should penalize -20 for open rate below 15%', () => {
    const result = computeHealthScore(makeMetrics({ open_rate: 10 }));
    expect(result.score).toBe(80);
    expect(result.status).toBe('healthy');
    expect(result.penalties).toHaveLength(1);
  });

  it('should penalize -20 for reply rate below 2%', () => {
    const result = computeHealthScore(makeMetrics({ reply_rate: 1 }));
    expect(result.score).toBe(80);
  });

  it('should penalize -30 for bounce rate above 10%', () => {
    const result = computeHealthScore(makeMetrics({ bounce_rate: 15 }));
    expect(result.score).toBe(70);
    expect(result.status).toBe('degraded');
  });

  it('should penalize -10 per error', () => {
    const result = computeHealthScore(makeMetrics(), 2);
    expect(result.score).toBe(80);
  });

  it('should cap error penalty at -30', () => {
    const result = computeHealthScore(makeMetrics(), 5);
    expect(result.score).toBe(70);
  });

  it('should penalize -15 for AI success below 80%', () => {
    const result = computeHealthScore(makeMetrics(), 0, 70);
    expect(result.score).toBe(85);
  });

  it('should classify as critical when score < 60', () => {
    const result = computeHealthScore(
      makeMetrics({ open_rate: 10, reply_rate: 1, bounce_rate: 15 }),
      3,
    );
    expect(result.status).toBe('critical');
    expect(result.score).toBeLessThan(60);
  });

  it('should classify as degraded for 60-79', () => {
    const result = computeHealthScore(makeMetrics({ open_rate: 10, reply_rate: 1 }));
    expect(result.score).toBe(60);
    expect(result.status).toBe('degraded');
  });

  it('should not penalize open/reply rate when 0 sends', () => {
    const result = computeHealthScore(makeMetrics({ sent: 0, open_rate: 0, reply_rate: 0 }));
    expect(result.score).toBe(100);
  });

  it('should clamp score to 0 minimum', () => {
    const result = computeHealthScore(
      makeMetrics({ open_rate: 5, reply_rate: 0.5, bounce_rate: 20 }),
      5, 50,
    );
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('should accumulate all applicable penalties', () => {
    const result = computeHealthScore(
      makeMetrics({ open_rate: 10, reply_rate: 1, bounce_rate: 15 }),
      1, 70,
    );
    // -20 (open) -20 (reply) -30 (bounce) -10 (error) -15 (ai) = 5
    expect(result.score).toBe(5);
    expect(result.penalties.length).toBe(5);
  });
});
