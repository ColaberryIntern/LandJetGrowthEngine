// Extension distribution endpoints.
//
// GET /api/extension/version  -> { version, filename, sizeBytes, downloadUrl }
//     Public. Used by the admin app to render the Download / Update button.
//
// GET /api/extension/latest   -> streams a personalized extension zip
//     Auth required (JWT or X-API-Token). On hit, looks up the caller's
//     api_token (auto-generating one if missing) and injects it into a
//     `config.js` file in the zip so the extension is pre-configured.
//     The user never has to paste a token.

import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import AdmZip from 'adm-zip';
import { authenticate } from '../middleware/auth';
import { User } from '../models/User';
import { logger } from '../config/logger';

const router = Router();

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

// Public: just version metadata, no token, no auth.
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

// Authenticated: personalized download with the user's api_token baked in.
router.get('/latest', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const latest = findLatestZip();
    if (!latest) {
      return res.status(404).json({ error: 'No extension build available', code: 'NO_BUILD' });
    }

    // Look up the user. If api_token is null, generate one and persist so
    // future downloads (and the extension itself) use the same value.
    const user = await User.findByPk(req.user!.userId);
    if (!user) return res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });

    if (!user.api_token) {
      user.api_token = crypto.randomBytes(32).toString('hex');
      await user.save();
      logger.info('Auto-generated api_token for extension download', { userId: user.id });
    }

    // Derive the API base URL the extension should call. Prefer the request's
    // own origin (so a download from growth.landjet.com bakes in growth.landjet.com)
    // and fall back to the production IP if X-Forwarded-Host isn't trustworthy.
    const forwardedHost = (req.headers['x-forwarded-host'] as string) || req.headers.host || '';
    const forwardedProto = (req.headers['x-forwarded-proto'] as string) || (req.secure ? 'https' : 'http');
    const apiBase = forwardedHost
      ? `${forwardedProto}://${forwardedHost}/api`
      : 'http://95.216.199.47:3011/api';

    // Patch the zip in memory: write extension/config.js with the user's token.
    const zip = new AdmZip(latest.fullPath);
    const configJs =
      '// Auto-generated at download time. Do not commit.\n' +
      'window.LANDJET_CONFIG = ' + JSON.stringify({
        apiToken: user.api_token,
        apiBase,
        userEmail: user.email,
        downloadedAt: new Date().toISOString(),
      }, null, 2) + ';\n';
    // Overwrite or add config.js at the zip root.
    const existing = zip.getEntry('config.js');
    if (existing) {
      zip.updateFile('config.js', Buffer.from(configJs, 'utf8'));
    } else {
      zip.addFile('config.js', Buffer.from(configJs, 'utf8'));
    }

    const personalizedFilename = `landjet-extension-v${latest.version}-${user.email.split('@')[0]}.zip`;
    const buf = zip.toBuffer();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${personalizedFilename}"`);
    res.setHeader('Content-Length', String(buf.length));
    res.setHeader('Cache-Control', 'private, no-store'); // contains a secret
    res.send(buf);
  } catch (error) {
    logger.error('GET /api/extension/latest failed', { error: (error as Error).message });
    next(error);
  }
});

export default router;
