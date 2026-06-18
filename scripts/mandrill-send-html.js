#!/usr/bin/env node
/**
 * Mandrill send wrapper for Ali-side internal reports.
 *
 * Sends an existing HTML file as an email, attached to a BC ticket per the
 * operating doctrine, with branded signature appended.
 *
 * Usage:
 *   node scripts/mandrill-send-html.js \
 *     --html docs/updates/2026-06-17-autorunner-diagnosis.html \
 *     --subject "Auto-runner diagnosis: ..." \
 *     --ticket 10008606590 \
 *     --summary "<p>Diagnosis of why auto-runner produced 0 sends in 24h.</p>"
 *
 * Required env (set inline at invocation):
 *   MANDRILL_API_KEY
 *   BASECAMP_ACCESS_TOKEN
 *
 * Optional:
 *   --bucket 46699826           # default = 46699826 (LandJet Growth Engine)
 *   --to ali@colaberry.com      # default = ali@colaberry.com
 *   --text-fallback "..."       # plaintext body; default derived from subject
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { sendWithBcAttach } = require('./mandrill/sendWithBcAttach');
const { SIG_HTML, SIG_TEXT } = require('./mandrill/emailSignature');

// Gmail strips inline <svg>. Solution: rasterize each SVG to PNG, replace the
// SVG block in the HTML with <img src="cid:chart-N">, and attach the PNG as a
// nodemailer inline attachment with that cid.
async function rasterizeSvgs(html, targetWidthPx = 1400) {
  const re = /<svg\b[^>]*>[\s\S]*?<\/svg>/g;
  const matches = [...html.matchAll(re)];
  if (matches.length === 0) return { html, attachments: [] };

  const attachments = [];
  let modifiedHtml = html;
  for (let i = 0; i < matches.length; i++) {
    const svgRaw = matches[i][0];
    const cid = `chart-${String(i + 1).padStart(2, '0')}`;
    const filename = `${cid}.png`;
    try {
      const pngBuf = await sharp(Buffer.from(svgRaw, 'utf8'), { density: 200 })
        .resize({ width: targetWidthPx, withoutEnlargement: false })
        .png({ compressionLevel: 9 })
        .toBuffer();
      attachments.push({ filename, content: pngBuf, cid, contentType: 'image/png' });
      const img = `<img src="cid:${cid}" alt="chart ${i + 1}" style="display:block;max-width:100%;height:auto;border:0" width="700">`;
      modifiedHtml = modifiedHtml.replace(svgRaw, img);
    } catch (e) {
      console.warn(`[rasterize] svg #${i + 1} failed: ${e.message}. Leaving inline (may not render in Gmail).`);
    }
  }
  return { html: modifiedHtml, attachments };
}

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 ? process.argv[i + 1] : fallback;
}

(async () => {
  const htmlPath = arg('html');
  const subject = arg('subject');
  const ticketId = Number(arg('ticket'));
  const bucketId = Number(arg('bucket', '46699826'));
  const to = arg('to', 'ali@colaberry.com');
  const ccRaw = arg('cc', '');
  const cc = ccRaw ? ccRaw.split(',').map(s => s.trim()).filter(Boolean) : undefined;
  const summary = arg('summary', '<p>Internal report.</p>');
  const textFallback = arg('text-fallback', `${subject}\n\nOpen the HTML version for the full report.`);

  if (!htmlPath || !subject || !ticketId) {
    console.error('Usage: --html <path> --subject "..." --ticket <id> [--bucket <id>] [--to <addr>]');
    process.exit(1);
  }
  if (!process.env.MANDRILL_API_KEY) throw new Error('MANDRILL_API_KEY env var required');
  if (!process.env.BASECAMP_ACCESS_TOKEN) throw new Error('BASECAMP_ACCESS_TOKEN env var required');

  const reportHtml = fs.readFileSync(path.resolve(htmlPath), 'utf8');

  console.log('Rasterizing inline SVGs to PNG (Gmail strips inline svg)...');
  const { html: rasterizedHtml, attachments: chartAttachments } = await rasterizeSvgs(reportHtml);
  console.log(`  ${chartAttachments.length} chart(s) converted; total size ${chartAttachments.reduce((a, b) => a + b.content.length, 0)} bytes`);

  const signedHtml = rasterizedHtml.includes('</body>')
    ? rasterizedHtml.replace('</body>', SIG_HTML + '</body>')
    : rasterizedHtml + SIG_HTML;

  const result = await sendWithBcAttach({
    ticketId,
    bucketId,
    to,
    cc,
    bcc: 'ali@colaberry.com',
    subject,
    html: signedHtml,
    text: textFallback + '\n\n' + SIG_TEXT,
    attachments: chartAttachments,
    bcSummary: summary,
  });

  console.log('Sent via Mandrill.');
  console.log('Mandrill ID:', result.mandrillId);
  console.log('BC comment :', result.commentUrl);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
