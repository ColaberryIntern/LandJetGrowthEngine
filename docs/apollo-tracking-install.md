# Apollo Website Visitor Tracking - Installation Instructions for landjet.com

## What This Does
Identifies companies visiting landjet.com and shows them in Apollo's "Website Visitors" dashboard. No personal data is collected -- only company-level identification (company name, industry, size).

## The Script
Add this script to every page on landjet.com, just before the closing `</body>` tag:

```html
<script>
!function(t,e){var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src="https://assets.apollo.io/micro/website-tracker/tracker.iife.js",o.onload=function(){window.__apollo_tracker.init(t,{cookieDomain:e})};var n=document.getElementsByTagName("script")[0];n.parentNode.insertBefore(o,n)}("69e86f83425d66002172ec85","landjet.com");
</script>
```

## For Craft CMS (TAG Agency)
The easiest approach in Craft CMS:

**Option A -- Global template (recommended):**
1. Open the main layout template (usually `templates/_layout.html` or `templates/_base.html`)
2. Add the script just before `</body>`
3. This adds tracking to every page automatically

**Option B -- Via CMS admin:**
1. If there's a "Global Settings" section with an "Additional Scripts" or "Footer Scripts" field
2. Paste the script there

**Option C -- Via Google Tag Manager (if installed):**
1. Add a Custom HTML tag with the script
2. Trigger: All Pages
3. Publish

## Verification
After installation, visit landjet.com, then check Apollo > Inbound > Website Visitors. Within 24 hours you should see new entries for landjet.com.

## Apollo Account
- Team ID: 69e86f83425d66002172ec85
- Account: rmlandry29@gmail.com (Ryan Landry)
