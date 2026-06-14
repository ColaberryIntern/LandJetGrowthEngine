# Quote Tester — Demo Guide

**Built:** 2026-06-01
**For:** Ali to demo to Lorie + Ryan + the reservation desk
**URL:** http://95.216.199.47:4000/quote-tester
**Status:** Live in production

---

## What it is

A web page inside the LandJet admin where Lorie, the reservation desk, or anyone with a login can drop in an inbound BookRides email (or fill in trip details manually) and see:

1. The full quote breakdown — every line item the pricing engine produces
2. **How** the quote was built — step-by-step calculation trail with running totals
3. Projected margin — green / amber / red with the approval band Ryan asked for at the 5/21 sync
4. A cost breakdown driving the margin (driver hours, fuel, vehicle, other)
5. Concierge alerts — any warnings the engine raised (Lorie dead-leg flag, fuel surcharge missing on flat rate, etc.)

This is the "test page where you can paste different emails or try different emails" Ali volunteered to build at the 5/21 sync. It also covers the "internal pricing calculator" with margin-band routing Ryan called out.

---

## Logins

Both go to the same admin app; the Quote Tester link is in the top nav.

| Role | Email | Password |
|------|------|----------|
| Ali (admin, you already have this) | ali@colaberry.com | LandfwfIzCu! |
| Lorie (new — give to her in the demo) | lorie@landjet.com | LandLorie2F0NMQ! |

---

## How the demo flows (5 min)

### 1. Show the paste-email path (the everyday case for Lorie)

- Open http://95.216.199.47:4000/quote-tester after logging in
- Click **"Try a sample"** → pick **"QC -> ORD flat rate"** (it pre-fills a representative BookRides body)
- Click **"Generate quote"**

What Lorie sees:
- **Grand total** in big type ($550-ish for QC to O'Hare)
- **Margin pill** next to it — color-coded
- **Concierge alerts** with whatever the engine flagged (on a flat-rate quote it tells her fuel surcharge wasn't included and she should add the per-mile rate if it applies — exactly what she asked for at 5/21)
- **"How this quote was built"** section showing each phase: pricing mode → customer category → base / flat rate → tolls → tax → gratuity → CC fee, with the running total after each one
- **Cost + margin breakdown** at the bottom showing driver, fuel, vehicle, other

### 2. Show the manual path (the "what if" case for Ryan)

- Click **"Manual entry"**
- Pick `Quad Cities`, `Round Trip`, `400` passenger miles, `100` dead-leg miles, `JD Employee`, `Credit card`
- Click **"Generate quote"**

What Ryan sees:
- The JD Employee override applied ($200 trip fee instead of $400)
- $2.20/mi mileage rate instead of $2.40
- $100 default gratuity (per JD employee rule)
- Margin recalculated against costs
- The whole calculation trail explains each step

### 3. Show the margin routing (Ryan's 60/50/40 ask)

- Try a low-margin scenario: short flat rate or under-200-mile trip
- Margin pill flips to amber or red
- Approval band text changes to "Reservation desk review" or "Ryan approval required"
- This is the routing layer Ryan said he wanted at 5/21

### 4. The follow-ups (be transparent about what's placeholder)

- Cost inputs are **placeholders** today (`$1.20/mi`, `$20/hr driver`, `$3.50 gas`, `18 mpg`). The margin shape is right but the numbers will move once Ryan sends his actuals. Page footer says so.
- Once Ryan sends actuals (BC todo due 06-01), Ali updates `cost_inputs` in the system_settings table (or via the GET/PUT `/api/admin/quotes/cost-inputs` endpoint) and every future quote uses the real numbers.

---

## What's in vs. out of scope (so the demo doesn't promise things)

**In scope right now:**
- Paste BookRides email OR manual entry
- Full QuoteOutput rendering (subtotal → secondary → third → grand)
- Step-by-step calculation trail
- Margin band + routing decision
- Lorie login

**Not yet (next iterations):**
- "Save quote" / quote history (every run is ephemeral right now)
- Email the customer directly from the tool
- Multi-day trip routing to human review queue (separate BC todo, due 06-10)
- Per-market flat rate sets (KC, Omaha, Austin specifics — separate BC todo, due 06-12)
- Cost input UI page so Ryan can edit margins from the browser (just an API call today; UI is a 30-min add when you want it)

---

## Tech notes (for your awareness, not the demo)

- Backend: `src/routes/admin/quoteTesterRoutes.ts`
- Frontend: `frontend/app/quote-tester/page.tsx`
- Wires into the existing `landjetPricing.ts` engine with no changes to the engine itself — so all 5 Lorie corrections we shipped on 2026-05-14 (trip fee count, QC→DSM removed, per-route tolls, auto 20% gratuity, dead-leg warning, actual-vs-billed miles) automatically apply
- BookRides parser at `src/services/bookRidesParser.ts` is the same one used by the inbound email flow — pasting an email here goes through the exact same path a real inbound would take

---

## After the demo

Ryan will have questions about:
- "When can my reservation desk start using this for real?" — answer: today. The tool is production-grade for what it does. Add the "save quote" feature when you want history.
- "How do I get my cost numbers in?" — answer: send them to Ali, takes 5 min to update.
- "Can it be self-serve for our customers?" — answer: not safe today; this is an internal estimator. Customer-facing would need a real quote workflow with disclaimers, T&Cs, and probably Stripe.

Lorie will have questions about:
- "Why is the dead leg flagged here?" — answer: per Ryan 2026-05-21 rule, dead leg only applies when BOTH ends are non-garage cities. The flag warns her if she's about to charge it incorrectly.
- "Can I edit a generated quote before sending?" — not yet; you'll need a quote-edit workflow. Tomorrow's iteration if she wants it.
