import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import { createLead, getLeadById, updateLead, listLeads } from '../../services/leadService';
import { createAuditLog } from '../../services/auditLogService';
import { logger } from '../../config/logger';

const router = Router();

// All lead routes require authentication
router.use(authenticate);

router.post('/', authorize('leads:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { lead, scoreBreakdown } = await createLead(req.body);

    await createAuditLog({
      userId: req.user!.userId,
      action: 'lead.create',
      entityType: 'lead',
      entityId: String(lead.id),
      newValue: { email: lead.email, score: lead.lead_score },
      ipAddress: req.ip || null,
    });

    res.status(201).json({ lead, scoreBreakdown });
  } catch (error) {
    next(error);
  }
});

router.get('/', authorize('leads:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = {
      status: req.query.status as string,
      pipeline_stage: req.query.pipeline_stage as string,
      temperature: req.query.temperature as string,
      industry: req.query.industry as string,
      lead_source_type: req.query.lead_source_type as string,
      search: req.query.search as string,
      min_score: req.query.min_score ? Number(req.query.min_score) : undefined,
      max_score: req.query.max_score ? Number(req.query.max_score) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : 25,
      offset: req.query.offset ? Number(req.query.offset) : 0,
    };

    const result = await listLeads(filters);
    res.json({
      leads: result.rows,
      total: result.count,
      limit: filters.limit,
      offset: filters.offset,
    });
  } catch (error) {
    next(error);
  }
});

// --- Data Export (must be before /:id to avoid param matching) ---

router.get('/export', authorize('leads:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const format = (req.query.format as string) || 'json';
    if (!['json', 'csv'].includes(format)) {
      return res.status(400).json({ error: 'Format must be "json" or "csv"' });
    }

    const result = await listLeads({
      status: req.query.status as string,
      pipeline_stage: req.query.pipeline_stage as string,
      temperature: req.query.temperature as string,
      industry: req.query.industry as string,
      limit: 5000,
      offset: 0,
    });

    await createAuditLog({
      userId: req.user!.userId,
      action: 'lead.export',
      entityType: 'lead',
      entityId: null,
      newValue: { format, count: result.count },
      ipAddress: req.ip || null,
    });

    logger.info('Data export requested', { userId: req.user!.userId, format, count: result.count });

    if (format === 'csv') {
      const headers = ['id', 'first_name', 'last_name', 'email', 'company', 'title', 'phone', 'industry', 'vertical', 'temperature', 'lead_score', 'pipeline_stage', 'status', 'created_at'];
      const csvLines = [headers.join(',')];
      for (const lead of result.rows) {
        const row = headers.map(h => {
          const val = (lead as any)[h];
          if (val === null || val === undefined) return '';
          const str = String(val);
          return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
        });
        csvLines.push(row.join(','));
      }
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="leads-export-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.send(csvLines.join('\n'));
    } else {
      res.json({ leads: result.rows, total: result.count, exported_at: new Date().toISOString() });
    }
  } catch (error) {
    logger.error('Data export failed', { error: (error as Error).message });
    next(error);
  }
});

router.get('/:id', authorize('leads:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lead = await getLeadById(Number(req.params.id));
    res.json({ lead });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', authorize('leads:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lead = await updateLead(Number(req.params.id), req.body);

    await createAuditLog({
      userId: req.user!.userId,
      action: 'lead.update',
      entityType: 'lead',
      entityId: String(lead.id),
      newValue: req.body,
      ipAddress: req.ip || null,
    });

    res.json({ lead });
  } catch (error) {
    next(error);
  }
});

export default router;
