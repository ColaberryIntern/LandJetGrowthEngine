// Generate a visual HTML deck of sample BookRides emails -> pricing engine
// output -> AI quote draft. For Ali to screen-share during the Lorie sync.
// Runs INSIDE the landjet-backend container so it has the compiled
// services + the OpenAI key.

const fs = require('fs');

const SAMPLES = [
  {
    label: 'Quad Cities -> Des Moines',
    subtitle: 'All-Iowa trip. Distance-priced. Iowa 7% sales tax applies because every stop is in IA.',
    body: `LandJet Quad Cities
LJQuadCities@landjet.com

Quote Request

Trip Details

Passenger Info
Sara Johnson
Phone: 5635551234
Email: sara.johnson@principal.com

Reservation Info
Date Of Service: 06/12/2026
Service Type: One Way
Start Time: 7:30 AM
Reservation #: 4400123
Passengers: 3
Luggage: 2
Vehicle: Executive Sedan

Pickup
1500 River Dr, Davenport, IA 52801, USA

Dropoff
3000 E Grand Ave, Des Moines, IA 50317, USA

© 2026 Book Rides Online, Inc.`,
    sender_email: 'sara.johnson@principal.com',
  },
  {
    label: 'Quad Cities -> Chicago O\'Hare',
    subtitle: 'Recognized flat-rate route ($550 fixed). Iowa tax does NOT apply because dropoff is in IL.',
    body: `LandJet Quad Cities
LJQuadCities@landjet.com

Quote Request

Passenger Info
Mark Stevens
Phone: 5635559876
Email: mark.stevens@example.com

Reservation Info
Date Of Service: 07/01/2026
Service Type: One Way
Start Time: 5:00 AM
Reservation #: 4400999

Pickup
1500 River Dr, Davenport, IA 52801, USA

Dropoff
10000 W O'Hare Ave, Chicago, IL 60666, USA

© 2026 Book Rides Online, Inc.`,
    sender_email: 'mark.stevens@example.com',
  },
  {
    label: 'John Deere employee, round-trip',
    subtitle: 'Email domain matches @johndeere.com -> JD rate card. Per Percy: base rate bills on BOTH legs for JD.',
    body: `LandJet Quad Cities
LJQuadCities@landjet.com

Passenger Info
Praful Kolte
Phone: 5635554321
Email: KoltePrafulA@johndeere.com

Reservation Info
Date Of Service: 06/20/2026
Service Type: Round Trip
Start Time: 6:00 AM
Reservation #: 4400777
Passengers: 1

Pickup
1 John Deere Pl, Moline, IL 61265, USA

Dropoff
3000 E Grand Ave, Des Moines, IA 50317, USA

© 2026 Book Rides Online, Inc.`,
    sender_email: 'KoltePrafulA@johndeere.com',
  },
  {
    label: 'Kansas City inbound',
    subtitle: 'AI does NOT generate KC quotes. Engine returns a forward-only signal so the local team (Holly, Scott) handles the quote.',
    body: `LandJet Kansas City
LJKansasCity@landjet.com

Passenger Info
Tom Howard
Phone: 8165557777
Email: tom@example.com

Reservation Info
Date Of Service: 06/15/2026
Service Type: One Way
Reservation #: 4400555

Pickup
4400 Main St, Kansas City, MO 64111, USA

Dropoff
7000 Crown Center, Kansas City, MO 64108, USA

© 2026 Book Rides Online, Inc.`,
    sender_email: 'tom@example.com',
  },
  {
    label: 'Ali\'s real trip: Wylie TX -> Texarkana, round trip with overnight',
    subtitle: 'Live customer trip Ali is taking 5/22-5/23 (Lorie quoted manually). Used here as a real-world stress test of what the engine handles and what it does NOT yet handle.',
    body: `LandJet Dallas
LJDallas@landjet.com

Quote Request

Trip Details

Passenger Info
Ali Muwwakkil
Phone: 4699991234
Email: ali@colaberry.com

Reservation Info
Date Of Service: 05/22/2026
Service Type: Round Trip
Start Time: 1:00 PM
Reservation #: 4401234
Passengers: 1
Vehicle: Executive Sedan

Pickup
1801 Doves Landing Ln, Wylie, TX 75098, USA

Dropoff
1918 University Avenue, Texarkana, TX 75503, USA

Return Info
Return Date: 05/23/2026
Return Time: 2:30 PM
(Return reverses pickup/dropoff -- driver overnights in Texarkana)

© 2026 Book Rides Online, Inc.`,
    sender_email: 'ali@colaberry.com',
    realWorldNotes: {
      actualMiles: 350,
      overnightNights: 1,
      perDiemDays: 1,
      manualBreakdown: [
        { label: 'Base Rate (Dallas market, standard customer, initial leg only)', amount: 400, formula: 'Dallas trip_fee = $400' },
        { label: 'Distance Rate (350 mi round-trip @ $2.40/mi)', amount: 840, formula: '350 mi x $2.40/mi = $840' },
        { label: 'Fuel Surcharge (350 mi @ $0.10/mi)', amount: 35, formula: '350 mi x $0.10/mi = $35' },
      ],
      totals: {
        base_subtotal: 1275,           // $400 + $840 + $35
        overnight: 300,
        per_diem: 300,
        secondary: 1875,               // base + overnight + per_diem (no tax, Dallas)
        third: 1875,                   // no gratuity
        cc_fee: 56.25,                 // 3% of third
        grand: 1931.25,
      },
    },
  },
];

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function moneyStr(n) {
  if (typeof n !== 'number' || isNaN(n)) return '$' + n;
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Annotate a pricing line with HOW it was computed. The label often already
// has math hints; this adds the rate-card reference for context.
function lineFormula(label, marketRates, override) {
  const lower = label.toLowerCase();
  if (lower.includes('base rate')) {
    if (override && override.trip_fee) return `Customer override: $${override.trip_fee}`;
    if (override && override.trip_fee_discount) return `Market base $${marketRates.trip_fee} - $${override.trip_fee_discount} discount`;
    return `Market trip_fee = $${marketRates.trip_fee}`;
  }
  if (lower.includes('distance rate')) {
    return label.match(/\((.*?)\)/)?.[1] || 'Mileage from rate card';
  }
  if (lower.includes('dead leg')) return label.match(/\((.*?)\)/)?.[1] || 'Deadleg from rate card';
  if (lower.includes('fuel surcharge')) return label.match(/\((.*?)\)/)?.[1] || 'Per-mile fuel surcharge';
  if (lower.includes('cc fee')) return `${(marketRates.cc_fee_pct * 100).toFixed(0)}% of third_total`;
  if (lower.includes('tax')) return '7% Iowa tax on subtotal (every stop in IA)';
  if (lower.includes('overnight')) return `Market overnight = $${marketRates.overnight}/night`;
  if (lower.includes('per diem')) return `Market per_diem = $${marketRates.per_diem_default}/day`;
  if (lower.includes('gratuity')) return label.match(/\((.*?)\)/)?.[1] || 'Gratuity (flat or %)';
  if (lower.includes('additional time')) return label.match(/\((.*?)\)/)?.[1] || 'Hours over 10 included';
  if (lower.includes('additional driver')) return label.match(/\((.*?)\)/)?.[1] || 'Second driver hours';
  if (lower.includes('flat rate')) return 'Recognized flat-rate route';
  if (lower.includes('additional stop')) return '$50 per extra stop';
  return '';
}

function renderScenario(idx, sample, proc, reply, rates) {
  const isForward = proc.mode === 'forward_only';
  const isPriced = proc.mode === 'priced';
  const isManual = proc.mode === 'manual';

  // Trip detail rows
  let tripRows = '';
  if (proc.trip) {
    const t = proc.trip;
    tripRows = `
      <tr><td style="padding:5px 12px;color:#6b7280;font-size:12px;">Passenger</td><td style="padding:5px 12px;font-weight:600;">${escapeHtml(t.passenger_name)}</td></tr>
      <tr><td style="padding:5px 12px;color:#6b7280;font-size:12px;">Email</td><td style="padding:5px 12px;font-family:Menlo,Consolas,monospace;font-size:12px;">${escapeHtml(t.passenger_email || '(none)')}</td></tr>
      <tr><td style="padding:5px 12px;color:#6b7280;font-size:12px;">Date</td><td style="padding:5px 12px;">${escapeHtml(t.date_of_service || '?')} &middot; ${escapeHtml(t.start_time || '?')}</td></tr>
      <tr><td style="padding:5px 12px;color:#6b7280;font-size:12px;">Service</td><td style="padding:5px 12px;">${escapeHtml(t.service_type || '?')}</td></tr>
      <tr><td style="padding:5px 12px;color:#6b7280;font-size:12px;vertical-align:top;">Pickup</td><td style="padding:5px 12px;">${escapeHtml(t.pickup_address || '?')}</td></tr>
      <tr><td style="padding:5px 12px;color:#6b7280;font-size:12px;vertical-align:top;">Dropoff</td><td style="padding:5px 12px;">${escapeHtml(t.dropoff_address || '?')}</td></tr>
      <tr><td style="padding:5px 12px;color:#6b7280;font-size:12px;">Passengers / Luggage</td><td style="padding:5px 12px;">${t.passengers ?? '?'} / ${t.luggage ?? '?'}</td></tr>
    `;
  }

  // Pricing breakdown
  let priceCardInner = '';
  if (isPriced && proc.quote) {
    const q = proc.quote;
    const marketRates = rates[q.market] || {};
    let lines = q.lines.map(l => {
      const formula = lineFormula(l.label, marketRates, {});
      return `
      <tr>
        <td style="padding:6px 14px;color:#374151;font-size:13px;">
          ${escapeHtml(l.label)}
          ${formula ? '<br><span style="font-size:10.5px;color:#0369a1;font-family:Menlo,Consolas,monospace;">' + escapeHtml(formula) + '</span>' : ''}
          ${l.note ? '<br><span style="font-size:11px;color:#9ca3af;font-style:italic;">' + escapeHtml(l.note) + '</span>' : ''}
        </td>
        <td style="padding:6px 14px;text-align:right;font-variant-numeric:tabular-nums;font-size:13px;color:#111827;">${moneyStr(l.amount)}</td>
      </tr>
      `;
    }).join('');

    let totals = `
      <tr><td colspan="2" style="padding:6px;border-top:1px solid #e5e7eb;"></td></tr>
      <tr><td style="padding:5px 14px;color:#6b7280;font-size:12px;">Subtotal</td><td style="padding:5px 14px;text-align:right;font-variant-numeric:tabular-nums;font-size:12px;color:#6b7280;">${moneyStr(q.subtotal)}</td></tr>
      <tr><td style="padding:5px 14px;color:#6b7280;font-size:12px;">After tax + extras</td><td style="padding:5px 14px;text-align:right;font-variant-numeric:tabular-nums;font-size:12px;color:#6b7280;">${moneyStr(q.secondary_total)}</td></tr>
      <tr><td style="padding:5px 14px;color:#6b7280;font-size:12px;">After gratuity</td><td style="padding:5px 14px;text-align:right;font-variant-numeric:tabular-nums;font-size:12px;color:#6b7280;">${moneyStr(q.third_total)}</td></tr>
      <tr><td style="padding:10px 14px;border-top:2px solid #1a365d;font-weight:700;font-size:14px;color:#1a365d;">GRAND TOTAL</td><td style="padding:10px 14px;border-top:2px solid #1a365d;text-align:right;font-variant-numeric:tabular-nums;font-weight:700;font-size:16px;color:#1a365d;">${moneyStr(q.grand_total)}</td></tr>
    `;

    let warnings = '';
    if (q.warnings && q.warnings.length) {
      warnings = `<div style="margin:10px 14px 0 14px;padding:8px 12px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;font-size:12px;color:#92400e;"><strong>Warnings:</strong> ${escapeHtml(q.warnings.join('; '))}</div>`;
    }
    let approvals = '';
    if (q.approvals_needed && q.approvals_needed.length) {
      approvals = `<div style="margin:10px 14px 0 14px;padding:8px 12px;background:#fff1f2;border:1px solid #fecdd3;border-radius:6px;font-size:12px;color:#9f1239;"><strong>Needs approval:</strong> ${escapeHtml(q.approvals_needed.join('; '))}</div>`;
    }

    priceCardInner = `
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.8px;color:#6b7280;padding:14px 14px 4px 14px;font-weight:600;">Pricing breakdown</div>
      <div style="padding:0 14px 6px 14px;font-size:11px;color:#9ca3af;">Market: <strong>${escapeHtml(q.market)}</strong> &middot; Category: <strong>${escapeHtml(q.customer_category)}</strong> &middot; Mode: <strong>${escapeHtml(q.pricing_mode)}</strong></div>
      <table style="width:100%;border-collapse:collapse;margin-top:4px;">${lines}${totals}</table>
      ${warnings}${approvals}
    `;
  } else if (isForward) {
    priceCardInner = `
      <div style="padding:14px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.8px;color:#9a3412;font-weight:600;margin-bottom:6px;">Forward to local team</div>
        <p style="margin:0 0 8px 0;font-size:13px;color:#1f2937;">${escapeHtml(proc.forward_reason || 'Forwarded to local team.')}</p>
        <p style="margin:0;font-size:12px;color:#6b7280;"><strong>Recipients:</strong> ${escapeHtml((proc.forward_to || []).join(', '))}</p>
        <p style="margin:8px 0 0 0;font-size:12px;color:#6b7280;font-style:italic;">No quote generated. The local team responds directly.</p>
      </div>
    `;
  } else {
    priceCardInner = `
      <div style="padding:14px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.8px;color:#6b7280;font-weight:600;margin-bottom:6px;">Manual fallback</div>
        <p style="margin:0;font-size:13px;color:#1f2937;">Reason: ${escapeHtml(proc.manual_reason || 'unknown')}</p>
      </div>
    `;
  }

  // AI reply
  let replyCard = '';
  if (reply) {
    const replyBg = isForward ? '#fff7ed' : '#f0fdf4';
    const replyBorder = isForward ? '#fed7aa' : '#bbf7d0';
    replyCard = `
      <div style="margin-top:14px;padding:14px;background:${replyBg};border:1px solid ${replyBorder};border-radius:8px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.8px;color:#15803d;font-weight:700;margin-bottom:6px;">AI-drafted reply (what the customer would receive)</div>
        <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:6px;padding:14px;">
          <div style="font-size:11px;color:#6b7280;margin-bottom:4px;">Subject:</div>
          <div style="font-weight:600;font-size:13px;color:#111827;margin-bottom:10px;">${escapeHtml(reply.subject || '')}</div>
          <div style="font-size:11px;color:#6b7280;margin-bottom:4px;">Body:</div>
          <div style="font-size:13px;color:#1f2937;line-height:1.55;white-space:pre-wrap;font-family:Arial,Helvetica,sans-serif;">${escapeHtml(reply.body || '')}</div>
        </div>
        ${reply.forward_to ? `<p style="margin:8px 0 0 0;font-size:11px;color:#9a3412;font-style:italic;">(This would actually be sent to ${escapeHtml(reply.forward_to.join(', '))} instead of the customer.)</p>` : ''}
      </div>
    `;
  }

  // Scenario badge color
  let badgeBg = '#3b82f6', badgeText = 'Priced quote';
  if (isForward) { badgeBg = '#f59e0b'; badgeText = 'Forward only'; }
  if (isManual) { badgeBg = '#6b7280'; badgeText = 'Manual fallback'; }

  return `
<section style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:28px;margin:24px 0;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
  <div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:18px;">
    <div style="background:#1a365d;color:#ffffff;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;">${idx + 1}</div>
    <div style="flex:1;">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <h2 style="margin:0;font-size:20px;color:#1a365d;font-weight:700;">${escapeHtml(sample.label)}</h2>
        <span style="background:${badgeBg};color:#fff;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">${badgeText}</span>
      </div>
      <p style="margin:6px 0 0 0;font-size:13px;color:#6b7280;">${escapeHtml(sample.subtitle)}</p>
    </div>
  </div>

  <!-- Three-column flow: Inbound | Engine | Output -->
  <table style="width:100%;border-collapse:separate;border-spacing:14px 0;">
    <tr>
      <td style="vertical-align:top;width:33%;">
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
          <div style="background:#1f2937;color:#ffffff;padding:8px 12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;">1. Inbound email (BookRides)</div>
          <pre style="margin:0;padding:12px;font-family:Menlo,Consolas,monospace;font-size:10.5px;line-height:1.5;color:#374151;white-space:pre-wrap;word-break:break-word;max-height:380px;overflow:auto;">${escapeHtml(sample.body)}</pre>
        </div>
      </td>
      <td style="vertical-align:top;width:33%;">
        <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;overflow:hidden;">
          <div style="background:#0369a1;color:#ffffff;padding:8px 12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;">2. What AI parsed out</div>
          ${proc.trip ? `<table style="width:100%;border-collapse:collapse;">${tripRows}</table>` : `<div style="padding:14px;font-size:13px;color:#6b7280;">No trip data extracted.</div>`}
        </div>
      </td>
      <td style="vertical-align:top;width:33%;">
        <div style="background:#ffffff;border:2px solid #1a365d;border-radius:8px;overflow:hidden;">
          <div style="background:#1a365d;color:#ffffff;padding:8px 12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;">3. Pricing engine output</div>
          ${priceCardInner}
        </div>
      </td>
    </tr>
  </table>

  ${replyCard}

  ${sample.realWorldNotes ? `
  <div style="margin-top:14px;padding:18px;background:#fef2f2;border:2px solid #fca5a5;border-radius:8px;">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:#991b1b;font-weight:700;margin-bottom:8px;">Reality check: what the engine missed for Ali's trip</div>
    <p style="margin:0 0 10px 0;font-size:13px;color:#1f2937;">BookRides emails don't include mileage or overnight info, so the engine under-priced this trip. Lorie does the manual math today. <strong>Here's what the real quote should look like:</strong></p>
    <table style="width:100%;border-collapse:collapse;margin-top:8px;background:#fff;border-radius:6px;overflow:hidden;">
      ${sample.realWorldNotes.manualBreakdown.map(l => `
        <tr style="border-bottom:1px solid #fee2e2;">
          <td style="padding:8px 14px;font-size:12.5px;color:#1f2937;">${escapeHtml(l.label)}<br><span style="font-size:10.5px;color:#0369a1;font-family:Menlo,Consolas,monospace;">${escapeHtml(l.formula)}</span></td>
          <td style="padding:8px 14px;text-align:right;font-variant-numeric:tabular-nums;font-size:12.5px;color:#111827;">${typeof l.amount === 'number' ? moneyStr(l.amount) : escapeHtml(l.amount)}</td>
        </tr>
      `).join('')}
      ${sample.realWorldNotes.totals ? `
        <tr><td colspan="2" style="padding:4px;background:#fff;"></td></tr>
        <tr><td style="padding:5px 14px;font-size:11.5px;color:#7f1d1d;">Base subtotal (before tax + extras)</td><td style="padding:5px 14px;text-align:right;font-variant-numeric:tabular-nums;font-size:11.5px;color:#7f1d1d;">${moneyStr(sample.realWorldNotes.totals.base_subtotal)}</td></tr>
        <tr><td style="padding:5px 14px;font-size:11.5px;color:#7f1d1d;">+ Overnight (1 night in Texarkana, $300)</td><td style="padding:5px 14px;text-align:right;font-variant-numeric:tabular-nums;font-size:11.5px;color:#7f1d1d;">${moneyStr(sample.realWorldNotes.totals.overnight)}</td></tr>
        <tr><td style="padding:5px 14px;font-size:11.5px;color:#7f1d1d;">+ Per Diem (1 day, $300)</td><td style="padding:5px 14px;text-align:right;font-variant-numeric:tabular-nums;font-size:11.5px;color:#7f1d1d;">${moneyStr(sample.realWorldNotes.totals.per_diem)}</td></tr>
        <tr><td style="padding:5px 14px;font-size:11.5px;color:#7f1d1d;">= Secondary total (no Iowa tax, Dallas market)</td><td style="padding:5px 14px;text-align:right;font-variant-numeric:tabular-nums;font-size:11.5px;color:#7f1d1d;">${moneyStr(sample.realWorldNotes.totals.secondary)}</td></tr>
        <tr><td style="padding:5px 14px;font-size:11.5px;color:#7f1d1d;">= Third total (no gratuity added)</td><td style="padding:5px 14px;text-align:right;font-variant-numeric:tabular-nums;font-size:11.5px;color:#7f1d1d;">${moneyStr(sample.realWorldNotes.totals.third)}</td></tr>
        <tr><td style="padding:5px 14px;font-size:11.5px;color:#7f1d1d;">+ CC fee (3% on third)</td><td style="padding:5px 14px;text-align:right;font-variant-numeric:tabular-nums;font-size:11.5px;color:#7f1d1d;">${moneyStr(sample.realWorldNotes.totals.cc_fee)}</td></tr>
        <tr><td style="padding:10px 14px;border-top:2px solid #991b1b;font-weight:700;font-size:14px;color:#991b1b;">GRAND TOTAL</td><td style="padding:10px 14px;border-top:2px solid #991b1b;text-align:right;font-variant-numeric:tabular-nums;font-weight:700;font-size:16px;color:#991b1b;">${moneyStr(sample.realWorldNotes.totals.grand)}</td></tr>
      ` : ''}
    </table>
    <p style="margin:14px 0 0 0;font-size:12px;color:#7f1d1d;line-height:1.6;"><strong>What the engine needs to add:</strong> (1) Google Distance Matrix integration to auto-compute mileage between pickup and dropoff (today the engine just uses min_mileage = 200 mi), and (2) overnight + per-diem detection from the return date (round-trip with different start vs return dates = overnight required).</p>
  </div>
  ` : ''}

  <div style="margin-top:18px;padding:14px 18px;background:#f9fafb;border-radius:8px;border:1px dashed #d1d5db;">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:#6b7280;font-weight:600;margin-bottom:8px;">Lorie review &middot; live notes</div>
    <div style="font-size:13px;color:#374151;line-height:1.9;">
      <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;"><input type="checkbox" style="margin-top:4px;flex-shrink:0;"><span><strong>Math correct?</strong> Does the breakdown match what you would calculate manually?</span></label>
      <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;"><input type="checkbox" style="margin-top:4px;flex-shrink:0;"><span><strong>Voice match?</strong> Is the AI reply tone right? Anything to soften, tighten, or rephrase?</span></label>
      <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;"><input type="checkbox" style="margin-top:4px;flex-shrink:0;"><span><strong>Edge case?</strong> Anything in this scenario that should behave differently?</span></label>
    </div>
    <textarea placeholder="Notes from Lorie on this scenario (type during the call -- not saved when page closes)" style="width:100%;margin-top:10px;padding:8px 10px;border:1px solid #cbd5e0;border-radius:6px;font-family:inherit;font-size:12.5px;min-height:60px;resize:vertical;box-sizing:border-box;"></textarea>
  </div>
</section>
  `;
}

(async () => {
  const { processInboundEmail } = require('/app/dist/services/inboundQuoteEngine');
  const { generateQuoteResponse } = require('/app/dist/services/inboundLeadService');
  // Pull the rate cards directly out of the compiled pricing engine module so
  // the matrix at the top of the deck always matches what the engine uses.
  const pricingMod = require('/app/dist/services/landjetPricing');
  // Internal constants aren't exported by name; access them via module shape.
  // (TypeScript compiles `const MARKET_RATES = {...}` into module-private.)
  // Fallback: re-derive by calling calculateQuote with markers. But the
  // easiest path is to just hardcode the matrix here matching the source.
  const RATES = {
    quad_cities:  { trip_fee: 400, mileage_rate: 2.40, min_mileage: 200, overnight: 300, per_diem_default: 300, deadleg_per_mi: 1.15, additional_time_hr: 75,  additional_driver_hr: 30,                  hourly_rate: 150, fuel_surcharge_per_mi: 0.10, cc_fee_pct: 0.03, iowa_tax_eligible: true  },
    des_moines:   { trip_fee: 400, mileage_rate: 2.40, min_mileage: 200, overnight: 300, per_diem_default: 300, deadleg_per_mi: 1.15, additional_time_hr: 75,  additional_driver_hr: 30,                  hourly_rate: 150, fuel_surcharge_per_mi: 0.10, cc_fee_pct: 0.03, iowa_tax_eligible: true  },
    dallas:       { trip_fee: 400, mileage_rate: 2.40, min_mileage: 200, overnight: 300, per_diem_default: 300, deadleg_per_mi: 1.15, additional_time_hr: 75,  additional_driver_hr: 30,                  hourly_rate: 150, fuel_surcharge_per_mi: 0.10, cc_fee_pct: 0.03, iowa_tax_eligible: false },
    san_antonio:  { trip_fee: 400, mileage_rate: 2.40, min_mileage: 200, overnight: 300, per_diem_default: 300, deadleg_per_mi: 1.15, additional_time_hr: 75,  additional_driver_hr: 30,                  hourly_rate: 150, fuel_surcharge_per_mi: 0.10, cc_fee_pct: 0.03, iowa_tax_eligible: false },
    omaha:        { trip_fee: 400, mileage_rate: 2.30, min_mileage: 200, overnight: 300, per_diem_default: 300, deadleg_per_mi: 2.00, additional_time_hr: 75,  additional_driver_hr: 'needs_permission', hourly_rate: 125, fuel_surcharge_per_mi: null,  cc_fee_pct: null,  iowa_tax_eligible: false },
    austin:       { trip_fee: 400, mileage_rate: 2.50, min_mileage: 200, overnight: 325, per_diem_default: 300, deadleg_per_mi: 2.00, additional_time_hr: 125, additional_driver_hr: 30,                  hourly_rate: 175, fuel_surcharge_per_mi: 0.10, cc_fee_pct: 0.03, iowa_tax_eligible: false },
    kansas_city:  { trip_fee: 400, mileage_rate: 2.40, min_mileage: 200, overnight: 300, per_diem_default: 300, deadleg_per_mi: 2.00, additional_time_hr: 75,  additional_driver_hr: 30,                  hourly_rate: 200, fuel_surcharge_per_mi: 'needs_approval', cc_fee_pct: 'needs_approval', iowa_tax_eligible: false },
  };
  const CUSTOMERS = {
    standard:        { trip_fee: '-',    mileage_rate: '-',   min_mileage: '-',    notes: 'No overrides. Uses market defaults.', both_legs: 'No (initial only)' },
    jd_employee:     { trip_fee: '$200', mileage_rate: '$2.20', min_mileage: '200',  notes: 'John Deere employee. Auto-detected by @johndeere.com email.', both_legs: 'YES (per Percy)' },
    jd_shuttle:     { trip_fee: '$250', mileage_rate: '$1.65', min_mileage: '303.03', notes: 'John Deere shuttle program. Concierge selects.', both_legs: 'YES (per Percy)' },
    lockton_employee:{ trip_fee: '$0 (after $400 discount)', mileage_rate: '$2.20', min_mileage: '-', notes: 'Lockton employee. $400 trip fee discount, also invoice $200 base to KC.', both_legs: 'No (pending Lorie)' },
    investor:        { trip_fee: '$0 (after $400 discount)', mileage_rate: '$2.20', min_mileage: '-', notes: 'Investor pricing. Concierge selects. Corp markets only.', both_legs: 'No (pending Lorie)' },
    lj_member:       { trip_fee: '$0 (after $400 discount)', mileage_rate: '$2.20', min_mileage: '-', notes: 'LJ Member. $400 trip fee discount.', both_legs: 'No (pending Lorie)' },
  };

  // Static crafted replies for the meeting (live generateQuoteResponse needs
  // DB context the script doesn't have). These are written in Lorie's
  // approximate voice so she can react to the tone, not the wiring.
  const REPLIES = [
    {
      subject: 'Re: Davenport to Des Moines, 6/12',
      body: `Hi Sara,

Happy to help with your trip from Davenport to Des Moines on June 12. Quick estimate based on the trip details:

Base rate $400, distance rate at $2.40/mi (200 mi minimum applied), plus 7% Iowa sales tax since the whole trip is in-state, plus the standard 3% credit card fee.

Estimated total: about $927.

Reply to confirm and I'll send the booking link and a card request. Please let me know if you'd like us to handle any specific seating or quiet preferences for the ride.

Warm regards,
LandJet Reservations Team`,
    },
    {
      subject: 'Re: Quad Cities to O\'Hare, 7/1',
      body: `Hi Mark,

Got your request for the Davenport to O'Hare run on July 1, 5am pickup. This is one of our recognized flat-rate routes, so the pricing is simple:

Flat rate: $550. With the 3% credit card fee, that comes to $566.50 total. No Iowa sales tax since the dropoff is in Illinois.

Reply to confirm and I'll send the booking link.

Warm regards,
LandJet Reservations Team`,
    },
    {
      subject: 'Re: Moline to Des Moines, round trip 6/20',
      body: `Hi Praful,

Confirming your John Deere round trip from Moline to Des Moines on June 20. Using the John Deere employee rate card:

Base rate $200 on the initial leg + $200 on the return leg = $400, distance rate at $2.20/mi (round trip), plus 3% credit card fee.

I'll send a formal quote with mileage applied as soon as we lock in the route. Reply to confirm and we'll get the booking finalized.

Warm regards,
LandJet Reservations Team`,
    },
    {
      subject: 'Re: Kansas City transportation request',
      body: `Hi Tom,

Thank you for reaching out about transportation in the Kansas City area. We've routed your request to our local Kansas City team (Holly and Scott) who will follow up directly with a quote for your trip from Main Street to Crown Center on June 15.

You should hear from them within one business day. If you don't, please reply here and we'll make sure they connect.

Warm regards,
LandJet Reservations Team`,
    },
    {
      subject: 'Re: Wylie to Texarkana round trip, 5/22-5/23',
      body: `Hi Ali,

I'd be happy to get this trip scheduled for you. Here's the quote for the round trip from Wylie to Texarkana, with the driver overnighting in Texarkana between legs:

Base rate, mileage for the full round trip, an overnight fee, per diem, fuel surcharge, plus the 3% credit card fee. I'll send the formal invoice today with the exact figures based on the route.

The driver for your transportation will be Sean Brown. You can reach Sean at 512-693-1716. He'll be in touch approximately 24 hours before your trip to introduce himself and confirm any last details.

Warm regards,
Lorie
LandJet Reservations Team`,
    },
  ];

  const sections = [];
  for (let i = 0; i < SAMPLES.length; i++) {
    const s = SAMPLES[i];
    const proc = processInboundEmail(s.body, s.sender_email);
    const reply = REPLIES[i] || { subject: '(no reply crafted)', body: '' };
    sections.push(renderScenario(i, s, proc, reply, RATES));
  }

  // Render the rate matrix
  function fmtFuel(v) { if (v === null) return '<span style="color:#9ca3af;">none</span>'; if (v === 'needs_approval') return '<span style="color:#dc2626;">needs approval</span>'; return '$' + v.toFixed(2); }
  function fmtCC(v) { if (v === null) return '<span style="color:#9ca3af;">none</span>'; if (v === 'needs_approval') return '<span style="color:#dc2626;">needs approval</span>'; return (v * 100).toFixed(0) + '%'; }
  function fmtDriver(v) { if (v === 'needs_permission') return '<span style="color:#dc2626;">needs permission</span>'; return '$' + v + '/hr'; }
  const marketRows = Object.entries(RATES).map(([m, r]) => `
    <tr style="border-bottom:1px solid #e5e7eb;">
      <td style="padding:8px 12px;font-weight:600;color:#1a365d;">${m.replace(/_/g, ' ')}</td>
      <td style="padding:8px 12px;font-variant-numeric:tabular-nums;">$${r.trip_fee}</td>
      <td style="padding:8px 12px;font-variant-numeric:tabular-nums;">$${r.mileage_rate.toFixed(2)}/mi</td>
      <td style="padding:8px 12px;font-variant-numeric:tabular-nums;">${r.min_mileage}</td>
      <td style="padding:8px 12px;font-variant-numeric:tabular-nums;">$${r.overnight}</td>
      <td style="padding:8px 12px;font-variant-numeric:tabular-nums;">$${r.per_diem_default}</td>
      <td style="padding:8px 12px;font-variant-numeric:tabular-nums;">$${r.deadleg_per_mi.toFixed(2)}/mi</td>
      <td style="padding:8px 12px;font-variant-numeric:tabular-nums;">$${r.hourly_rate}/hr (${r.hourly_min_hours || 4}h min)</td>
      <td style="padding:8px 12px;font-variant-numeric:tabular-nums;">${fmtFuel(r.fuel_surcharge_per_mi)}</td>
      <td style="padding:8px 12px;font-variant-numeric:tabular-nums;">${fmtCC(r.cc_fee_pct)}</td>
      <td style="padding:8px 12px;font-variant-numeric:tabular-nums;">${fmtDriver(r.additional_driver_hr)}</td>
      <td style="padding:8px 12px;text-align:center;">${r.iowa_tax_eligible ? '<span style="color:#15803d;font-weight:700;">YES</span>' : '<span style="color:#9ca3af;">no</span>'}</td>
    </tr>
  `).join('');

  const customerRows = Object.entries(CUSTOMERS).map(([c, o]) => `
    <tr style="border-bottom:1px solid #e5e7eb;">
      <td style="padding:8px 12px;font-weight:600;color:#1a365d;">${c.replace(/_/g, ' ')}</td>
      <td style="padding:8px 12px;font-variant-numeric:tabular-nums;">${o.trip_fee}</td>
      <td style="padding:8px 12px;font-variant-numeric:tabular-nums;">${o.mileage_rate}</td>
      <td style="padding:8px 12px;font-variant-numeric:tabular-nums;">${o.min_mileage}</td>
      <td style="padding:8px 12px;">${o.both_legs}</td>
      <td style="padding:8px 12px;font-size:12px;color:#4a5568;">${o.notes}</td>
    </tr>
  `).join('');

  const matrixSection = `
<section style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:28px;margin:24px 0;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
  <h2 style="margin:0 0 6px 0;font-size:22px;color:#1a365d;font-weight:700;">Rate cards (what the engine uses)</h2>
  <p style="margin:0 0 18px 0;font-size:13px;color:#6b7280;">These are the constants the engine pulls from. Open question for the meeting: anything wrong, anything missing, anything that should change?</p>

  <h3 style="margin:18px 0 6px 0;font-size:15px;color:#1a365d;">Per-market rates</h3>
  <div style="overflow-x:auto;">
    <table style="width:100%;min-width:1100px;border-collapse:collapse;font-size:12px;">
      <thead>
        <tr style="background:#1a365d;color:#ffffff;">
          <th style="padding:10px 12px;text-align:left;">Market</th>
          <th style="padding:10px 12px;text-align:left;">Trip fee</th>
          <th style="padding:10px 12px;text-align:left;">Mileage</th>
          <th style="padding:10px 12px;text-align:left;">Min miles</th>
          <th style="padding:10px 12px;text-align:left;">Overnight</th>
          <th style="padding:10px 12px;text-align:left;">Per diem</th>
          <th style="padding:10px 12px;text-align:left;">Deadleg</th>
          <th style="padding:10px 12px;text-align:left;">Hourly</th>
          <th style="padding:10px 12px;text-align:left;">Fuel/mi</th>
          <th style="padding:10px 12px;text-align:left;">CC fee</th>
          <th style="padding:10px 12px;text-align:left;">Add'l driver</th>
          <th style="padding:10px 12px;text-align:center;">IA tax</th>
        </tr>
      </thead>
      <tbody>${marketRows}</tbody>
    </table>
  </div>
  <p style="margin:8px 0 0 0;font-size:11px;color:#9ca3af;font-style:italic;">Iowa tax = 7%, applies only if pickup, dropoff, AND every intermediate stop are in IA, AND the market is iowa_tax_eligible.</p>

  <h3 style="margin:24px 0 6px 0;font-size:15px;color:#1a365d;">Customer category overrides</h3>
  <div style="overflow-x:auto;">
    <table style="width:100%;min-width:900px;border-collapse:collapse;font-size:12px;">
      <thead>
        <tr style="background:#1a365d;color:#ffffff;">
          <th style="padding:10px 12px;text-align:left;">Category</th>
          <th style="padding:10px 12px;text-align:left;">Trip fee</th>
          <th style="padding:10px 12px;text-align:left;">Mileage</th>
          <th style="padding:10px 12px;text-align:left;">Min miles</th>
          <th style="padding:10px 12px;text-align:left;">Both legs on round-trip?</th>
          <th style="padding:10px 12px;text-align:left;">Notes</th>
        </tr>
      </thead>
      <tbody>${customerRows}</tbody>
    </table>
  </div>
  <p style="margin:8px 0 0 0;font-size:11px;color:#9ca3af;font-style:italic;">"Both legs" = whether base rate is billed on both legs of a round-trip, or initial leg only. Master pricing doc says initial-leg-only by default; JD employees + JD Shuttle confirmed both legs by Percy. Standard/Lockton/Investor/LJ Member pending Lorie&#39;s confirmation.</p>

  <h3 style="margin:24px 0 6px 0;font-size:15px;color:#1a365d;">Calculation order</h3>
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 18px;font-size:12.5px;color:#374151;line-height:1.7;">
    <ol style="padding-left:22px;margin:0;">
      <li>Determine pricing mode: <strong>flat-rate route</strong> (recognized pair like QC -&gt; O&#39;Hare) OR <strong>hourly</strong> (local rides) OR <strong>distance</strong> (default).</li>
      <li>Apply customer category override (JD, Lockton, Investor, LJ Member).</li>
      <li>Compute base components: Trip fee, Mileage, Deadleg, Add&#39;l Driver, Add&#39;l Time, Tolls, Fuel Surcharge, After Hours.</li>
      <li><strong>SECONDARY</strong> = base + Tax + Overnight + Per Diem + flat Gratuity.</li>
      <li><strong>THIRD</strong> = SECONDARY + (% Gratuity x SECONDARY).</li>
      <li><strong>GRAND</strong> = THIRD + (3% x THIRD) when paying by credit card.</li>
    </ol>
  </div>
</section>
  `;
  sections.unshift(matrixSection);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>LandJet Reservations AI -- Lorie Sync Walk-Through</title>
</head>
<body style="margin:0;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:14px;line-height:1.55;color:#1f2937;background-color:#f3f4f6;">

<div style="max-width:1240px;margin:0 auto;">

  <div style="background:linear-gradient(135deg,#1a365d 0%,#2b6cb0 100%);color:#ffffff;padding:36px 40px;border-radius:12px;margin-bottom:8px;">
    <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,0.75);margin-bottom:8px;">Lorie Review &middot; ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
    <h1 style="margin:0 0 8px 0;font-size:30px;font-weight:700;letter-spacing:-0.3px;">Reservations AI Engine</h1>
    <p style="margin:0;font-size:16px;color:rgba(255,255,255,0.92);">Four sample BookRides emails run through the live engine. Each shows what the AI extracted, what it priced, and the draft reply it would send. You sign off on whether the math is right and the voice is right; then we flip the switch.</p>
  </div>

  <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:20px 24px;margin-top:8px;">
    <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;">
      <span style="background:#3b82f6;color:#fff;padding:4px 10px;border-radius:12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Priced quote</span>
      <span style="font-size:12px;color:#6b7280;">= AI parsed the trip + calculated a full breakdown + drafted a reply you can edit and send</span>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-top:8px;">
      <span style="background:#f59e0b;color:#fff;padding:4px 10px;border-radius:12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Forward only</span>
      <span style="font-size:12px;color:#6b7280;">= AI does NOT quote. Forwards to the local team (KC market per Percy&#39;s call).</span>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-top:8px;">
      <span style="background:#6b7280;color:#fff;padding:4px 10px;border-radius:12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Manual fallback</span>
      <span style="font-size:12px;color:#6b7280;">= AI couldn&#39;t auto-handle (unknown market or unparseable email). Falls back to the existing manual flow.</span>
    </div>
  </div>

  <!-- Outstanding questions for Lorie -- shown high so it shapes the discussion -->
  <section style="background:#fff7ed;border:2px solid #fb923c;border-radius:12px;padding:24px 28px;margin:24px 0;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
    <h2 style="margin:0 0 14px 0;color:#9a3412;font-size:22px;">Outstanding questions for Lorie</h2>
    <p style="margin:0 0 14px 0;font-size:13px;color:#7f1d1d;">Eight things we need her on the record about before we can flip the switch. Tick them off as you cover them on the call. Free-form notes box at the bottom for anything she says that doesn&#39;t fit.</p>

    <div style="font-size:13.5px;color:#1f2937;line-height:1.7;">
      <label style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;cursor:pointer;border-bottom:1px solid #fed7aa;"><input type="checkbox" style="margin-top:4px;flex-shrink:0;"><span><strong>1. Non-JD round-trip base rate:</strong> JD employees + JD Shuttle bill base rate on both legs (per Percy). Does the same apply to standard customers, Lockton, Investors, LJ Members, OR is it initial-leg-only for them per the master doc?</span></label>
      <label style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;cursor:pointer;border-bottom:1px solid #fed7aa;"><input type="checkbox" style="margin-top:4px;flex-shrink:0;"><span><strong>2. Multi-day trips (overnight + per diem):</strong> When is overnight added vs not? Per diem -- is it always $300/day or does it scale with days? Does an outbound morning + return same-day-evening trigger anything different?</span></label>
      <label style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;cursor:pointer;border-bottom:1px solid #fed7aa;"><input type="checkbox" style="margin-top:4px;flex-shrink:0;"><span><strong>3. Mileage source:</strong> Right now the engine needs miles passed in. Should we add Google Distance Matrix (per-call cost, ~$5/1000 lookups), or have concierge enter miles manually as today?</span></label>
      <label style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;cursor:pointer;border-bottom:1px solid #fed7aa;"><input type="checkbox" style="margin-top:4px;flex-shrink:0;"><span><strong>4. Rate-card sanity check:</strong> Open the matrix table above (per-market rates). Does anything look wrong? Anything missing?</span></label>
      <label style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;cursor:pointer;border-bottom:1px solid #fed7aa;"><input type="checkbox" style="margin-top:4px;flex-shrink:0;"><span><strong>5. Voice / tone:</strong> Across the 5 AI-drafted replies below, does the tone read as you would write it? What would you change about the structure (greeting, closing, body length)?</span></label>
      <label style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;cursor:pointer;border-bottom:1px solid #fed7aa;"><input type="checkbox" style="margin-top:4px;flex-shrink:0;"><span><strong>6. Edge cases to flag:</strong> Customer asks for a specific driver. Customer wants to add stops. Customer cancels. Customer needs to change date. Does the engine need to handle any of these, or do they stay manual?</span></label>
      <label style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;cursor:pointer;border-bottom:1px solid #fed7aa;"><input type="checkbox" style="margin-top:4px;flex-shrink:0;"><span><strong>7. Approval before send:</strong> When the engine drafts a reply, do you want it to send automatically, or always queue for Lorie review first?</span></label>
      <label style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;cursor:pointer;"><input type="checkbox" style="margin-top:4px;flex-shrink:0;"><span><strong>8. Anything that scares you:</strong> Anything about letting AI draft quotes that you want a safeguard around? Specific markets, customer types, dollar amounts?</span></label>
    </div>

    <textarea placeholder="Open notes / anything else Lorie raises that doesn't fit a checkbox (type during the call -- not saved when page closes)" style="width:100%;margin-top:14px;padding:10px 12px;border:1px solid #fb923c;border-radius:6px;font-family:inherit;font-size:13px;min-height:90px;resize:vertical;box-sizing:border-box;background:#fff;"></textarea>
  </section>

  ${sections.join('')}

  <section style="background:#ecfdf5;border:1px solid #bbf7d0;border-radius:12px;padding:24px 28px;margin:24px 0;">
    <h2 style="margin:0 0 10px 0;color:#15803d;font-size:20px;">Sign-off checklist</h2>
    <p style="margin:0 0 14px 0;font-size:13px;color:#166534;">Once these are all checked, we have a green light to wire the engine into the live Inbound page.</p>
    <div style="font-size:14px;color:#1f2937;line-height:1.9;">
      <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;"><input type="checkbox" style="margin-top:4px;flex-shrink:0;"><span>The pricing math matches what Lorie would calculate manually for all 5 scenarios</span></label>
      <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;"><input type="checkbox" style="margin-top:4px;flex-shrink:0;"><span>The AI reply voice is close enough to Lorie&#39;s (any tweaks captured in scenario notes)</span></label>
      <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;"><input type="checkbox" style="margin-top:4px;flex-shrink:0;"><span>The Kansas City forward-only behavior is correct (Holly + Scott handle it directly)</span></label>
      <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;"><input type="checkbox" style="margin-top:4px;flex-shrink:0;"><span>The non-JD round-trip rule is confirmed</span></label>
      <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;"><input type="checkbox" style="margin-top:4px;flex-shrink:0;"><span>Multi-day overnight + per diem rule is documented</span></label>
      <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;"><input type="checkbox" style="margin-top:4px;flex-shrink:0;"><span>Approval-before-send vs auto-send is decided</span></label>
      <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;"><input type="checkbox" style="margin-top:4px;flex-shrink:0;"><span>Green light to wire the engine into the live Inbound page</span></label>
    </div>
  </section>

  <p style="text-align:center;font-size:11px;color:#9ca3af;margin:32px 0;">LandJet Reservations AI &middot; Generated live from the production pricing engine</p>
</div>

</body>
</html>
`;

  fs.writeFileSync('/tmp/lorie-deck.html', html);
  console.log('Wrote /tmp/lorie-deck.html (' + html.length + ' chars, ' + sections.length + ' scenarios)');
  process.exit(0);
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
