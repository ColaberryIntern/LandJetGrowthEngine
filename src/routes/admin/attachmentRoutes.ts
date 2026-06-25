// Outreach attachments management -- upload / list / delete the PDFs that
// get attached to campaign emails (investor deck, intro deck, etc.).
//
// Files live in OUTREACH_ATTACHMENTS_DIR (default /opt/landjet-growth-engine/attachments).
// Each campaign step references a file by its filename via sequence_steps[i].attachment_path.
// The outreach /advance route reads that path, base64-encodes, and forwards to Graph
// sendMail. See src/services/outreachEmailService.ts loadAttachmentFromPath().
//
// Body-parser JSON limit is bumped on this router so 10-20MB decks can come
// through as base64 payloads (no multer dep required for this volume).

import { Router, Request, Response, NextFunction } from 'express';
import express from 'express';
import { promises as fs } from 'fs';
import * as path from 'path';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import { logger } from '../../config/logger';

const router = Router();
router.use(authenticate);

// 25MB JSON limit on this router only -- enough for any reasonable PDF deck
router.use(express.json({ limit: '25mb' }));

const ATTACHMENTS_DIR = process.env.OUTREACH_ATTACHMENTS_DIR || '/opt/landjet-growth-engine/attachments';

const ALLOWED_EXTS = new Set(['.pdf', '.docx', '.pptx', '.png', '.jpg', '.jpeg']);
const FILENAME_RE = /^[A-Za-z0-9._-]{1,128}$/;

async function ensureDir(): Promise<void> {
  await fs.mkdir(ATTACHMENTS_DIR, { recursive: true });
}

function safePath(filename: string): string | null {
  if (!FILENAME_RE.test(filename)) return null;
  const ext = path.extname(filename).toLowerCase();
  if (!ALLOWED_EXTS.has(ext)) return null;
  const resolved = path.resolve(ATTACHMENTS_DIR, filename);
  if (!resolved.startsWith(path.resolve(ATTACHMENTS_DIR))) return null;
  return resolved;
}

// List attachments
router.get('/', authorize('campaigns:read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureDir();
    const entries = await fs.readdir(ATTACHMENTS_DIR);
    const files = await Promise.all(entries.map(async name => {
      try {
        const stat = await fs.stat(path.join(ATTACHMENTS_DIR, name));
        if (!stat.isFile()) return null;
        return {
          filename: name,
          size_bytes: stat.size,
          uploaded_at: stat.mtime.toISOString(),
        };
      } catch { return null; }
    }));
    res.json({
      attachments_dir: ATTACHMENTS_DIR,
      files: files.filter(Boolean).sort((a: any, b: any) => b.uploaded_at.localeCompare(a.uploaded_at)),
    });
  } catch (error) { next(error); }
});

// Upload a new attachment (base64 in JSON body, no multer dep)
router.post('/', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { filename, base64 } = req.body || {};
    if (typeof filename !== 'string' || typeof base64 !== 'string') {
      return res.status(400).json({ error: 'filename and base64 are required' });
    }
    const dest = safePath(filename);
    if (!dest) {
      return res.status(400).json({ error: 'Invalid filename. Allowed: letters, digits, ._- (max 128 chars), extension in .pdf/.docx/.pptx/.png/.jpg/.jpeg' });
    }
    await ensureDir();
    const buf = Buffer.from(base64, 'base64');
    if (buf.length > 25 * 1024 * 1024) {
      return res.status(413).json({ error: 'File too large (25MB max).' });
    }
    await fs.writeFile(dest, buf);
    logger.info('Outreach attachment uploaded', { filename, size_bytes: buf.length });
    res.json({ filename, size_bytes: buf.length, uploaded_at: new Date().toISOString() });
  } catch (error) {
    logger.error('Attachment upload failed', { error: (error as Error).message });
    next(error);
  }
});

// Download / view a single attachment inline. Powers the "View" link in the
// campaign editor so a user can open the exact PDF a step will attach. Served
// with an inline disposition so the browser opens it in a tab rather than
// force-downloading. Same safePath guard as upload/delete (no traversal, only
// whitelisted extensions).
const CONTENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

router.get('/:filename/download', authorize('campaigns:read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const raw = req.params.filename;
    const filename = Array.isArray(raw) ? raw[0] : (raw || '');
    const dest = safePath(filename);
    if (!dest) return res.status(400).json({ error: 'Invalid filename' });
    try {
      const buf = await fs.readFile(dest);
      const ext = path.extname(filename).toLowerCase();
      res.setHeader('Content-Type', CONTENT_TYPES[ext] || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      return res.send(buf);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        return res.status(404).json({ error: 'File not found' });
      }
      throw e;
    }
  } catch (error) { next(error); }
});

// Delete an attachment
router.delete('/:filename', authorize('campaigns:write'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const raw = req.params.filename;
    const filename = Array.isArray(raw) ? raw[0] : (raw || '');
    const dest = safePath(filename);
    if (!dest) return res.status(400).json({ error: 'Invalid filename' });
    try {
      await fs.unlink(dest);
      logger.info('Outreach attachment deleted', { filename });
      return res.json({ deleted: filename });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        return res.status(404).json({ error: 'File not found' });
      }
      throw e;
    }
  } catch (error) { next(error); }
});

export default router;
