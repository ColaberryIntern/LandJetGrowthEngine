import { getTemplates, getTemplateByType } from '../../services/campaignBuilderService';

describe('Campaign Builder Service', () => {
  it('should return 3 pre-built templates', () => {
    const templates = getTemplates();
    expect(templates).toHaveLength(3);
  });

  it('should have Cold Outbound template with 7 steps over 21 days', () => {
    const template = getTemplateByType('cold_outbound');
    expect(template).toBeDefined();
    expect(template!.steps).toHaveLength(7);
    expect(template!.steps[template!.steps.length - 1].delay_days).toBe(21);
  });

  it('should have Strategy Call Readiness template with 6 steps', () => {
    const template = getTemplateByType('executive_outreach');
    expect(template).toBeDefined();
    expect(template!.steps).toHaveLength(6);
  });

  it('should have Payment Readiness template with 5 steps', () => {
    const template = getTemplateByType('payment_readiness');
    expect(template).toBeDefined();
    expect(template!.steps).toHaveLength(5);
  });

  it('should return undefined for unknown campaign type', () => {
    const template = getTemplateByType('nonexistent');
    expect(template).toBeUndefined();
  });

  it('should have all steps with required fields', () => {
    const templates = getTemplates();
    for (const template of templates) {
      for (const step of template.steps) {
        expect(step.channel).toBeDefined();
        expect(step.ai_instructions).toBeTruthy();
        expect(step.ai_tone).toBeTruthy();
        expect(step.max_attempts).toBeGreaterThanOrEqual(1);
        expect(step.delay_days).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('Cold Outbound should use voice with fallback to email', () => {
    const template = getTemplateByType('cold_outbound');
    const voiceSteps = template!.steps.filter((s) => s.channel === 'voice');
    expect(voiceSteps.length).toBeGreaterThan(0);
    for (const vs of voiceSteps) {
      expect(vs.fallback_channel).toBe('email');
      expect(vs.voice_agent_type).toBe('interest');
      expect(vs.max_attempts).toBe(2);
    }
  });
});
