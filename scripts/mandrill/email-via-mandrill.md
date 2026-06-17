# Email via Mandrill — Cross-Project Setup Guide

**Single source of truth:** [Ali Personal BC ticket 9981757450](https://app.basecamp.com/3945211/buckets/7463955/todos/9981757450)

This document is for any Claude Code project that needs to send branded emails from `ali@colaberry.com` via Mandrill SMTP. It assumes **no shared file access** with any other project. Everything you need is attached to the BC ticket linked above.

## When to use this

- A new repo needs to send outbound communications on Ali's behalf
- A different machine (not Ali's primary laptop) is being set up
- A different person is helping with a project and needs the same email setup
- Fixing a script that currently sends without the operating-doctrine guards

## What you'll have when done

- A working `node sampleSend.js` smoke test that delivers an email to your inbox
- All four helper files installed in the right paths
- Pre-send em-dash blocker hook registered with Claude Code
- A clear understanding of the two send paths

---

## Step 1 — Download the kit from this BC ticket

Open the ticket: <https://app.basecamp.com/3945211/buckets/7463955/todos/9981757450>

The ticket's Vault (or comment uploads) contains all seven kit files:

| File | What it is |
|---|---|
| `sendWithBcAttach.js` | Canonical send helper (Mandrill SMTP + BC ticket attach + vault upload + auto-comment) |
| `mandrillPreflight.js` | Hard-fails on em-dashes, duplicate signatures, double sign-offs |
| `emailSignature.js` | `SIG_HTML` + `SIG_TEXT` constants (branded signature) |
| `check-emdash.sh` | PostToolUse Claude Code hook that blocks em-dashes in send scripts at edit time |
| `sample-send.js` | Minimal working example — one email, fully wired |
| `setup.sh` | One-shot installer that places all files into a target project |
| `email-via-mandrill.md` | This document |

Download all seven into a single working directory on your machine, e.g.:

```bash
mkdir ~/email-mandrill-kit
cd ~/email-mandrill-kit
# Download each file from the BC ticket Vault into this directory
```

## Step 2 — Run the installer

From the directory containing the seven kit files:

```bash
bash setup.sh /path/to/your/new/project
```

This will:

- Create `backend/src/scripts/lib/` in your project if missing
- Create `.claude/hooks/` in your project if missing
- Copy the four helper JS files + the sample
- Copy `check-emdash.sh` into `.claude/hooks/` and make it executable
- Run `npm install --save nodemailer` in your project's `backend/` (or root) if a `package.json` exists
- Register the em-dash hook in `.claude/settings.json` (creates the file if missing, otherwise prints a JSON block for you to merge manually)

If your project's directory layout differs from `backend/src/scripts/lib/`, edit `setup.sh` first or copy files manually.

## Step 3 — Pull credentials from prod

**The Mandrill API key and BC token live in the prod backend container env only.** They are not in any repo, not in any `.env` file. Pull them at runtime:

```bash
ssh root@95.216.199.47 "docker exec accelerator-backend printenv MANDRILL_API_KEY"
ssh root@95.216.199.47 "docker exec accelerator-backend printenv BASECAMP_ACCESS_TOKEN"
```

**Important caveats:**

- `BASECAMP_ACCESS_TOKEN` rotates every 2 weeks. The container env is a snapshot from deploy time. If `printenv` returns a token that's already expired, pull the live one directly from CCPP:

  ```bash
  ssh root@95.216.199.47 'docker exec accelerator-backend node -e "const sql=require(\"mssql\"); (async()=>{await sql.connect({server:process.env.MSSQL_HOST,port:parseInt(process.env.MSSQL_PORT||1433,10),user:process.env.MSSQL_USER,password:process.env.MSSQL_PASS,database:process.env.MSSQL_DATABASE||\"CCPP\",options:{encrypt:true,trustServerCertificate:true}}); const r=await sql.query\`SELECT TOP 1 AccessToken FROM Basecamp_AuthInfo WHERE IsActive=1 ORDER BY BasecampAuthInfoID DESC\`; console.log(r.recordset[0].AccessToken); await sql.close();})()"'
  ```

- `MANDRILL_API_KEY` rotates rarely. The container env value is usually fresh.

- **Never write either credential to a local `.env` file or commit it.** Pass them inline at invocation time:

  ```bash
  MANDRILL_API_KEY="md-XXXX" BASECAMP_ACCESS_TOKEN="..." node backend/src/scripts/sendXyz.js
  ```

## Step 4 — Edit and run the smoke test

Open `backend/src/scripts/sampleSend.js` in your project and edit two constants at the top:

```js
const TICKET_ID = 9981757450;      // Replace with a real BC todo id you own
const TO = 'ali@colaberry.com';    // Replace with your own email for the first test
```

Then run it:

```bash
cd /path/to/your/new/project
MANDRILL_API_KEY="md-XXXX" \
BASECAMP_ACCESS_TOKEN="..." \
  node backend/src/scripts/sampleSend.js
```

Expected output:

```
Sent.
Mandrill ID: <abc...@colaberry.com>
BC comment : https://app.basecamp.com/3945211/buckets/7463955/todos/XXXX#__recording_YYYY
```

Check your inbox. If the email arrives **and** the BC ticket has a new comment with the email metadata, the kit is wired correctly.

---

## Two send paths (how to use the kit in real code)

### Path A — Default: email tied to a BC ticket

```js
const path = require('path');
const { sendWithBcAttach } = require('./lib/sendWithBcAttach');
const { SIG_HTML, SIG_TEXT } = require('./lib/emailSignature');

const result = await sendWithBcAttach({
  ticketId: 9981757450,                        // REQUIRED
  to: 'recipient@example.com',
  cc: ['ram@colaberry.com'],
  bcc: ['ali@colaberry.com'],
  subject: 'Subject line',
  html: bodyHtml + SIG_HTML,
  text: bodyText + '\n\n' + SIG_TEXT,
  attachments: [                               // standard email attachments
    { filename: 'foo.pdf', content: buf, contentType: 'application/pdf' },
  ],
  vaultAttachments: [                          // ALSO uploaded to BC vault as durable copies
    { filename: 'foo.pdf', content: buf, contentType: 'application/pdf',
      vaultDescription: 'Foo dossier 2026-06-09' },
  ],
  bcSummary: '<p>One-line HTML summary of what the email contains.</p>',
});
// result.mandrillId, result.commentUrl, result.vaultUploads
```

What it does for you:
- Strips em-dashes from `html` and `text` automatically
- Runs `validateBeforeSend()` preflight — hard-fails on em-dash, duplicate full name, double signatures
- Sends via Mandrill SMTP
- Uploads each `vaultAttachments` to the BC bucket's `CB Context Dossiers` vault folder
- Posts a structured comment on the ticket with subject, recipients, Mandrill ID, vault upload links
- Returns `{ mandrillId, commentUrl, vaultUploads }` for audit

### Path B — Standalone: no BC ticket (rare)

```js
const nodemailer = require('nodemailer');
const { validateBeforeSend } = require('./lib/mandrillPreflight');
const { SIG_HTML, SIG_TEXT } = require('./lib/emailSignature');

const cleanedHtml = htmlBody.replace(/—/g, '-').replace(/–/g, '-');
const cleanedText = textBody.replace(/—/g, '-').replace(/–/g, '-');
validateBeforeSend(cleanedHtml, cleanedText);  // throws on style violations

const transport = nodemailer.createTransport({
  host: 'smtp.mandrillapp.com',
  port: 587,
  auth: {
    user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com',
    pass: process.env.MANDRILL_API_KEY,
  },
});

await transport.sendMail({
  from: '"Ali Muwwakkil" <ali@colaberry.com>',
  to, cc,
  bcc: 'ali@colaberry.com',
  replyTo: 'ali@colaberry.com',
  subject,
  html: cleanedHtml + SIG_HTML,
  text: cleanedText + '\n\n' + SIG_TEXT,
  headers: { 'X-MC-Track': 'opens,clicks', 'X-MC-AutoText': 'false' },
});
```

---

## The 10 memory rules (paste once into the new project's Claude session)

> Outbound email rules for `ali@colaberry.com` sends from this project:
> 1. **Mandrill transport only**, never Gmail MCP for live sends (Gmail MCP is for drafts only).
> 2. **`sendWithBcAttach` helper is required** for any email tied to a BC ticket; `ticketId` is non-optional. Use raw nodemailer + `validateBeforeSend()` only for emails that genuinely have no originating ticket.
> 3. **No em-dashes (U+2014 or U+2013) anywhere** in html or text. Use a slash, hyphen with spaces, comma, or "and"/"but" instead. Preflight hard-fails on em-dash.
> 4. **Branded signature on every send** — append `SIG_HTML` to html body and `SIG_TEXT` to text body. Title format: `Managing Director / AI Systems Architect` (slash, never em-dash).
> 5. **No informal closer** when the branded signature is present. Body must not end with `Best, Ali` / `Thanks, Ali` / `Regards, Ali` / `Sincerely, Ali` / etc. Preflight rejects double sign-off. End body with the last real sentence.
> 6. **No duplicate full name in body.** Only the signature names him.
> 7. **Always BCC `ali@colaberry.com`** so Ali has a copy of every send.
> 8. **Body HTML font** is `arial, sans-serif`, size 14px, color `#2d3748`, line-height 1.6. Wrap paragraphs so signature font matches body.
> 9. **Credentials**: pull `MANDRILL_API_KEY` and `BASECAMP_ACCESS_TOKEN` from prod via `ssh root@95.216.199.47 "docker exec accelerator-backend printenv <NAME>"`. BC token rotates every 2 weeks; if stale, pull live from CCPP directly.
> 10. **Pre-send checklist** before invoking `node send<X>.js`: (a) zero em-dash bytes in the script (`U+2014` and `U+2013`), (b) HTML body contains the signature table, (c) text body ends with the plain-text signature block.

---

## Common pitfalls

- **`require('nodemailer')` fails** — make sure you ran `npm install nodemailer` in your project's `backend/` (or wherever your `package.json` lives). The portable helper uses the standard `require('nodemailer')` resolution.

- **BC token returns 401** — the container env value has expired. Pull live from CCPP using the Node one-liner in Step 3. Then restart the prod backend container (`ssh root@95.216.199.47 'cd /opt/colaberry-accelerator && docker compose -f docker-compose.production.yml restart backend'`) so future `printenv` calls return the fresh value.

- **Preflight rejects with "duplicate full name"** — your HTML or text body literally contains "Ali Muwwakkil" outside the signature. Search and remove. The signature itself is the only place the name should appear.

- **Em-dash in script** — even though the helper strips em-dashes from the body before sending, the em-dash hook will block your file edits at Write time. Avoid em-dashes in your source. Use a slash, comma, or hyphen with spaces.

- **Email doesn't arrive but no error thrown** — Mandrill may be sandbox-throttling. Check the Mandrill dashboard or the BC ticket comment for the Mandrill message ID; trace it there.

- **Hardcoded paths in `setup.sh`** — `setup.sh` assumes your target project has a `backend/src/scripts/lib/` directory layout. If yours differs, copy files manually to the correct locations.

---

## Pre-send checklist (run every time before a live send)

```bash
# 1. Zero em-dashes in the send script
grep -c $'\xe2\x80\x94' backend/src/scripts/sendXyz.js   # must be 0
grep -c $'\xe2\x80\x93' backend/src/scripts/sendXyz.js   # must be 0

# 2. nodemailer resolves
node -e "require('nodemailer'); console.log('nodemailer OK')"

# 3. Preflight smoke test
node -e "const {validateBeforeSend} = require('./backend/src/scripts/lib/mandrillPreflight'); validateBeforeSend('<p>hello world</p>', 'hello world'); console.log('preflight OK')"

# 4. Real send
MANDRILL_API_KEY="..." BASECAMP_ACCESS_TOKEN="..." node backend/src/scripts/sendXyz.js
```

---

## File reference: where each piece comes from

All seven files live as attachments on this single BC ticket:

<https://app.basecamp.com/3945211/buckets/7463955/todos/9981757450>

Click the ticket, scroll to the comment with the auto-attach record (or the Vault folder titled "CB Context Dossiers" within the Ali Personal project), and download.

When this skill is updated, the new versions get re-uploaded to the same ticket. The ticket URL is the durable pointer — bookmark it once and you'll always have the current kit.
