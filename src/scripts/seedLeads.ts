/**
 * Seed script for development - creates 10 sample leads.
 * Run with: npx ts-node src/scripts/seedLeads.ts
 */
import '../config/environment';
import { getSequelize } from '../config/database';
import { initModels, Lead } from '../models';
import { calculateLeadScore, getLeadTemperature } from '../services/leadScoringService';

const SAMPLE_LEADS = [
  { first_name: 'Sarah', last_name: 'Chen', email: 'sarah.chen@techcorp.com', phone: '+15551234567', company: 'TechCorp Solutions', title: 'CEO', industry: 'SaaS', company_size: 250, lead_source: 'website', lead_source_type: 'inbound', utm_source: 'pricing-page' },
  { first_name: 'Marcus', last_name: 'Johnson', email: 'mjohnson@finwave.io', phone: '+15552345678', company: 'FinWave Capital', title: 'VP Engineering', industry: 'FinTech', company_size: 120, lead_source: 'apollo', lead_source_type: 'cold' },
  { first_name: 'Elena', last_name: 'Rodriguez', email: 'elena@gmail.com', company: 'Freelance Consulting', title: 'Consultant', industry: 'Consulting', company_size: 1, lead_source: 'referral', lead_source_type: 'warm' },
  { first_name: 'David', last_name: 'Park', email: 'david.park@healthtechglobal.com', phone: '+15553456789', company: 'HealthTech Global', title: 'CTO', industry: 'Healthcare', company_size: 500, lead_source: 'linkedin', lead_source_type: 'cold' },
  { first_name: 'Amanda', last_name: 'Foster', email: 'afoster@retailnext.com', company: 'RetailNext Inc', title: 'Director of Operations', industry: 'Retail', company_size: 80, lead_source: 'webinar', lead_source_type: 'inbound', lifecycle_stage: 'evaluating' },
  { first_name: 'James', last_name: 'Williams', email: 'james@hotmail.com', company: 'Small Biz LLC', title: 'Owner', industry: 'Retail', company_size: 5, lead_source: 'google_ads', lead_source_type: 'inbound' },
  { first_name: 'Priya', last_name: 'Sharma', email: 'priya.sharma@aiventures.co', phone: '+15554567890', company: 'AI Ventures', title: 'Chief AI Officer', industry: 'AI/ML', company_size: 200, lead_source: 'conference', lead_source_type: 'warm' },
  { first_name: 'Robert', last_name: 'Kim', email: 'rkim@megacorp.com', phone: '+15555678901', company: 'MegaCorp Industries', title: 'VP Sales', industry: 'Manufacturing', company_size: 5000, lead_source: 'apollo', lead_source_type: 'cold' },
  { first_name: 'Lisa', last_name: 'Thompson', email: 'lthompson@eduspark.edu', company: 'EduSpark Academy', title: 'President', industry: 'Education', company_size: 45, lead_source: 'partner', lead_source_type: 'warm' },
  { first_name: 'Michael', last_name: 'Brown', email: 'mbrown@cloudscale.io', phone: '+15556789012', company: 'CloudScale Systems', title: 'Founder & CEO', industry: 'Cloud Infrastructure', company_size: 150, lead_source: 'website', lead_source_type: 'inbound', utm_source: 'pricing' },
];

async function seed() {
  const sequelize = getSequelize();
  initModels(sequelize);

  console.log('Seeding 10 sample leads...');

  for (const data of SAMPLE_LEADS) {
    const score = calculateLeadScore(data);
    const temperature = getLeadTemperature(score.total);

    await Lead.create({
      ...data,
      lead_score: score.total,
      temperature,
      pipeline_stage: 'new_lead',
      status: 'active',
      notes: null,
      technology_stack: null,
      annual_revenue: null,
      linkedin_url: null,
      interest_area: null,
      lifecycle_stage: (data as any).lifecycle_stage || null,
      utm_source: (data as any).utm_source || null,
    });

    console.log(`  Created: ${data.first_name} ${data.last_name} (score: ${score.total}, temp: ${temperature})`);
  }

  console.log('Done!');
  await sequelize.close();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
