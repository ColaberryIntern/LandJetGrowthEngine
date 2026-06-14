/**
 * Backfill leads.pipeline_stage based on existing communication history.
 *
 * Rules (applied in this exact order; first match wins):
 *   1. Lead has at least one INBOUND CommunicationLog row -> 'replied'
 *      (skip if pipeline_stage is already 'meeting_scheduled' or beyond)
 *   2. Lead has at least one OUTBOUND sent CommunicationLog row -> 'contacted'
 *      (only fires if currently 'new_lead' -- never demotes a lead)
 *
 * Run modes:
 *   - dry run (default): prints what would change, makes no DB writes.
 *   - apply (--apply flag): writes the changes.
 *
 * Run from inside the backend container:
 *   docker exec landjet-backend npx tsx /app/src/scripts/backfillLeadPipelineStages.ts
 *   docker exec landjet-backend npx tsx /app/src/scripts/backfillLeadPipelineStages.ts --apply
 */

import { Op } from 'sequelize';
import { getSequelize } from '../config/database';
import { initModels } from '../models';
import { Lead, PIPELINE_ORDER } from '../models/Lead';
import { CommunicationLog } from '../models/CommunicationLog';

const APPLY = process.argv.includes('--apply');

(async () => {
  const sequelize = getSequelize();
  initModels(sequelize);
  await sequelize.authenticate();

  console.log(`Backfill mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  console.log('');

  // ---- Pass 1: lead has any inbound -> 'replied' (if currently upstream) ----
  const inboundLeadIds = (await CommunicationLog.findAll({
    attributes: [[sequelize.fn('DISTINCT', sequelize.col('lead_id')), 'lead_id']],
    where: { direction: 'inbound' },
    raw: true,
  })).map((r) => Number((r as unknown as Record<string, unknown>).lead_id));

  let toReplied = 0;
  if (inboundLeadIds.length > 0) {
    const candidates = await Lead.findAll({
      where: {
        id: { [Op.in]: inboundLeadIds },
        pipeline_stage: { [Op.in]: ['new_lead', 'contacted'] }, // never demote
      },
      attributes: ['id'],
    });
    toReplied = candidates.length;
    if (APPLY && candidates.length > 0) {
      await Lead.update(
        { pipeline_stage: 'replied' },
        { where: { id: { [Op.in]: candidates.map((c) => c.id) } } },
      );
    }
  }
  console.log(`Pass 1 -- leads to advance to 'replied': ${toReplied}`);

  // ---- Pass 2: lead has any outbound sent -> 'contacted' (if still new_lead) ----
  // Use a sub-select instead of pulling all IDs to keep memory bounded on large tables.
  const newLeadsWithSends = await Lead.count({
    where: {
      pipeline_stage: 'new_lead',
      id: {
        [Op.in]: sequelize.literal(
          `(SELECT DISTINCT lead_id FROM communication_logs WHERE direction = 'outbound' AND status IN ('sent', 'delivered') AND delivery_mode = 'live')`,
        ) as unknown as number[],
      },
    },
  });
  let toContacted = newLeadsWithSends;
  if (APPLY && newLeadsWithSends > 0) {
    await Lead.update(
      { pipeline_stage: 'contacted' },
      {
        where: {
          pipeline_stage: 'new_lead',
          id: {
            [Op.in]: sequelize.literal(
              `(SELECT DISTINCT lead_id FROM communication_logs WHERE direction = 'outbound' AND status IN ('sent', 'delivered') AND delivery_mode = 'live')`,
            ) as unknown as number[],
          },
        },
      },
    );
  }
  console.log(`Pass 2 -- leads to advance to 'contacted': ${toContacted}`);

  // Final distribution
  const after = await Lead.findAll({
    attributes: ['pipeline_stage', [sequelize.fn('COUNT', sequelize.col('id')), 'cnt']],
    where: { status: 'active' },
    group: ['pipeline_stage'],
    raw: true,
  });
  console.log('');
  console.log(APPLY ? 'Distribution after apply:' : 'Distribution (unchanged, dry run):');
  const stageOrder = Object.entries(PIPELINE_ORDER).sort(([, a], [, b]) => a - b).map(([s]) => s);
  const byStage = new Map(after.map((r) => {
    const row = r as unknown as Record<string, unknown>;
    return [String(row.pipeline_stage), Number(row.cnt)];
  }));
  for (const s of stageOrder) console.log(`  ${s.padEnd(20)} ${byStage.get(s) || 0}`);

  await sequelize.close();
})().catch((e) => { console.error('ERR', e); process.exit(1); });
