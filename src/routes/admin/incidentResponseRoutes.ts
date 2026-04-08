import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import { createIncident, getIncidentById, listIncidents, updateIncident, getIncidentStats } from '../../services/incidentResponseService';
import { createAuditLog } from '../../services/auditLogService';

const router = Router();
router.use(authenticate);

router.get('/stats', authorize('campaigns:read'), async (_req, res, next) => {
  try { res.json(await getIncidentStats()); } catch (e) { next(e); }
});

router.get('/', authorize('campaigns:read'), async (req, res, next) => {
  try {
    const result = await listIncidents({
      status: req.query.status as string, severity: req.query.severity as string,
      incident_type: req.query.incident_type as string,
      limit: req.query.limit ? Number(req.query.limit) : 25,
      offset: req.query.offset ? Number(req.query.offset) : 0,
    });
    res.json({ incidents: result.rows, total: result.count });
  } catch (e) { next(e); }
});

router.get('/:id', authorize('campaigns:read'), async (req, res, next) => {
  try { res.json({ incident: await getIncidentById(req.params.id as string) }); } catch (e) { next(e); }
});

router.post('/', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const incident = await createIncident({ ...req.body, reported_by: req.user!.userId });
    await createAuditLog({ userId: req.user!.userId, action: 'incident.create', entityType: 'security_incident', entityId: incident.id, newValue: { title: incident.title, type: incident.incident_type }, ipAddress: req.ip || null });
    res.status(201).json({ incident });
  } catch (e) { next(e); }
});

router.patch('/:id', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const incident = await updateIncident(req.params.id as string, req.body);
    await createAuditLog({ userId: req.user!.userId, action: 'incident.update', entityType: 'security_incident', entityId: incident.id, newValue: req.body, ipAddress: req.ip || null });
    res.json({ incident });
  } catch (e) { next(e); }
});

export default router;
