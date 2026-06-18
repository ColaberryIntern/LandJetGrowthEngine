# LinkedIn 4-step flow -- real-profile smoke check

**~2 min walkthrough.** Run this anytime you suspect the extension has drifted against real LinkedIn (which the automated [Playwright test](../tests/linkedin-flow/) can't detect because it runs against a mocked DOM). Last automated-test confidence: 3/3 green, 3 consecutive runs no flakes, run on 2026-06-17.

Extension under test: **v1.0.22** ([`extension/`](../extension/)).

---

## Pre-flight (10 sec)

- [ ] Extension loaded in Chrome: open `chrome://extensions`, confirm "LandJet LinkedIn Assistant v1.0.22" is enabled
- [ ] Logged into LinkedIn in the same Chrome profile
- [ ] LandJet outreach page open at <http://95.216.199.47:4000/outreach> and shows at least one card with `linkedin_connect` or `linkedin_message` as the channel

If any of these fail, none of the steps below will work — stop and fix the precondition.

---

## The 4 clicks

| # | What you do | Expect within | Pass signal | Fail signal |
|---|---|---|---|---|
| **1** | On the LandJet outreach card, click **Open LinkedIn Profile** | 2 sec | New tab opens on `linkedin.com/in/...`; within another 2 sec a small **LandJet** panel appears top-right with the lead's name + draft message | New tab opens but panel never appears, OR panel appears blank, OR panel says "no match" |
| **2** | On the panel, click the big **Copy message + open Connect** button | 1 sec | Panel status shows "Message copied to clipboard"; LinkedIn's Connect dialog opens by itself (either directly, or after the "..." menu flashes open) | Connect dialog never opens — you have to click LinkedIn's Connect button yourself |
| **3** | On LinkedIn's dialog, click **Add a note**, then `Ctrl+V` | 1 sec | The note textarea fills in with the same draft text the panel showed | Textarea is empty after Ctrl+V, OR the message lands in the wrong textarea (e.g. the bottom-right messaging widget) |
| **4** | Click LinkedIn's **Send** button | 1-2 sec | Panel status flips to "Sent! Marked Done." Panel disappears within 3 sec. Switch back to the LandJet outreach tab — the lead has dropped off the queue (auto-refreshes when the tab regains focus) | Panel never shows "Sent!", OR shows "Mark Done failed: ...", OR the lead is still on the queue after refresh |

If all four green → ship-ready. **You're done.**

---

## If anything failed

1. On the failed profile, expand the panel's **Manual mode (3 separate steps)** section
2. Click **Dump diagnostics** at the bottom
3. Copy the JSON output from the textarea below the button
4. Paste it into a reply to Ali, or comment on BC todo [10008641010](https://app.basecamp.com/3945211/buckets/46699826/todos/10008641010), with the step number that failed and which line of the table you saw

The diagnostic dump tells me exactly which finder broke (Connect button, Add-a-note button, textarea match scope, etc.) so the fix lands in one iteration instead of seven — that's how v1.0.14 → v1.0.22 went.

---

## What to do if step 2 fails specifically

The auto-Connect-click is the most fragile piece (it's the one that took six versions to stabilize). Two-thirds of real-world drift shows up here.

Three quick checks before sending the diagnostic dump:

- **Is the lead 1st-degree already?** Connect button is hidden for connections. Try a different lead.
- **Is the profile age-gated or restricted?** Some profiles hide Connect entirely. The panel should still appear; only the auto-click fails.
- **Has LinkedIn changed the button label?** Diagnostic dump's `finders.connectOnProfileHeader` will be `null` and `visibleModalTitles` will list what's actually on the page. That points the fix.

---

## When to re-run this

- After any LinkedIn UI redesign you notice in normal browsing (rare but they happen)
- After updating the extension (any version > 1.0.22)
- If you ever get a "Mark Done failed" status in the panel
- Before any demo where the LinkedIn flow is going to be shown live

The [automated Playwright test](../tests/linkedin-flow/four-step-flow.spec.js) (`npm run test:linkedin-flow`) catches regressions in the extension's own code. This smoke check catches regressions in LinkedIn's DOM. Together they cover both failure surfaces.
