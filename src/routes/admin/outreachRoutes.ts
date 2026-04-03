import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import { getContactsForToday } from '../../services/outreachQueryService';

const router = Router();
router.use(authenticate);

function getSuggestedAction(stage: number): string {
  switch (stage) {
    case 1: return 'Initial Outreach';
    case 2: return 'Follow-up';
    case 3: return 'Final Touch';
    default: return 'Review';
  }
}

router.get('/today', authorize('campaigns:read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const contacts = await getContactsForToday();

    const result = contacts.map(c => ({
      contact_id: c.id,
      name: c.name,
      email: c.email,
      relationship_type: c.relationship_type,
      sequence_stage: c.sequence_stage,
      suggested_action: getSuggestedAction(c.sequence_stage),
      priority_score: c.priority_score,
      vertical: c.vertical,
      tier: c.tier,
      status: c.status,
    }));

    res.json(result);
  } catch (error) { next(error); }
});

export default router;
