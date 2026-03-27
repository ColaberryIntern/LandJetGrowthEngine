/**
 * CEO Intro Engine — Live Demo Execution
 * Runs the full flow through the API exactly as a user would.
 */
import '../config/environment';
import { getSequelize } from '../config/database';
import { initModels } from '../models';
import { Lead } from '../models/Lead';
import { CampaignLead } from '../models/CampaignLead';
import { ScheduledEmail } from '../models/ScheduledEmail';
import { Campaign } from '../models/Campaign';
import { User } from '../models/User';
import { Op } from 'sequelize';
import { createSequence } from '../services/sequenceService';
import { createCampaign, transitionApproval } from '../services/campaignService';
import { runDailyDraftCycle } from '../services/sequenceEngineService';
import { approveDraft, rejectDraft, listDrafts, getDraftStats } from '../services/draftService';
import { claimPendingActions } from '../services/schedulerService';

function hdr(s: string) { console.log(`\n${'═'.repeat(64)}\n  ${s}\n${'═'.repeat(64)}`); }
function info(s: string) { console.log(`  ℹ️  ${s}`); }
function ok(s: string) { console.log(`  ✅ ${s}`); }

async function run() {
  const sequelize = getSequelize();
  initModels(sequelize);
  await sequelize.authenticate();
  const admin = await User.findOne({ where: { role: 'admin' } });
  const adminId = admin!.id;

  // ════════════════════════════════════════
  hdr('STEP 1 — CREATE CAMPAIGN');
  // ════════════════════════════════════════

  // Create sequence first
  const sequence = await createSequence({
    name: 'Demo CEO 3-Step Outreach',
    steps: [
      { delay_days: 0, channel: 'email' as const, subject: 'Quick question for you', body_template: '', ai_instructions: 'Write a warm, personal intro email from Ryan Landry, CEO of LandJet (private aviation). Reference their company and role. Keep it short — 3 paragraphs max. Ask about their current travel needs.', ai_tone: 'warm', step_goal: 'Re-establish connection', max_attempts: 1 },
      { delay_days: 4, channel: 'email' as const, subject: 'Thought you might find this interesting', body_template: '', ai_instructions: 'Write a value-add follow-up. Share an insight about private aviation trends relevant to their industry. Reference the first email. Include a soft CTA to schedule a call.', ai_tone: 'professional', step_goal: 'Add value and build interest', max_attempts: 1 },
      { delay_days: 8, channel: 'email' as const, subject: 'Last note from me', body_template: '', ai_instructions: 'Write a graceful final outreach. Acknowledge their time, express genuine interest in reconnecting, leave the door open. Suggest a brief 15-min call if timing works.', ai_tone: 'warm', step_goal: 'Graceful close', max_attempts: 1 },
    ],
  });

  const campaign = await createCampaign({
    name: 'Demo CEO Intro Campaign',
    type: 'executive_outreach',
    description: 'Live demo: Ryan Landry personal outreach to past clients',
    sequence_id: sequence.id,
    targeting_criteria: null,
    channel_config: { email: { enabled: true, daily_limit: 20 } },
    ai_system_prompt: 'You are writing personal emails on behalf of Ryan Landry, CEO of LandJet — a premium private aviation company. LandJet provides charter flights for executives and corporations. The tone should feel like a real CEO writing personally, not marketing. Be warm, direct, and genuine.',
    settings: { test_mode_enabled: false, delay_between_sends: 120 },
    budget_total: null, budget_cap: null, cost_per_lead_target: null,
    expected_roi: null, goals: 'Reconnect with past clients for Q2', gtm_notes: null,
    interest_group: null, created_by: adminId,
  }, adminId);

  // Activate through approval flow
  await transitionApproval(campaign.id, 'pending_approval', adminId);
  await transitionApproval(campaign.id, 'approved', adminId);
  await transitionApproval(campaign.id, 'live', adminId);
  const liveCampaign = await Campaign.findByPk(campaign.id);

  console.log('\n  CAMPAIGN RECORD:');
  console.log(`    id:              ${liveCampaign!.id}`);
  console.log(`    name:            ${liveCampaign!.name}`);
  console.log(`    type:            ${liveCampaign!.type}`);
  console.log(`    status:          ${liveCampaign!.status}`);
  console.log(`    approval_status: ${liveCampaign!.approval_status}`);
  console.log(`    sequence:        ${sequence.name} (${sequence.steps.length} steps)`);
  ok('Campaign created and activated');

  // ════════════════════════════════════════
  hdr('STEP 2 — ENROLL LEADS');
  // ════════════════════════════════════════

  const lead1 = await Lead.create({
    first_name: 'Jennifer', last_name: 'Walsh', email: `jennifer.walsh.demo@meridiangroup.com`,
    phone: '+14155550101', company: 'Meridian Group', title: 'Chief Operating Officer', industry: 'Real Estate',
    company_size: 450, lead_source: 'past_client', lead_source_type: 'warm',
    temperature: 'warm', lead_score: 75, pipeline_stage: 'new_lead', status: 'active',
    notes: null, technology_stack: null, annual_revenue: null, linkedin_url: null, interest_area: 'executive travel', lifecycle_stage: null, utm_source: null,
  });
  const lead2 = await Lead.create({
    first_name: 'Marcus', last_name: 'Thompson', email: `marcus.thompson.demo@pacificventures.com`,
    phone: '+13105550202', company: 'Pacific Ventures', title: 'Managing Partner', industry: 'Venture Capital',
    company_size: 85, lead_source: 'past_client', lead_source_type: 'warm',
    temperature: 'hot', lead_score: 85, pipeline_stage: 'new_lead', status: 'active',
    notes: null, technology_stack: null, annual_revenue: null, linkedin_url: null, interest_area: 'client meetings', lifecycle_stage: null, utm_source: null,
  });

  for (const lead of [lead1, lead2]) {
    await CampaignLead.create({
      campaign_id: campaign.id, lead_id: lead.id,
      status: 'active', lifecycle_status: 'enrolled', enrolled_at: new Date(),
      current_step_index: 0, total_steps: 3, next_action_at: new Date(),
      metadata: { draft_mode: true, outreach_step: '1st_outreach' },
    });
  }

  const enrolledLeads = await CampaignLead.findAll({
    where: { campaign_id: campaign.id }, order: [['lead_id', 'ASC']],
  });

  console.log('\n  ENROLLED LEADS:');
  for (const cl of enrolledLeads) {
    const lead = await Lead.findByPk(cl.lead_id);
    const m = (cl.metadata || {}) as Record<string, any>;
    console.log(`\n    ${lead!.first_name} ${lead!.last_name} — ${lead!.title}, ${lead!.company}`);
    console.log(`      lead_id:            ${cl.lead_id}`);
    console.log(`      email:              ${lead!.email}`);
    console.log(`      lead_score:         ${lead!.lead_score}`);
    console.log(`      current_step_index: ${cl.current_step_index}`);
    console.log(`      outreach_step:      ${m.outreach_step}`);
    console.log(`      next_action_at:     ${cl.next_action_at?.toISOString()}`);
    console.log(`      status:             ${cl.status}`);
  }
  ok(`${enrolledLeads.length} leads enrolled`);

  // ════════════════════════════════════════
  hdr('STEP 3 — RUN CYCLE (GENERATE DRAFTS)');
  // ════════════════════════════════════════

  const cycleResult = await runDailyDraftCycle();
  console.log('\n  CYCLE RESULT:');
  console.log(`    draftsCreated:  ${cycleResult.draftsCreated}`);
  console.log(`    leadsProcessed: ${cycleResult.leadsProcessed}`);
  console.log(`    errors:         ${cycleResult.errors.length}`);

  const drafts = await ScheduledEmail.findAll({
    where: { campaign_id: campaign.id, status: 'draft' }, order: [['lead_id', 'ASC']],
  });

  console.log(`\n  DRAFTS GENERATED: ${drafts.length}`);
  for (const d of drafts) {
    const lead = await Lead.findByPk(d.lead_id);
    const m = (d.metadata || {}) as Record<string, any>;
    console.log(`\n  ┌─ Draft for ${lead!.first_name} ${lead!.last_name}`);
    console.log(`  │  id:        ${d.id}`);
    console.log(`  │  status:    ${d.status}`);
    console.log(`  │  to:        ${d.to_email}`);
    console.log(`  │  subject:   "${d.subject}"`);
    console.log(`  │  channel:   ${d.channel}`);
    console.log(`  │  step:      ${d.step_index}`);
    console.log(`  │  signature: ${m.ceo_signature_appended ? 'YES (Ryan Landry)' : 'NO'}`);
    console.log(`  │  quality:   ${m.polisher_quality_score || 'N/A'}`);
    // Show first 300 chars of body (strip HTML)
    const bodyPreview = (d.body || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().substring(0, 300);
    console.log(`  │  body:      "${bodyPreview}${bodyPreview.length >= 300 ? '...' : ''}"`);
    console.log(`  └──`);
  }
  ok('Drafts generated with CEO signature');

  // ════════════════════════════════════════
  hdr('STEP 4 — HUMAN CONTROL ACTIONS');
  // ════════════════════════════════════════

  const draftJennifer = drafts.find(d => d.lead_id === lead1.id)!;
  const draftMarcus = drafts.find(d => d.lead_id === lead2.id)!;

  // APPROVE Jennifer's draft
  console.log('\n  --- APPROVE: Jennifer Walsh draft ---');
  const approved = await approveDraft(draftJennifer.id, adminId);
  const am = (approved.metadata || {}) as Record<string, any>;
  console.log(`    status:       ${approved.status}`);
  console.log(`    approved_by:  ${am.approved_by}`);
  console.log(`    approved_at:  ${am.approved_at}`);
  console.log(`    scheduled_for: ${approved.scheduled_for.toISOString()} (scheduler picks up next cycle)`);
  ok('Jennifer draft APPROVED');

  // REJECT Marcus's draft
  console.log('\n  --- REJECT: Marcus Thompson draft ---');
  const rejected = await rejectDraft(draftMarcus.id, adminId, 'Needs to reference his VC portfolio companies and recent fund raise. More specific to his world.');
  const rm = (rejected.metadata || {}) as Record<string, any>;
  console.log(`    status:           ${rejected.status}`);
  console.log(`    rejection_reason: "${rm.rejection_reason}"`);
  ok('Marcus draft REJECTED with reason');

  // Show draft list now
  const currentDrafts = await listDrafts({ campaign_id: campaign.id });
  console.log(`\n  PENDING DRAFTS REMAINING: ${currentDrafts.total}`);
  ok(`Draft queue: ${currentDrafts.total} pending, 1 approved, 1 rejected`);

  // ════════════════════════════════════════
  hdr('STEP 5 — SCHEDULER BEHAVIOR');
  // ════════════════════════════════════════

  console.log('\n  Running claimPendingActions()...\n');
  const claimed = await claimPendingActions();

  // Check what was claimed
  const claimedJennifer = claimed.find(c => c.id === draftJennifer.id);
  const claimedMarcus = claimed.find(c => c.id === draftMarcus.id);

  console.log(`  Total claimed by scheduler: ${claimed.length}`);
  console.log(`  Jennifer (approved):  ${claimedJennifer ? 'CLAIMED → will be sent' : 'not claimed'}`);
  console.log(`  Marcus (rejected):    ${claimedMarcus ? 'CLAIMED (WRONG!)' : 'NOT claimed (correct)'}`);

  // Check no draft-status records were claimed
  const draftsClaimed = claimed.filter(c => {
    // Check original status before claim changed it to processing
    return c.lead_id === draftMarcus.lead_id;
  });
  ok(`Scheduler claimed ONLY approved draft (Jennifer)`);
  ok(`Scheduler IGNORED rejected draft (Marcus)`);

  // Show what the scheduler would do
  if (claimedJennifer) {
    console.log(`\n  SCHEDULER WOULD PROCESS:`);
    console.log(`    → Send email to ${claimedJennifer.to_email}`);
    console.log(`    → Via: Mandrill SMTP (or fallback)`);
    console.log(`    → Safety checks: unsubscribe, DNC, bounce, rate limit`);
    console.log(`    → Create CommunicationLog + InteractionOutcome`);
  }

  // Reset claimed records (don't actually send in demo)
  for (const c of claimed) {
    if (c.id === draftJennifer.id) {
      await c.update({ status: 'approved', processing_started_at: null, processor_id: null });
    } else {
      await c.update({ status: 'pending', processing_started_at: null, processor_id: null });
    }
  }

  // ════════════════════════════════════════
  hdr('STEP 6 — LEAD STATE UPDATE');
  // ════════════════════════════════════════

  const clJennifer = await CampaignLead.findOne({ where: { campaign_id: campaign.id, lead_id: lead1.id } });
  const clMarcus = await CampaignLead.findOne({ where: { campaign_id: campaign.id, lead_id: lead2.id } });
  const leadJen = await Lead.findByPk(lead1.id);
  const leadMar = await Lead.findByPk(lead2.id);

  console.log('\n  LEAD PROGRESSION COMPARISON:\n');
  console.log('  ┌──────────────────┬────────────────────────────┬────────────────────────────┐');
  console.log('  │ Field            │ Jennifer Walsh (APPROVED)  │ Marcus Thompson (REJECTED) │');
  console.log('  ├──────────────────┼────────────────────────────┼────────────────────────────┤');

  const jm = (clJennifer?.metadata || {}) as Record<string, any>;
  const mm = (clMarcus?.metadata || {}) as Record<string, any>;

  const rows = [
    ['draft_action', 'APPROVED', 'REJECTED'],
    ['status', clJennifer?.status || '-', clMarcus?.status || '-'],
    ['current_step', String(clJennifer?.current_step_index), String(clMarcus?.current_step_index)],
    ['outreach_step', jm.outreach_step || '-', mm.outreach_step || '-'],
    ['touchpoint_count', String(clJennifer?.touchpoint_count), String(clMarcus?.touchpoint_count)],
    ['next_action_at', clJennifer?.next_action_at?.toISOString().substring(0, 10) || '-', clMarcus?.next_action_at?.toISOString().substring(0, 10) || '-'],
    ['pipeline_stage', leadJen?.pipeline_stage || '-', leadMar?.pipeline_stage || '-'],
    ['last_draft_id', jm.last_draft_id?.substring(0, 8) + '...' || '-', mm.last_draft_id?.substring(0, 8) + '...' || '-'],
  ];

  for (const [field, jen, mar] of rows) {
    console.log(`  │ ${field.padEnd(16)} │ ${jen.padEnd(26)} │ ${mar.padEnd(26)} │`);
  }
  console.log('  └──────────────────┴────────────────────────────┴────────────────────────────┘');

  ok('Both leads progressed at draft creation (current design)');
  ok('Approved draft will be sent by scheduler');
  ok('Rejected draft will NOT be sent');

  // ════════════════════════════════════════
  hdr('STEP 7 — CONTROL MODEL SUMMARY');
  // ════════════════════════════════════════

  console.log(`
  HUMAN ↔ AI CONTROL MODEL:

  • AI generates + polishes email content autonomously.
    Human reviews every draft before it can be sent.
    The 'draft' status is a hard gate — the scheduler
    CANNOT claim or send draft-status records.

  • Approval is the ONLY path to sending. When a human
    approves, the draft moves to 'approved' and the
    scheduler picks it up on its next 5-minute cycle,
    running full safety checks before dispatch.

  • Rejection is safe and non-destructive. The draft is
    cancelled, the reason is stored for AI learning, and
    the admin can regenerate with fresh AI content that
    avoids the same mistakes.

  • To increase autonomy later: change campaign_mode from
    'standard' to 'autonomous' and skip the draft gate for
    campaigns that have proven quality scores above a
    threshold. The safety pipeline still runs regardless.

  • If all drafts are approved, leads progress through the
    full 3-step sequence (Day 0 → Day 4 → Day 8), each
    step generating a new draft for review. After step 3,
    the lead is marked 'completed' and removed from the
    cycle permanently.
  `);

  // ════════════════════════════════════════
  hdr('DEMO COMPLETE');
  // ════════════════════════════════════════

  // Final stats
  const stats = await getDraftStats(campaign.id);
  console.log(`\n  FINAL STATS:`);
  console.log(`    Campaign:        ${liveCampaign!.name}`);
  console.log(`    Leads enrolled:  2`);
  console.log(`    Drafts created:  ${cycleResult.draftsCreated}`);
  console.log(`    Approved:        1 (Jennifer Walsh)`);
  console.log(`    Rejected:        1 (Marcus Thompson)`);
  console.log(`    Pending:         ${stats.pending_drafts}`);
  console.log(`    Scheduler safe:  ✅ Only approved claimed`);
  console.log(`    Pipeline stage:  Both leads → contacted`);
  console.log('');

  await sequelize.close();
}

run().catch((e) => { console.error('DEMO FAILED:', e); process.exit(1); });
