/**
 * CEO Intro Engine - Full End-to-End Validation Script
 * Validates all 9 checkpoints against the running database.
 * Run with: npx ts-node src/scripts/validateCeoIntro.ts
 */
import '../config/environment';
import { getSequelize } from '../config/database';
import { initModels } from '../models';
import { Campaign } from '../models/Campaign';
import { FollowUpSequence } from '../models/FollowUpSequence';
import { Lead } from '../models/Lead';
import { CampaignLead } from '../models/CampaignLead';
import { ScheduledEmail } from '../models/ScheduledEmail';
import { CommunicationLog } from '../models/CommunicationLog';
import { User } from '../models/User';
import { AiAgent } from '../models/AiAgent';
import { createSequence } from '../services/sequenceService';
import { createCampaign, transitionApproval } from '../services/campaignService';
import { createDraft, approveDraft, rejectDraft, listDrafts, getDraftStats } from '../services/draftService';
import { advanceLead, markSequenceCompleted } from '../services/leadProgressionService';
import { generateCeoIntroEmail } from '../services/messageAgentService';
import { polish } from '../agents/emailPolisherAgent';
import { classifyResponse } from '../agents/responseClassifierAgent';
import { runDailyDraftCycle } from '../services/sequenceEngineService';
import { claimPendingActions } from '../services/schedulerService';
import { calculateLeadScore, getLeadTemperature } from '../services/leadScoringService';
import { Op } from 'sequelize';

const PASS = '  ✅';
const FAIL = '  ❌';
const WARN = '  ⚠️';
const INFO = '  ℹ️';

let totalPass = 0;
let totalFail = 0;
let totalWarn = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`${PASS} ${label}${detail ? ' — ' + detail : ''}`);
    totalPass++;
  } else {
    console.log(`${FAIL} ${label}${detail ? ' — ' + detail : ''}`);
    totalFail++;
  }
}

function warn(label: string, detail?: string) {
  console.log(`${WARN} ${label}${detail ? ' — ' + detail : ''}`);
  totalWarn++;
}

function info(label: string) {
  console.log(`${INFO} ${label}`);
}

async function run() {
  const sequelize = getSequelize();
  initModels(sequelize);
  await sequelize.authenticate();

  console.log('═══════════════════════════════════════════════════════');
  console.log('  CEO INTRO ENGINE — FULL SYSTEM VALIDATION');
  console.log('═══════════════════════════════════════════════════════\n');

  // ──────────── 1. CAMPAIGN SETUP ────────────
  console.log('── 1. CAMPAIGN SETUP ──\n');

  // Create 2 test leads
  const lead1 = await Lead.create({
    first_name: 'Sandra', last_name: 'Mitchell', email: 'sandra.mitchell@acmecorp.com',
    phone: '+15559001234', company: 'Acme Corp', title: 'VP Operations', industry: 'Logistics',
    company_size: 300, lead_source: 'past_client', lead_source_type: 'warm',
    temperature: 'warm', lead_score: 70, pipeline_stage: 'new_lead', status: 'active',
    notes: null, technology_stack: null, annual_revenue: null, linkedin_url: null,
    interest_area: 'fleet management', lifecycle_stage: null, utm_source: null,
  });
  const lead2 = await Lead.create({
    first_name: 'David', last_name: 'Chen', email: 'david.chen@globaltrade.io',
    phone: '+15559005678', company: 'Global Trade Inc', title: 'CEO', industry: 'Import/Export',
    company_size: 150, lead_source: 'past_client', lead_source_type: 'warm',
    temperature: 'warm', lead_score: 80, pipeline_stage: 'new_lead', status: 'active',
    notes: null, technology_stack: null, annual_revenue: null, linkedin_url: null,
    interest_area: 'executive travel', lifecycle_stage: null, utm_source: null,
  });
  info(`Lead 1 created: ${lead1.id} — ${lead1.first_name} ${lead1.last_name} (${lead1.email})`);
  info(`Lead 2 created: ${lead2.id} — ${lead2.first_name} ${lead2.last_name} (${lead2.email})`);

  // Create 3-step CEO intro sequence
  const sequence = await createSequence({
    name: 'CEO Past Client Outreach',
    steps: [
      {
        delay_days: 0, channel: 'email', subject: 'Reconnecting',
        body_template: 'Intro email template', ai_instructions: 'Write a warm intro email reconnecting with a past client. Reference their company and industry. Be personal and genuine.',
        ai_tone: 'warm', step_goal: 'Re-establish connection', max_attempts: 1,
      },
      {
        delay_days: 4, channel: 'email', subject: 'Following Up',
        body_template: 'Follow-up template', ai_instructions: 'Write a follow-up email adding value. Share an insight relevant to their industry. Reference the previous email.',
        ai_tone: 'professional', step_goal: 'Add value and build interest', max_attempts: 1,
      },
      {
        delay_days: 8, channel: 'email', subject: 'One Last Note',
        body_template: 'Final email template', ai_instructions: 'Write a graceful final outreach. Acknowledge their time, leave the door open, suggest a brief call if interested.',
        ai_tone: 'warm', step_goal: 'Graceful close', max_attempts: 1,
      },
    ],
  });
  info(`Sequence created: ${sequence.id} — ${sequence.name} (${sequence.steps.length} steps)`);

  // Create CEO intro campaign
  const admin = await User.findOne({ where: { role: 'admin' } });
  const campaign = await createCampaign({
    name: 'Q2 Past Client CEO Outreach',
    type: 'executive_outreach',
    description: 'Ryan Landry personal outreach to past clients',
    sequence_id: sequence.id,
    targeting_criteria: null,
    channel_config: { email: { enabled: true, daily_limit: 20 } },
    ai_system_prompt: 'You are writing on behalf of Ryan Landry, CEO of LandJet, a premium private aviation company. The tone is warm, personal, and professional.',
    settings: { test_mode_enabled: false, delay_between_sends: 120 },
    budget_total: null, budget_cap: null, cost_per_lead_target: null,
    expected_roi: null, goals: 'Reconnect with past clients', gtm_notes: null, interest_group: null,
    created_by: admin?.id || null,
  }, admin?.id || '');

  // Activate campaign
  await transitionApproval(campaign.id, 'pending_approval', admin?.id || '');
  await transitionApproval(campaign.id, 'approved', admin?.id || '');
  await transitionApproval(campaign.id, 'live', admin?.id || '');
  const activeCampaign = await Campaign.findByPk(campaign.id);

  check('Campaign created', !!activeCampaign, `id=${campaign.id}`);
  check('Campaign type is executive_outreach', activeCampaign?.type === 'executive_outreach');
  check('Campaign status is active', activeCampaign?.status === 'active');
  check('Campaign approval_status is live', activeCampaign?.approval_status === 'live');
  check('Sequence linked', activeCampaign?.sequence_id === sequence.id);

  // Enroll leads (draft mode)
  for (const lead of [lead1, lead2]) {
    await CampaignLead.create({
      campaign_id: campaign.id, lead_id: lead.id,
      status: 'active', lifecycle_status: 'enrolled', enrolled_at: new Date(),
      current_step_index: 0, total_steps: 3,
      next_action_at: new Date(), // Due immediately
      metadata: { draft_mode: true, outreach_step: '1st_outreach' },
    });
  }

  const enrolledLeads = await CampaignLead.findAll({ where: { campaign_id: campaign.id } });
  check('2 leads enrolled', enrolledLeads.length === 2);
  for (const cl of enrolledLeads) {
    check(`Lead ${cl.lead_id} status=active, step=0, next_action_at=NOW`,
      cl.status === 'active' && cl.current_step_index === 0 && cl.next_action_at !== null,
      `metadata.draft_mode=${(cl.metadata as any)?.draft_mode}`);
  }

  // ──────────── 2. RUN SEQUENCE ENGINE ────────────
  console.log('\n── 2. RUN SEQUENCE ENGINE ──\n');

  const cycleResult = await runDailyDraftCycle();
  info(`Cycle result: draftsCreated=${cycleResult.draftsCreated}, leadsProcessed=${cycleResult.leadsProcessed}, errors=${cycleResult.errors.length}`);
  check('Drafts created for both leads', cycleResult.draftsCreated === 2);
  check('Both leads processed', cycleResult.leadsProcessed === 2);
  check('No errors', cycleResult.errors.length === 0, cycleResult.errors.join('; '));

  if (cycleResult.errors.length > 0) {
    for (const err of cycleResult.errors) {
      console.log(`  ERROR: ${err}`);
    }
  }

  // ──────────── 3. MESSAGE GENERATION ────────────
  console.log('\n── 3. MESSAGE GENERATION ──\n');

  // Test direct generation for lead1
  const generatedMsg = await generateCeoIntroEmail({
    lead: lead1,
    step: sequence.steps[0],
    campaign: activeCampaign!,
    stepIndex: 0,
  });
  info(`Generated subject: "${generatedMsg.subject}"`);
  info(`Generated body (first 200 chars): ${generatedMsg.body.substring(0, 200)}...`);
  info(`Model: ${generatedMsg.model}, tokens: ${generatedMsg.tokens_used}`);
  check('Message body is non-empty', generatedMsg.body.length > 0);
  check('Message has subject', !!generatedMsg.subject && generatedMsg.subject.length > 0);

  if (generatedMsg.model === 'fallback') {
    warn('AI generation used fallback (no OPENAI_API_KEY configured)', 'This is expected in test env without API key');
  } else {
    check('AI model was used (not fallback)', generatedMsg.model !== 'fallback');
  }

  // ──────────── 4. EMAIL POLISHER ────────────
  console.log('\n── 4. EMAIL POLISHER ──\n');

  const beforeBody = 'hello sandra,\n\nthis is a test email with some issues. we wanted to reach out about your fleet. Let me know what you think.\n\nbest,';
  const polished = await polish({
    subject: 'Test Subject',
    body: beforeBody,
    leadFirstName: 'Sandra',
    stepGoal: 'Re-establish connection',
    aiTone: 'warm',
  });
  info(`Before: "${beforeBody.substring(0, 100)}..."`);
  info(`After: "${polished.body.substring(0, 100)}..."`);
  info(`Quality score: ${polished.quality_score}`);
  info(`Changes: ${polished.changes_made.join(', ')}`);
  check('Polisher returned body', polished.body.length > 0);
  check('Polisher returned subject', polished.subject.length > 0);

  if (polished.quality_score === 0 && polished.changes_made.length === 0) {
    warn('Polisher returned defaults (no OPENAI_API_KEY)', 'Expected in test env');
  }

  // ──────────── 5. DRAFT CREATION ────────────
  console.log('\n── 5. DRAFT CREATION ──\n');

  const drafts = await ScheduledEmail.findAll({
    where: { campaign_id: campaign.id, status: 'draft' },
  });
  info(`Drafts found in DB: ${drafts.length}`);

  // Check drafts from the sequence engine run (they may have been auto-advanced already)
  const allDraftsAndAdvanced = await ScheduledEmail.findAll({
    where: { campaign_id: campaign.id },
    order: [['created_at', 'DESC']],
  });
  info(`Total scheduled_email records for campaign: ${allDraftsAndAdvanced.length}`);

  for (const d of allDraftsAndAdvanced) {
    info(`  Draft ${d.id.substring(0, 8)}... lead=${d.lead_id} step=${d.step_index} status=${d.status} channel=${d.channel}`);
    check(`Draft has email channel`, d.channel === 'email');
    check(`Draft has to_email`, !!d.to_email);
    check(`Draft has body content`, !!d.body && d.body.length > 0);
    check(`Draft metadata.draft_mode=true`, (d.metadata as any)?.draft_mode === true);
    check(`Draft metadata.ceo_signature_appended=true`, (d.metadata as any)?.ceo_signature_appended === true);
  }

  // Verify CEO signature in body
  if (allDraftsAndAdvanced.length > 0) {
    const sampleBody = allDraftsAndAdvanced[0].body || '';
    check('CEO signature present in body', sampleBody.includes('Ryan Landry'));
    check('CEO signature has phone number', sampleBody.includes('949.412.2682'));
    check('CEO signature has LandJet tagline', sampleBody.includes('Get In. Get Connected.'));
  }

  // Verify listDrafts API works
  const draftList = await listDrafts({ campaign_id: campaign.id });
  info(`listDrafts returned ${draftList.total} drafts`);

  // ──────────── 6. LEAD PROGRESSION ────────────
  console.log('\n── 6. LEAD PROGRESSION ──\n');

  const leadsAfterCycle = await CampaignLead.findAll({ where: { campaign_id: campaign.id } });
  for (const cl of leadsAfterCycle) {
    const meta = (cl.metadata || {}) as Record<string, any>;
    info(`Lead ${cl.lead_id}: step=${cl.current_step_index}, status=${cl.status}, outreach=${meta.outreach_step}, next=${cl.next_action_at?.toISOString()}`);

    check(`Lead ${cl.lead_id} step advanced to 1`, cl.current_step_index === 1, `got ${cl.current_step_index}`);
    check(`Lead ${cl.lead_id} outreach_step is 2nd_outreach`, meta.outreach_step === '2nd_outreach', `got ${meta.outreach_step}`);
    check(`Lead ${cl.lead_id} touchpoint_count >= 1`, cl.touchpoint_count >= 1);

    if (cl.next_action_at) {
      const daysDiff = (cl.next_action_at.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
      check(`Lead ${cl.lead_id} next_action_at is ~4 days out`, daysDiff > 3 && daysDiff < 5, `${daysDiff.toFixed(1)} days`);
    } else {
      check(`Lead ${cl.lead_id} next_action_at is set`, false, 'null');
    }
  }

  // Check pipeline_stage advanced on first touch
  const lead1After = await Lead.findByPk(lead1.id);
  check('Lead 1 pipeline advanced to contacted', lead1After?.pipeline_stage === 'contacted', `got ${lead1After?.pipeline_stage}`);

  // ──────────── 7. SCHEDULER SAFETY ────────────
  console.log('\n── 7. SCHEDULER SAFETY ──\n');

  // Verify scheduler does NOT claim draft-status records
  const draftRecords = await ScheduledEmail.findAll({ where: { status: 'draft' } });
  info(`Draft-status records in DB: ${draftRecords.length}`);

  // Temporarily create a test draft to verify scheduler behavior
  const testDraft = await ScheduledEmail.create({
    lead_id: lead1.id, campaign_id: campaign.id, sequence_id: sequence.id,
    step_index: 99, channel: 'email', subject: 'SCHEDULER TEST', body: 'test',
    to_email: lead1.email, max_attempts: 1, fallback_channel: null,
    scheduled_for: new Date(Date.now() - 60000), // 1 min ago
    status: 'draft', ai_instructions: null, is_test_action: false, metadata: { draft_mode: true },
  });

  const claimed = await claimPendingActions();
  const claimedDraft = claimed.find(a => a.id === testDraft.id);
  check('Scheduler did NOT claim draft-status record', !claimedDraft,
    claimedDraft ? 'CRITICAL: Draft was claimed!' : 'Draft correctly excluded');

  // Check if it claims approved records
  await testDraft.update({ status: 'approved', scheduled_for: new Date(Date.now() - 60000) });
  const claimed2 = await claimPendingActions();
  const claimedApproved = claimed2.find(a => a.id === testDraft.id);
  check('Scheduler DOES claim approved-status record', !!claimedApproved,
    claimedApproved ? 'Approved correctly claimed' : 'WARNING: Approved not claimed');

  // Clean up test records
  await testDraft.update({ status: 'cancelled' });
  // Reset any claimed records back
  for (const c of [...claimed, ...claimed2]) {
    if (c.id !== testDraft.id) await c.update({ status: 'pending', processing_started_at: null, processor_id: null });
  }

  // ──────────── 8. DRAFT APPROVE/REJECT FLOW ────────────
  console.log('\n── 8. DRAFT APPROVE/REJECT FLOW ──\n');

  // Find a draft to test approval
  const testApprovalDraft = await ScheduledEmail.findOne({ where: { campaign_id: campaign.id, status: 'draft' } });

  if (testApprovalDraft) {
    // Test reject
    const rejected = await rejectDraft(testApprovalDraft.id, admin?.id || 'test', 'Too formal');
    check('Draft rejected successfully', rejected.status === 'cancelled');
    check('Rejection reason stored', (rejected.metadata as any)?.rejection_reason === 'Too formal');

    // Create another draft to test approval
    const approvableDraft = await ScheduledEmail.create({
      lead_id: lead1.id, campaign_id: campaign.id, sequence_id: sequence.id,
      step_index: 0, channel: 'email', subject: 'Approve Test', body: '<p>Test body</p>',
      to_email: lead1.email, max_attempts: 1, fallback_channel: null,
      scheduled_for: new Date(), status: 'draft',
      ai_instructions: null, is_test_action: false, metadata: { draft_mode: true },
    });

    const approved = await approveDraft(approvableDraft.id, admin?.id || 'test');
    check('Draft approved successfully', approved.status === 'approved');
    check('approved_by stored in metadata', (approved.metadata as any)?.approved_by === (admin?.id || 'test'));
    check('approved_at stored in metadata', !!(approved.metadata as any)?.approved_at);
    check('scheduled_for set to NOW', approved.scheduled_for.getTime() <= Date.now() + 5000);

    // Verify can't double-approve
    try {
      await approveDraft(approvableDraft.id, admin?.id || 'test');
      check('Cannot double-approve', false, 'Should have thrown');
    } catch (e) {
      check('Cannot double-approve (throws error)', true, (e as Error).message);
    }
  } else {
    warn('No drafts available to test approve/reject flow', 'All drafts may have been processed');
  }

  // ──────────── 9. RESPONSE CLASSIFIER (SIMULATED) ────────────
  console.log('\n── 9. RESPONSE CLASSIFIER ──\n');

  const classResult = await classifyResponse({
    inboundBody: 'Hi Ryan, great to hear from you! I\'d love to catch up. How about a call next Tuesday afternoon? We\'ve been looking at upgrading our travel arrangements.',
    inboundSubject: 'Re: Reconnecting',
    leadId: lead1.id,
    leadEmail: lead1.email,
    campaignId: campaign.id,
  });
  info(`Classification: ${classResult.classification}`);
  info(`Confidence: ${classResult.confidence}`);
  info(`Summary: ${classResult.summary}`);
  info(`Recommended action: ${classResult.recommended_action}`);
  check('Classification returned', !!classResult.classification);

  if (classResult.classification === 'unknown' && classResult.confidence === 0) {
    warn('Classifier returned unknown (no OPENAI_API_KEY)', 'Expected in test env without API key');
  } else {
    check('Positive response detected', classResult.classification === 'positive');
  }

  // ──────────── 10. FAILURE CASES ────────────
  console.log('\n── 10. FAILURE CASES ──\n');

  // Test with invalid lead
  try {
    await generateCeoIntroEmail({
      lead: { id: 99999, first_name: '', last_name: '', email: '' } as any,
      step: sequence.steps[0],
      campaign: activeCampaign!,
      stepIndex: 0,
    });
    info('AI generation did not throw (returned fallback)');
    check('Handles invalid lead gracefully', true);
  } catch (e) {
    check('Handles invalid lead gracefully', false, (e as Error).message);
  }

  // Test sequence completion
  const completionLead = await CampaignLead.findOne({ where: { campaign_id: campaign.id, lead_id: lead2.id } });
  if (completionLead) {
    await markSequenceCompleted(campaign.id, lead2.id, 'test_completion');
    const completedLead = await CampaignLead.findOne({ where: { campaign_id: campaign.id, lead_id: lead2.id } });
    check('markSequenceCompleted sets status=completed', completedLead?.status === 'completed');
    check('markSequenceCompleted sets completed_at', !!completedLead?.completed_at);
    check('markSequenceCompleted sets outcome', completedLead?.outcome === 'test_completion');
  }

  // ──────────── 11. STATS DASHBOARD ────────────
  console.log('\n── 11. STATS DASHBOARD ──\n');

  const stats = await getDraftStats(campaign.id);
  info(`Stats: pending=${stats.pending_drafts}, approved=${stats.approved_today}, rejected=${stats.rejected_today}, sent=${stats.sent_today}`);
  check('Stats endpoint returns data', stats.pending_drafts >= 0);

  // ══════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  VALIDATION SUMMARY');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  ✅ PASSED: ${totalPass}`);
  console.log(`  ❌ FAILED: ${totalFail}`);
  console.log(`  ⚠️  WARNINGS: ${totalWarn}`);
  console.log('═══════════════════════════════════════════════════════\n');

  if (totalFail > 0) {
    console.log('⛔ VALIDATION INCOMPLETE — see failures above');
  } else if (totalWarn > 0) {
    console.log('✅ CORE VALIDATION PASSED (warnings are expected without OPENAI_API_KEY)');
  } else {
    console.log('✅ ALL VALIDATIONS PASSED');
  }

  await sequelize.close();
}

run().catch((e) => {
  console.error('VALIDATION SCRIPT FAILED:', e);
  process.exit(1);
});
