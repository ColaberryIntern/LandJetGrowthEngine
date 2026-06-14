# LandJet LinkedIn Assistant (Chrome Extension)

A productivity helper that sits on LinkedIn profile pages. When you open a
profile that matches a lead in the LandJet outreach queue, it shows a panel
with the AI-drafted message and a button to paste it into LinkedIn's
connection-note dialog. When you click LinkedIn's native Send button, it
marks the lead Done in the outreach system automatically.

## What it does and doesn't do

**Does:**
- Reads the LinkedIn URL of the page you're already viewing
- Shows an overlay with the AI-drafted message
- Pastes the message into LinkedIn's note field when you click our button
- Listens for your click on LinkedIn's Send button, then marks the lead Done

**Does NOT:**
- Auto-click anything on LinkedIn
- Send messages or connection requests on its own
- Scrape any profile data (we read the URL only)
- Run on a schedule or in the background
- Operate when you aren't actively on the page

This keeps it on the right side of LinkedIn's TOS. It's a copy-paste
assistant, not a bot.

## Install (one-time, ~2 minutes)

1. Download/clone this folder (`extension/`) to your local machine
2. Open Chrome and navigate to `chrome://extensions`
3. Toggle **Developer mode** ON (top-right of that page)
4. Click **Load unpacked**
5. Select the `extension/` folder you downloaded
6. The extension icon appears in your toolbar -- pin it for easy access

## First-time setup

1. Click the extension icon in your toolbar
2. Paste your API token (Ali sent it separately, starts with `lj_`)
3. Leave the API base URL as the default unless you know it changed
4. Click **Save**. You should see "Saved and verified. You're good."

## Daily use

1. Open the outreach page as normal, click "Open LinkedIn Profile" on a card
2. A small **LandJet** panel appears in the top-right of the LinkedIn page
3. Click LinkedIn's "Connect" button, then "Add a note"
4. Click the panel's **Insert into Connect Note** button -- the message fills in
5. Click LinkedIn's **Send** button as usual
6. The panel shows "Sent! Marked Done." Lead drops off your queue automatically

If you don't see the panel: either the lead isn't in our outreach queue
(extension stays hidden), or the page hadn't finished loading when the
extension checked (refresh the LinkedIn page).

## Updating

When we ship a new version, replace the `extension/` folder contents and
click the **Reload** button on this extension's card in `chrome://extensions`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Panel never appears | Refresh the LinkedIn page. If still nothing, open the popup and re-save your token. |
| "Could not find the LinkedIn note field" | Open LinkedIn's "Connect &raquo; Add a note" dialog FIRST, then click Insert. |
| "Mark Done failed: 401" | Your API token expired or was rotated. Get a new one from Ali. |
| Outreach page doesn't refresh after Send | Switch to the outreach tab; it auto-refreshes when it regains focus. |

## Privacy

The extension only sends one piece of data to LandJet's server: the LinkedIn
URL of the page you're currently viewing (to look up which lead it matches).
It does not scrape profile contents, names, or anything else from LinkedIn.
