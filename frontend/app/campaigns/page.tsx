'use client';

import { useState } from 'react';
import {
  createSequence, createCeoIntroCampaign, approveCampaign,
  linkSequence, createLead, enrollLeads, runCycle,
} from '@/lib/api';

type StepStatus = 'idle' | 'loading' | 'done' | 'error';

interface StepState {
  status: StepStatus;
  message: string;
}

const DEMO_SEQUENCE = {
  name: 'CEO Past Client Outreach',
  steps: [
    { delay_days: 0, channel: 'email', subject: 'Quick question for you', body_template: '', ai_instructions: 'Write a warm, personal intro email from Ryan Landry, CEO of LandJet (private aviation). Reference their company and role. Keep it short — 3 paragraphs max. Ask about their current travel needs.', ai_tone: 'warm', step_goal: 'Re-establish connection', max_attempts: 1 },
    { delay_days: 4, channel: 'email', subject: 'Thought you might find this interesting', body_template: '', ai_instructions: 'Write a value-add follow-up. Share an insight about private aviation trends relevant to their industry. Reference the first email.', ai_tone: 'professional', step_goal: 'Add value', max_attempts: 1 },
    { delay_days: 8, channel: 'email', subject: 'Last note from me', body_template: '', ai_instructions: 'Write a graceful final outreach. Acknowledge their time, leave the door open, suggest a brief 15-min call.', ai_tone: 'warm', step_goal: 'Graceful close', max_attempts: 1 },
  ],
};

const DEMO_LEADS = [
  { first_name: 'Jennifer', last_name: 'Walsh', company: 'Meridian Group', title: 'Chief Operating Officer', industry: 'Real Estate', company_size: 450 },
  { first_name: 'Marcus', last_name: 'Thompson', company: 'Pacific Ventures', title: 'Managing Partner', industry: 'Venture Capital', company_size: 85 },
];

export default function CampaignsPage() {
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [leadIds, setLeadIds] = useState<number[]>([]);
  const [step1, setStep1] = useState<StepState>({ status: 'idle', message: '' });
  const [step2, setStep2] = useState<StepState>({ status: 'idle', message: '' });
  const [step3, setStep3] = useState<StepState>({ status: 'idle', message: '' });

  async function handleCreateCampaign() {
    setStep1({ status: 'loading', message: '' });
    try {
      const seqRes = await createSequence(DEMO_SEQUENCE);
      const campRes = await createCeoIntroCampaign({
        name: 'CEO Past Client Outreach',
        description: 'Ryan Landry personal outreach to past clients',
        sequence_id: seqRes.sequence.id,
        channel_config: { email: { enabled: true, daily_limit: 20 } },
        ai_system_prompt: 'You are writing personal emails on behalf of Ryan Landry, CEO of LandJet — a premium private aviation company. Be warm, direct, and genuine.',
        settings: { test_mode_enabled: false },
      });
      const cId = campRes.campaign.id;
      await approveCampaign(cId, 'pending_approval');
      await approveCampaign(cId, 'approved');
      await approveCampaign(cId, 'live');
      setCampaignId(cId);
      setStep1({ status: 'done', message: 'Campaign created and activated' });
    } catch (e) {
      setStep1({ status: 'error', message: (e as Error).message });
    }
  }

  async function handleEnrollLeads() {
    if (!campaignId) return;
    setStep2({ status: 'loading', message: '' });
    try {
      const ids: number[] = [];
      const ts = Date.now();
      for (const lead of DEMO_LEADS) {
        const res = await createLead({
          ...lead,
          email: `${lead.first_name.toLowerCase()}.${lead.last_name.toLowerCase()}.${ts}@demo.com`,
          phone: null, lead_source: 'past_client', lead_source_type: 'warm',
          temperature: 'warm', pipeline_stage: 'new_lead', status: 'active',
        });
        ids.push(res.lead.id);
      }
      const enrollRes = await enrollLeads(campaignId, ids);
      setLeadIds(ids);
      setStep2({ status: 'done', message: `${enrollRes.enrolled} leads enrolled` });
    } catch (e) {
      setStep2({ status: 'error', message: (e as Error).message });
    }
  }

  async function handleGenerateDrafts() {
    if (!campaignId) return;
    setStep3({ status: 'loading', message: '' });
    try {
      const res = await runCycle(campaignId) as { draftsCreated: number };
      setStep3({ status: 'done', message: `${res.draftsCreated} drafts generated — review them in Draft Inbox` });
    } catch (e) {
      setStep3({ status: 'error', message: (e as Error).message });
    }
  }

  function badge(s: StepState) {
    if (s.status === 'done') return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Done</span>;
    if (s.status === 'error') return <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Error</span>;
    return null;
  }

  function stepNumber(n: number, active: boolean) {
    return (
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${active ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-400'}`}>
        {n}
      </span>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Campaign Control</h1>
      <p className="mt-1 text-sm text-gray-500">Create and manage outreach campaigns</p>

      <div className="mt-8 space-y-4">
        {/* Step 1 — Create Campaign */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {stepNumber(1, true)}
              <div>
                <p className="font-medium text-gray-900">Create Campaign</p>
                <p className="text-sm text-gray-500">Sets up a 3-step CEO outreach sequence</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {badge(step1)}
              <button
                onClick={handleCreateCampaign}
                disabled={step1.status === 'loading' || step1.status === 'done'}
                className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-40"
              >
                {step1.status === 'loading' ? 'Creating...' : step1.status === 'done' ? 'Created' : 'Create Demo Campaign'}
              </button>
            </div>
          </div>
          {step1.message && (
            <p className={`mt-3 text-sm ${step1.status === 'error' ? 'text-red-600' : 'text-gray-500'}`}>{step1.message}</p>
          )}
        </div>

        {/* Step 2 — Enroll Leads */}
        <div className={`rounded-lg border bg-white p-5 ${!campaignId ? 'border-gray-100 opacity-50' : 'border-gray-200'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {stepNumber(2, !!campaignId)}
              <div>
                <p className="font-medium text-gray-900">Enroll Leads</p>
                <p className="text-sm text-gray-500">Jennifer Walsh (COO) &amp; Marcus Thompson (Partner)</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {badge(step2)}
              <button
                onClick={handleEnrollLeads}
                disabled={!campaignId || step2.status === 'loading' || step2.status === 'done'}
                className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-40"
              >
                {step2.status === 'loading' ? 'Enrolling...' : step2.status === 'done' ? 'Enrolled' : 'Add Sample Leads'}
              </button>
            </div>
          </div>
          {step2.message && (
            <p className={`mt-3 text-sm ${step2.status === 'error' ? 'text-red-600' : 'text-gray-500'}`}>{step2.message}</p>
          )}
        </div>

        {/* Step 3 — Generate Drafts */}
        <div className={`rounded-lg border bg-white p-5 ${!leadIds.length ? 'border-gray-100 opacity-50' : 'border-gray-200'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {stepNumber(3, leadIds.length > 0)}
              <div>
                <p className="font-medium text-gray-900">Generate Drafts</p>
                <p className="text-sm text-gray-500">AI writes and polishes emails for each lead</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {badge(step3)}
              <button
                onClick={handleGenerateDrafts}
                disabled={!leadIds.length || step3.status === 'loading'}
                className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-40"
              >
                {step3.status === 'loading' ? 'Generating...' : step3.status === 'done' ? 'Generate Again' : 'Generate Drafts'}
              </button>
            </div>
          </div>
          {step3.message && (
            <p className={`mt-3 text-sm ${step3.status === 'error' ? 'text-red-600' : 'text-gray-500'}`}>{step3.message}</p>
          )}
        </div>
      </div>

      {step3.status === 'done' && (
        <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-medium text-emerald-800">Drafts are ready for review.</p>
          <a href="/drafts" className="mt-1 inline-block text-sm font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-900">
            Go to Draft Inbox →
          </a>
        </div>
      )}
    </div>
  );
}
