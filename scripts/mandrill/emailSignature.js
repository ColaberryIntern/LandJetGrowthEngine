/**
 * Ali's branded email signature - HTML + plain-text fallback.
 *
 * Drop this file at: <your-project>/backend/src/scripts/lib/emailSignature.js
 *
 * Source of truth: Ali Personal BC ticket 9981757450.
 *
 * Usage:
 *   const { SIG_HTML, SIG_TEXT } = require('./lib/emailSignature');
 *   // Append SIG_HTML to your html body, SIG_TEXT to your text body.
 *
 * Title format rule: "Managing Director / AI Systems Architect" - slash,
 * NOT em-dash (em-dashes are globally banned per Ali's email style memory).
 * CTA links to: https://advisor.colaberry.ai/advisory
 */

const SIG_HTML = `<table cellpadding="0" cellspacing="0" border="0" style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; border-left: 3px solid #1a365d; padding-left: 14px; margin-top: 24px;">
<tr><td>
<div style="font-weight: 700; font-size: 16px; color: #1a365d;">Ali Muwwakkil</div>
<div style="color: #2b6cb0; font-weight: 600;">Managing Director / AI Systems Architect</div>
<div style="color: #718096;">Colaberry Inc.</div>
<div style="margin-top: 10px; color: #2d3748;">200 Chisholm Place, Suite 200 &middot; Plano, TX 75075</div>
<div style="color: #2d3748;"><a href="mailto:ali@colaberry.com" style="color: #2b6cb0; text-decoration: none;">ali@colaberry.com</a> &nbsp; <a href="https://enterprise.colaberry.ai" style="color: #2b6cb0; text-decoration: none;">enterprise.colaberry.ai</a></div>
<div style="margin-top: 14px;">
<a href="https://advisor.colaberry.ai/advisory" style="display: inline-block; background: #2b6cb0; color: #ffffff; padding: 9px 18px; border-radius: 20px; text-decoration: none; font-weight: 600;">Design Your AI Organization</a>
</div>
</td></tr>
</table>`;

const SIG_TEXT = `Ali Muwwakkil
Managing Director / AI Systems Architect
Colaberry Inc.

200 Chisholm Place, Suite 200, Plano, TX 75075
ali@colaberry.com  |  enterprise.colaberry.ai
Design Your AI Organization: https://advisor.colaberry.ai/advisory`;

module.exports = { SIG_HTML, SIG_TEXT };
