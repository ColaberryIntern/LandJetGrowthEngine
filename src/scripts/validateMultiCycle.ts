/**
 * Multi-Cycle Validation: Full 3-step sequence lifecycle
 * Simulates Day 0 → Day 4 → Day 8 progression.
 */
import '../config/environment';
import { getSequelize } from '../config/database';
import { initModels } from '../models';
import { Campaign } from '../models/Campaign';
import { FollowUpSequence } from '../models/FollowUpSequence';
import { Lead } from '../models/Lead';
import { CampaignLead } from '../models/CampaignLead';
import { ScheduledEmail } from '../models/ScheduledEmail';
import { User } from '../models/User';
import { Op } from 'sequelize';
import { createSequence } from '../services/sequenceService';
import { createCampaign, transitionApproval } from '../services/campaignService';
import { runDailyDraftCycle } from '../services/sequenceEngineService';

let pass = 0, fail = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { console.log(`  ✅ ${label}${detail ? ' — ' + detail : ''}`); pass++; }
  else    { console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); fail++; }
}
function info(s: string) { console.log(`  ℹ️  ${s}`); }
function hdr(s: string) { console.log(`\n${'═'.repeat(60)}\n  ${s}\n${'═'.repeat(60)}`); }

async function showLeadState(campaignId: string, label: string) {
  const cls = await CampaignLead.findAll({ where: { campaign_id: campaignId }, order: [['lead_id', 'ASC']] });
  console.log(`\n  --- ${label} ---`);
  for (const cl of cls) {
    const m = (cl.metadata || {}) as Record<string, any>;
    console.log(`  Lead ${cl.lead_id}: step=${cl.current_step_index} | status=${cl.status} | outreach=${m.outreach_step} | touches=${cl.touchpoint_count} | next=${cl.next_action_at?.toISOString().substring(0, 10) || 'null'} | draft=${m.last_draft_id?.substring(0, 8) || 'null'}`);
  }
  return cls;
}

async function countDrafts(campaignId: string, leadId: number) {
  return ScheduledEmail.count({ where: { campaign_id: campaignId, lead_id: leadId } });
}

async function run() {
  const sequelize = getSequelize();
  initModels(sequelize);
  await sequelize.authenticate();

  hdr('MULTI-CYCLE VALIDATION: 3-STEP SEQUENCE LIFECYCLE');

  // ── FRESH SETUP ──
  hdr('SETUP: Fresh campaign + 2 leads');

  const lead1 = await Lead.create({
    first_name: 'Maria', last_name: 'Gonzalez', email: `maria.gonzalez.${Date.now()}@acme.com`,
    phone: '+15550100001', company: 'Acme Aviation', title: 'VP Client Services', industry: 'Aviation',
    company_size: 200, lead_source: 'past_client', lead_source_type: 'warm',
    temperature: 'warm', lead_score: 65, pipeline_stage: 'new_lead', status: 'active',
    notes: null, technology_stack: null, annual_revenue: null, linkedin_url: null, interest_area: null, lifecycle_stage: null, utm_source: null,
  });
  const lead2 = await Lead.create({
    first_name: 'James', last_name: 'Park', email: `james.park.${Date.now()}@globalfin.com`,
    phone: '+15550100002', company: 'GlobalFin Corp', title: 'CEO', industry: 'Finance',
    company_size: 500, lead_source: 'past_client', lead_source_type: 'warm',
    temperature: 'hot', lead_score: 90, pipeline_stage: 'new_lead', status: 'active',
    notes: null, technology_stack: null, annual_revenue: null, linkedin_url: null, interest_area: null, lifecycle_stage: null, utm_source: null,
  });
  info(`Lead 1: ${lead1.id} — ${lead1.first_name} ${lead1.last_name}`);
  info(`Lead 2: ${lead2.id} — ${lead2.first_name} ${lead2.last_name}`);

  const sequence = await createSequence({
    name: 'Multi-Cycle Validation Sequence',
    steps: [
      { delay_days: 0, channel: 'email' as const, subject: 'Reconnecting', body_template: 'Intro', ai_instructions: 'Write warm intro reconnecting with past client.', ai_tone: 'warm', step_goal: 'Re-establish connection', max_attempts: 1 },
      { delay_days: 4, channel: 'email' as const, subject: 'Following Up', body_template: 'Followup', ai_instructions: 'Write value-add follow-up referencing first email.', ai_tone: 'professional', step_goal: 'Add value', max_attempts: 1 },
      { delay_days: 8, channel: 'email' as const, subject: 'One Last Note', body_template: 'Final', ai_instructions: 'Write graceful final outreach. Leave door open.', ai_tone: 'warm', step_goal: 'Graceful close', max_attempts: 1 },
    ],
  });

  const admin = await User.findOne({ where: { role: 'admin' } });
  const campaign = await createCampaign({
    name: `Multi-Cycle Validation ${Date.now()}`, type: 'executive_outreach',
    description: 'Validation run', sequence_id: sequence.id,
    targeting_criteria: null, channel_config: { email: { enabled: true } },
    ai_system_prompt: 'You are writing on behalf of Ryan Landry, CEO of LandJet.',
    settings: { test_mode_enabled: false }, budget_total: null, budget_cap: null,
    cost_per_lead_target: null, expected_roi: null, goals: null, gtm_notes: null,
    interest_group: null, created_by: admin?.id || null,
  }, admin?.id || '');
  await transitionApproval(campaign.id, 'pending_approval', admin?.id || '');
  await transitionApproval(campaign.id, 'approved', admin?.id || '');
  await transitionApproval(campaign.id, 'live', admin?.id || '');

  for (const lead of [lead1, lead2]) {
    await CampaignLead.create({
      campaign_id: campaign.id, lead_id: lead.id,
      status: 'active', lifecycle_status: 'enrolled', enrolled_at: new Date(),
      current_step_index: 0, total_steps: 3, next_action_at: new Date(),
      metadata: { draft_mode: true, outreach_step: '1st_outreach' },
    });
  }

  check('Campaign active', (await Campaign.findByPk(campaign.id))?.status === 'active');
  check('2 leads enrolled at step 0', (await CampaignLead.count({ where: { campaign_id: campaign.id } })) === 2);
  await showLeadState(campaign.id, 'INITIAL STATE');

  // ══════════════════════════════════════
  hdr('DAY 0: First Draft Cycle (1st Outreach)');
  // ══════════════════════════════════════

  const day0 = await runDailyDraftCycle();
  info(`Cycle: drafts=${day0.draftsCreated}, processed=${day0.leadsProcessed}, errors=${day0.errors.length}`);
  check('Day 0: 2 drafts created', day0.draftsCreated === 2);
  check('Day 0: 0 errors', day0.errors.length === 0, day0.errors.join('; '));

  const day0Leads = await showLeadState(campaign.id, 'AFTER DAY 0 CYCLE');
  for (const cl of day0Leads) {
    const m = (cl.metadata || {}) as Record<string, any>;
    check(`Lead ${cl.lead_id} advanced to step 1`, cl.current_step_index === 1, `got ${cl.current_step_index}`);
    check(`Lead ${cl.lead_id} outreach = 2nd_outreach`, m.outreach_step === '2nd_outreach', `got ${m.outreach_step}`);
    check(`Lead ${cl.lead_id} has last_draft_id`, !!m.last_draft_id);
    check(`Lead ${cl.lead_id} touchpoints = 1`, cl.touchpoint_count === 1);
  }

  // Verify no duplicates on re-run
  info('Re-running Day 0 cycle (should be no-op for these leads)...');
  const day0Rerun = await runDailyDraftCycle();
  check('Day 0 re-run: 0 new drafts (idempotent)', day0Rerun.draftsCreated === 0, `got ${day0Rerun.draftsCreated}`);

  const draftsAfterDay0 = await ScheduledEmail.count({ where: { campaign_id: campaign.id } });
  info(`Total draft records after Day 0: ${draftsAfterDay0}`);

  // ══════════════════════════════════════
  hdr('DAY 4: Second Draft Cycle (2nd Outreach)');
  // ══════════════════════════════════════

  // Simulate Day 4: set next_action_at to NOW
  await CampaignLead.update(
    { next_action_at: new Date() },
    { where: { campaign_id: campaign.id, status: 'active' } },
  );
  info('Forced next_action_at = NOW for active leads');

  const day4 = await runDailyDraftCycle();
  info(`Cycle: drafts=${day4.draftsCreated}, processed=${day4.leadsProcessed}, errors=${day4.errors.length}`);
  check('Day 4: 2 drafts created', day4.draftsCreated === 2);
  check('Day 4: 0 errors', day4.errors.length === 0, day4.errors.join('; '));

  const day4Leads = await showLeadState(campaign.id, 'AFTER DAY 4 CYCLE');
  for (const cl of day4Leads) {
    const m = (cl.metadata || {}) as Record<string, any>;
    check(`Lead ${cl.lead_id} advanced to step 2`, cl.current_step_index === 2, `got ${cl.current_step_index}`);
    check(`Lead ${cl.lead_id} outreach = last_email`, m.outreach_step === 'last_email', `got ${m.outreach_step}`);
    check(`Lead ${cl.lead_id} touchpoints = 2`, cl.touchpoint_count === 2);
    check(`Lead ${cl.lead_id} status still active`, cl.status === 'active');
  }

  const draftsAfterDay4 = await ScheduledEmail.count({ where: { campaign_id: campaign.id } });
  info(`Total draft records after Day 4: ${draftsAfterDay4}`);
  check('No duplicate drafts (Day0=2, Day4=2, total=4)', draftsAfterDay4 === 4, `got ${draftsAfterDay4}`);

  // ══════════════════════════════════════
  hdr('DAY 8: Final Draft Cycle (Last Outreach → Complete)');
  // ══════════════════════════════════════

  await CampaignLead.update(
    { next_action_at: new Date() },
    { where: { campaign_id: campaign.id, status: 'active' } },
  );
  info('Forced next_action_at = NOW for active leads');

  const day8 = await runDailyDraftCycle();
  info(`Cycle: drafts=${day8.draftsCreated}, processed=${day8.leadsProcessed}, errors=${day8.errors.length}`);
  check('Day 8: 2 drafts created', day8.draftsCreated === 2);
  check('Day 8: 0 errors', day8.errors.length === 0, day8.errors.join('; '));

  const day8Leads = await showLeadState(campaign.id, 'AFTER DAY 8 CYCLE');
  for (const cl of day8Leads) {
    const m = (cl.metadata || {}) as Record<string, any>;
    check(`Lead ${cl.lead_id} sequence COMPLETED`, cl.status === 'completed', `got status=${cl.status}`);
    check(`Lead ${cl.lead_id} completed_at is set`, !!cl.completed_at);
  }

  const draftsAfterDay8 = await ScheduledEmail.count({ where: { campaign_id: campaign.id } });
  info(`Total draft records after Day 8: ${draftsAfterDay8}`);
  check('Total drafts = 6 (2 per cycle x 3 cycles)', draftsAfterDay8 === 6, `got ${draftsAfterDay8}`);

  // ══════════════════════════════════════
  hdr('POST-COMPLETION: Verify no further processing');
  // ══════════════════════════════════════

  await CampaignLead.update(
    { next_action_at: new Date() },
    { where: { campaign_id: campaign.id } },
  );
  info('Forced next_action_at = NOW on completed leads');

  const postComplete = await runDailyDraftCycle();
  check('Post-completion: 0 drafts created', postComplete.draftsCreated === 0, `got ${postComplete.draftsCreated}`);

  const finalDraftCount = await ScheduledEmail.count({ where: { campaign_id: campaign.id } });
  check('No new drafts after completion', finalDraftCount === draftsAfterDay8, `before=${draftsAfterDay8}, after=${finalDraftCount}`);

  // ══════════════════════════════════════
  hdr('PER-LEAD DRAFT AUDIT');
  // ══════════════════════════════════════

  for (const lead of [lead1, lead2]) {
    const leadDrafts = await ScheduledEmail.findAll({
      where: { campaign_id: campaign.id, lead_id: lead.id },
      order: [['step_index', 'ASC']],
    });
    console.log(`\n  Lead ${lead.id} (${lead.first_name} ${lead.last_name}): ${leadDrafts.length} drafts`);
    const steps = new Set<number>();
    for (const d of leadDrafts) {
      console.log(`    step=${d.step_index} | status=${d.status} | subject="${d.subject}"`);
      steps.add(d.step_index);
    }
    check(`Lead ${lead.id}: exactly 3 drafts`, leadDrafts.length === 3, `got ${leadDrafts.length}`);
    check(`Lead ${lead.id}: covers steps 0,1,2`, steps.has(0) && steps.has(1) && steps.has(2), `steps=${Array.from(steps).join(',')}`);
    check(`Lead ${lead.id}: no duplicate steps`, steps.size === leadDrafts.length);
  }

  // Pipeline check
  const lead1Final = await Lead.findByPk(lead1.id);
  const lead2Final = await Lead.findByPk(lead2.id);
  check('Lead 1 pipeline = contacted', lead1Final?.pipeline_stage === 'contacted', `got ${lead1Final?.pipeline_stage}`);
  check('Lead 2 pipeline = contacted', lead2Final?.pipeline_stage === 'contacted', `got ${lead2Final?.pipeline_stage}`);

  // ══════════════════════════════════════
  hdr('FINAL SUMMARY');
  console.log(`\n  ✅ PASSED: ${pass}`);
  console.log(`  ❌ FAILED: ${fail}`);
  if (fail === 0) console.log('\n  🎉 FULL 3-STEP LIFECYCLE VALIDATED SUCCESSFULLY');
  else console.log('\n  ⛔ ISSUES DETECTED — see failures above');
  console.log('');

  await sequelize.close();
}

run().catch((e) => { console.error('VALIDATION FAILED:', e); process.exit(1); });
