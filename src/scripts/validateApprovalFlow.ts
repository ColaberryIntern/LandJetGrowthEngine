/**
 * Approval Flow Validation: Mixed approve/reject/regenerate/untouched.
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
import { approveDraft, rejectDraft, listDrafts } from '../services/draftService';
import { claimPendingActions } from '../services/schedulerService';

let pass = 0, fail = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { console.log(`  ✅ ${label}${detail ? ' — ' + detail : ''}`); pass++; }
  else    { console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); fail++; }
}
function info(s: string) { console.log(`  ℹ️  ${s}`); }
function hdr(s: string) { console.log(`\n${'═'.repeat(60)}\n  ${s}\n${'═'.repeat(60)}`); }

async function run() {
  const sequelize = getSequelize();
  initModels(sequelize);
  await sequelize.authenticate();

  hdr('APPROVAL FLOW VALIDATION');

  // ── SETUP: 4 leads, 1 campaign ──
  hdr('SETUP: 4 leads + campaign');

  const ts = Date.now();
  const leads = await Promise.all([
    Lead.create({ first_name: 'Alice', last_name: 'Approve', email: `alice.${ts}@test.com`, temperature: 'warm' as const, lead_score: 60, pipeline_stage: 'new_lead' as const, status: 'active' as const, phone: null, company: 'AproveCo', title: 'VP Sales', industry: 'Tech', company_size: 100, notes: null, technology_stack: null, annual_revenue: null, linkedin_url: null, lead_source: null, lead_source_type: null, interest_area: null, lifecycle_stage: null, utm_source: null }),
    Lead.create({ first_name: 'Bob', last_name: 'Reject', email: `bob.${ts}@test.com`, temperature: 'warm' as const, lead_score: 55, pipeline_stage: 'new_lead' as const, status: 'active' as const, phone: null, company: 'RejectInc', title: 'Director', industry: 'Finance', company_size: 50, notes: null, technology_stack: null, annual_revenue: null, linkedin_url: null, lead_source: null, lead_source_type: null, interest_area: null, lifecycle_stage: null, utm_source: null }),
    Lead.create({ first_name: 'Carol', last_name: 'Regen', email: `carol.${ts}@test.com`, temperature: 'warm' as const, lead_score: 70, pipeline_stage: 'new_lead' as const, status: 'active' as const, phone: null, company: 'RegenLLC', title: 'CEO', industry: 'Logistics', company_size: 200, notes: null, technology_stack: null, annual_revenue: null, linkedin_url: null, lead_source: null, lead_source_type: null, interest_area: null, lifecycle_stage: null, utm_source: null }),
    Lead.create({ first_name: 'Dan', last_name: 'Untouched', email: `dan.${ts}@test.com`, temperature: 'cold' as const, lead_score: 40, pipeline_stage: 'new_lead' as const, status: 'active' as const, phone: null, company: 'WaitCorp', title: 'Manager', industry: 'Retail', company_size: 30, notes: null, technology_stack: null, annual_revenue: null, linkedin_url: null, lead_source: null, lead_source_type: null, interest_area: null, lifecycle_stage: null, utm_source: null }),
  ]);
  const [leadApprove, leadReject, leadRegen, leadUntouched] = leads;
  info(`Alice (approve): lead ${leadApprove.id}`);
  info(`Bob (reject): lead ${leadReject.id}`);
  info(`Carol (regenerate): lead ${leadRegen.id}`);
  info(`Dan (untouched): lead ${leadUntouched.id}`);

  const sequence = await createSequence({
    name: `Approval Flow Test ${ts}`,
    steps: [
      { delay_days: 0, channel: 'email' as const, subject: 'Intro', body_template: 'Hello', ai_instructions: 'Write intro.', ai_tone: 'warm', step_goal: 'Connect', max_attempts: 1 },
      { delay_days: 4, channel: 'email' as const, subject: 'Follow Up', body_template: 'Followup', ai_instructions: 'Follow up.', ai_tone: 'professional', step_goal: 'Value', max_attempts: 1 },
    ],
  });

  const admin = await User.findOne({ where: { role: 'admin' } });
  const adminId = admin?.id || 'test-admin';
  const campaign = await createCampaign({
    name: `Approval Test ${ts}`, type: 'executive_outreach', description: 'test',
    sequence_id: sequence.id, targeting_criteria: null,
    channel_config: { email: { enabled: true } },
    ai_system_prompt: 'Test CEO outreach.', settings: { test_mode_enabled: false },
    budget_total: null, budget_cap: null, cost_per_lead_target: null,
    expected_roi: null, goals: null, gtm_notes: null, interest_group: null,
    created_by: adminId,
  }, adminId);
  await transitionApproval(campaign.id, 'pending_approval', adminId);
  await transitionApproval(campaign.id, 'approved', adminId);
  await transitionApproval(campaign.id, 'live', adminId);

  for (const lead of leads) {
    await CampaignLead.create({
      campaign_id: campaign.id, lead_id: lead.id,
      status: 'active', lifecycle_status: 'enrolled', enrolled_at: new Date(),
      current_step_index: 0, total_steps: 2, next_action_at: new Date(),
      metadata: { draft_mode: true, outreach_step: '1st_outreach' },
    });
  }
  check('4 leads enrolled', (await CampaignLead.count({ where: { campaign_id: campaign.id } })) === 4);

  // ── GENERATE DRAFTS ──
  hdr('GENERATE DRAFTS (Day 0)');

  const cycle = await runDailyDraftCycle();
  check('4 drafts created', cycle.draftsCreated === 4, `got ${cycle.draftsCreated}`);

  const allDrafts = await ScheduledEmail.findAll({
    where: { campaign_id: campaign.id, status: 'draft' },
    order: [['lead_id', 'ASC']],
  });
  check('4 draft-status records in DB', allDrafts.length === 4, `got ${allDrafts.length}`);

  const draftApprove = allDrafts.find(d => d.lead_id === leadApprove.id)!;
  const draftReject = allDrafts.find(d => d.lead_id === leadReject.id)!;
  const draftRegen = allDrafts.find(d => d.lead_id === leadRegen.id)!;
  const draftUntouched = allDrafts.find(d => d.lead_id === leadUntouched.id)!;

  info(`Draft for Alice (approve): ${draftApprove.id.substring(0, 8)}...`);
  info(`Draft for Bob (reject): ${draftReject.id.substring(0, 8)}...`);
  info(`Draft for Carol (regen): ${draftRegen.id.substring(0, 8)}...`);
  info(`Draft for Dan (untouched): ${draftUntouched.id.substring(0, 8)}...`);

  // ══════════════════════════════════════
  hdr('STEP 1: MIXED ACTIONS');
  // ══════════════════════════════════════

  // ACTION 1: Approve Alice's draft
  console.log('\n  --- Approve Alice ---');
  const approvedDraft = await approveDraft(draftApprove.id, adminId);
  check('Alice draft status = approved', approvedDraft.status === 'approved');
  check('Alice approved_by set', (approvedDraft.metadata as any)?.approved_by === adminId);
  check('Alice approved_at set', !!(approvedDraft.metadata as any)?.approved_at);
  check('Alice scheduled_for ≈ NOW', Math.abs(approvedDraft.scheduled_for.getTime() - Date.now()) < 5000);

  // ACTION 2: Reject Bob's draft with reason
  console.log('\n  --- Reject Bob ---');
  const rejectedDraft = await rejectDraft(draftReject.id, adminId, 'Too generic, needs more personalization for finance industry');
  check('Bob draft status = cancelled', rejectedDraft.status === 'cancelled');
  check('Bob rejection reason stored', (rejectedDraft.metadata as any)?.rejection_reason === 'Too generic, needs more personalization for finance industry');

  // ACTION 3: Reject Carol's draft, then regenerate
  console.log('\n  --- Reject + Regenerate Carol ---');
  await rejectDraft(draftRegen.id, adminId, 'Wrong tone');
  const regenOldId = draftRegen.id;

  // To regenerate: create a new draft for same lead+step (simulating the regenerate endpoint)
  // Force next_action_at back so the engine picks Carol up, and reset her step
  const carolCl = await CampaignLead.findOne({ where: { campaign_id: campaign.id, lead_id: leadRegen.id } });
  // Carol was already advanced to step 1 by the draft cycle. To regenerate step 0,
  // we need to test that creating a new draft for step 0 works when old one is cancelled.
  // The regenerate flow creates a fresh draft at the SAME step.
  const regenDraft = await ScheduledEmail.create({
    lead_id: leadRegen.id, campaign_id: campaign.id, sequence_id: sequence.id,
    step_index: 0, channel: 'email', subject: 'Reconnecting (v2)',
    body: '<p>Regenerated content for Carol</p><br><table><tr><td>Ryan Landry</td></tr></table>',
    to_email: leadRegen.email, max_attempts: 1, fallback_channel: null,
    scheduled_for: new Date(), status: 'draft',
    ai_instructions: 'Regenerated', is_test_action: false,
    metadata: { draft_mode: true, draft_version: 2, ceo_signature_appended: true },
  });
  check('Carol regenerated draft created', regenDraft.status === 'draft');
  check('Carol regen has version 2', (regenDraft.metadata as any)?.draft_version === 2);
  check('Carol regen is different record from original', regenDraft.id !== regenOldId);

  // ACTION 4: Leave Dan's draft untouched
  console.log('\n  --- Dan untouched ---');
  const danDraft = await ScheduledEmail.findByPk(draftUntouched.id);
  check('Dan draft still status = draft', danDraft?.status === 'draft');

  // ══════════════════════════════════════
  hdr('STEP 2: VERIFY STATE');
  // ══════════════════════════════════════

  const allRecords = await ScheduledEmail.findAll({
    where: { campaign_id: campaign.id },
    order: [['lead_id', 'ASC'], ['created_at', 'ASC']],
  });

  console.log('\n  --- All scheduled_email records ---');
  for (const r of allRecords) {
    const m = (r.metadata || {}) as Record<string, any>;
    const label = r.lead_id === leadApprove.id ? 'Alice' :
                  r.lead_id === leadReject.id ? 'Bob' :
                  r.lead_id === leadRegen.id ? 'Carol' : 'Dan';
    console.log(`  ${label} | ${r.id.substring(0, 8)}... | step=${r.step_index} | status=${r.status} | ver=${m.draft_version || 1} | approved=${m.approved_at?.substring(0, 10) || '-'} | rejected=${m.rejection_reason?.substring(0, 30) || '-'}`);
  }

  const approvedCount = allRecords.filter(r => r.status === 'approved').length;
  const cancelledCount = allRecords.filter(r => r.status === 'cancelled').length;
  const draftCount = allRecords.filter(r => r.status === 'draft').length;

  check('1 approved record (Alice)', approvedCount === 1, `got ${approvedCount}`);
  check('2 cancelled records (Bob + Carol original)', cancelledCount === 2, `got ${cancelledCount}`);
  check('2 draft records (Carol regen + Dan)', draftCount === 2, `got ${draftCount}`);

  // ══════════════════════════════════════
  hdr('STEP 3: SCHEDULER BEHAVIOR');
  // ══════════════════════════════════════

  info('Running claimPendingActions()...');
  const claimed = await claimPendingActions();

  const claimedIds = new Set(claimed.map(c => c.id));
  check('Scheduler claimed Alice (approved)', claimedIds.has(draftApprove.id), `claimed ${claimed.length} total`);
  check('Scheduler did NOT claim Bob (cancelled)', !claimed.find(c => c.lead_id === leadReject.id && c.step_index === 0));
  check('Scheduler did NOT claim Carol regen (draft)', !claimedIds.has(regenDraft.id));
  check('Scheduler did NOT claim Dan (draft)', !claimedIds.has(draftUntouched.id));

  // Count by status among claimed
  const claimedStatuses = claimed.map(c => c.status);
  info(`Claimed statuses: ${JSON.stringify(claimedStatuses)}`);
  check('All claimed are processing (were approved/pending)', claimedStatuses.every(s => s === 'processing'));

  // Reset claimed back (we don't want to actually send)
  for (const c of claimed) {
    if (c.id === draftApprove.id) {
      await c.update({ status: 'approved', processing_started_at: null, processor_id: null });
    } else {
      await c.update({ status: 'pending', processing_started_at: null, processor_id: null });
    }
  }

  // ══════════════════════════════════════
  hdr('STEP 4: LEAD IMPACT');
  // ══════════════════════════════════════

  const clAlice = await CampaignLead.findOne({ where: { campaign_id: campaign.id, lead_id: leadApprove.id } });
  const clBob = await CampaignLead.findOne({ where: { campaign_id: campaign.id, lead_id: leadReject.id } });
  const clCarol = await CampaignLead.findOne({ where: { campaign_id: campaign.id, lead_id: leadRegen.id } });
  const clDan = await CampaignLead.findOne({ where: { campaign_id: campaign.id, lead_id: leadUntouched.id } });

  console.log('\n  --- Lead States ---');
  for (const [name, cl] of [['Alice', clAlice], ['Bob', clBob], ['Carol', clCarol], ['Dan', clDan]] as [string, CampaignLead | null][]) {
    if (!cl) { info(`${name}: NOT FOUND`); continue; }
    const m = (cl.metadata || {}) as Record<string, any>;
    console.log(`  ${name} (lead ${cl.lead_id}): step=${cl.current_step_index} | status=${cl.status} | outreach=${m.outreach_step} | touches=${cl.touchpoint_count}`);
  }

  // Alice: approved → lead should have progressed (draft cycle already advanced her)
  check('Alice: step advanced (1)', clAlice?.current_step_index === 1);
  check('Alice: status = active (sequence continuing)', clAlice?.status === 'active');
  check('Alice: outreach = 2nd_outreach', (clAlice?.metadata as any)?.outreach_step === '2nd_outreach');

  // Bob: rejected → lead was advanced by draft cycle (progression happens at draft creation, not approval)
  // This is the current design: progression happens when the draft is CREATED, not when it's approved.
  check('Bob: step advanced (1) — progression is at draft creation time', clBob?.current_step_index === 1);
  check('Bob: status = active', clBob?.status === 'active');

  // Carol: rejected + regenerated → same state as Bob (was already advanced)
  check('Carol: step advanced (1)', clCarol?.current_step_index === 1);
  check('Carol: regenerated draft is still pending (status=draft)', regenDraft.status === 'draft');

  // Dan: untouched draft → lead was still advanced by draft cycle
  check('Dan: step advanced (1) — progression is at draft creation time', clDan?.current_step_index === 1);
  check('Dan: draft still pending approval', (await ScheduledEmail.findByPk(draftUntouched.id))?.status === 'draft');

  // Pipeline stage check
  const aliceLead = await Lead.findByPk(leadApprove.id);
  const danLead = await Lead.findByPk(leadUntouched.id);
  check('Alice pipeline = contacted', aliceLead?.pipeline_stage === 'contacted');
  check('Dan pipeline = contacted (advanced at draft creation)', danLead?.pipeline_stage === 'contacted');

  // ══════════════════════════════════════
  hdr('STEP 5: EDGE CASES');
  // ══════════════════════════════════════

  // Try to approve an already-rejected draft
  console.log('\n  --- Double-action protection ---');
  try {
    await approveDraft(draftReject.id, adminId);
    check('Cannot approve cancelled draft', false, 'Should have thrown');
  } catch (e) {
    check('Cannot approve cancelled draft (throws)', true, (e as Error).message);
  }

  // Try to reject an already-approved draft
  try {
    await rejectDraft(draftApprove.id, adminId);
    check('Cannot reject approved draft', false, 'Should have thrown');
  } catch (e) {
    check('Cannot reject approved draft (throws)', true, (e as Error).message);
  }

  // Try to approve a non-existent draft
  try {
    await approveDraft('00000000-0000-0000-0000-000000000000', adminId);
    check('Cannot approve non-existent draft', false, 'Should have thrown');
  } catch (e) {
    check('Cannot approve non-existent draft (throws)', true, (e as Error).message);
  }

  // Verify listDrafts only shows draft-status records
  const listed = await listDrafts({ campaign_id: campaign.id });
  check('listDrafts returns only draft-status', listed.drafts.every((d: any) => d.status === 'draft'), `got ${listed.total} drafts`);
  check('listDrafts count = 2 (Carol regen + Dan)', listed.total === 2, `got ${listed.total}`);

  // ══════════════════════════════════════
  hdr('FINAL SUMMARY');
  console.log(`\n  ✅ PASSED: ${pass}`);
  console.log(`  ❌ FAILED: ${fail}`);
  if (fail === 0) console.log('\n  🎉 APPROVAL FLOW VALIDATION PASSED');
  else console.log('\n  ⛔ ISSUES DETECTED');
  console.log('');

  await sequelize.close();
}

run().catch((e) => { console.error('VALIDATION FAILED:', e); process.exit(1); });
