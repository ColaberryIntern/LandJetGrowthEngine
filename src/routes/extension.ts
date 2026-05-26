// Public extension distribution endpoints.
//
// GET /api/extension/version  -> { version, filename, sizeBytes, downloadUrl }
// GET /api/extension/latest   -> serves the current zip as an attachment
//
// No auth: this is how a fresh user discovers, downloads, and installs the
// extension before they have any credentials. The zip contains no secrets;
// users still need a valid API token (configured in the extension popup)
// before the extension does anything with the backend.

import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { logger } from '../config/logger';

const router = Router();

// docs/ is at the repo root. From a compiled file in dist/routes/, that means
// going up two levels. In dev (src/routes/) it's the same path. We resolve
// from the running process's cwd, which Docker sets to the app root.
function resolveDocsDir(): string {
  const candidates = [
    path.resolve(process.cwd(), 'docs'),
    path.resolve(__dirname, '..', '..', 'docs'),
    path.resolve(__dirname, '..', '..', '..', 'docs'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

function findLatestZip(): { filename: string; version: string; fullPath: string } | null {
  const dir = resolveDocsDir();
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(f => /^extension-v\d+\.\d+\.\d+\.zip$/.test(f));
  if (files.length === 0) return null;
  // Sort by semver descending so the newest wins.
  files.sort((a, b) => {
    const va = a.match(/v(\d+)\.(\d+)\.(\d+)/)!.slice(1).map(Number);
    const vb = b.match(/v(\d+)\.(\d+)\.(\d+)/)!.slice(1).map(Number);
    for (let i = 0; i < 3; i++) {
      if (va[i] !== vb[i]) return vb[i] - va[i];
    }
    return 0;
  });
  const filename = files[0];
  const version = filename.match(/v(\d+\.\d+\.\d+)/)![1];
  return { filename, version, fullPath: path.join(dir, filename) };
}

router.get('/version', (_req: Request, res: Response, next: NextFunction) => {
  try {
    const latest = findLatestZip();
    if (!latest) {
      return res.status(404).json({ error: 'No extension build available', code: 'NO_BUILD' });
    }
    const stats = fs.statSync(latest.fullPath);
    res.json({
      version: latest.version,
      filename: latest.filename,
      sizeBytes: stats.size,
      downloadUrl: '/api/extension/latest',
    });
  } catch (error) {
    logger.error('GET /api/extension/version failed', { error: (error as Error).message });
    next(error);
  }
});

router.get('/latest', (_req: Request, res: Response, next: NextFunction) => {
  try {
    const latest = findLatestZip();
    if (!latest) {
      return res.status(404).json({ error: 'No extension build available', code: 'NO_BUILD' });
    }
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${latest.filename}"`);
    res.setHeader('Cache-Control', 'public, max-age=300'); // 5 min
    fs.createReadStream(latest.fullPath).pipe(res);
  } catch (error) {
    logger.error('GET /api/extension/latest failed', { error: (error as Error).message });
    next(error);
  }
});

export default router;
