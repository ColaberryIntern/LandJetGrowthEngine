# Directive: Enable HTTPS/TLS on growth.landjet.com (TBI gap G3)

**Goal:** Serve `growth.landjet.com` over HTTPS so the last open P0 trust condition (G3) flips to "met" on the Trust Command Center, and credentials/JWTs/webhook payloads stop crossing the wire in cleartext.

**Owner:** Infra (Ali / ops). This is an infrastructure task; it ships no application code beyond a one-line env flag.

**Current state:** The site is HTTP-only. nginx terminates on `:80` in the LandJet stack (`/nginx`, `docker-compose.production.yml`). The VPS (`95.216.199.47`) is multi-tenant (~30 containers).

---

## Option A — Cloudflare proxy (recommended, fastest, no cert management)

Best when DNS for `landjet.com` can point at Cloudflare. TLS terminates at Cloudflare's edge; origin can stay HTTP behind it (use "Full" once an origin cert is added).

1. Add `landjet.com` to Cloudflare; update the registrar nameservers.
2. DNS: `A growth -> 95.216.199.47`, **proxied** (orange cloud).
3. SSL/TLS mode: start **Flexible** (edge HTTPS, HTTP to origin) to go live immediately, then move to **Full (strict)** after step 4 for true end-to-end TLS.
4. (For Full/strict) Install a Cloudflare **Origin Certificate** on the box and have nginx listen on `:443` (see Option B step 3 for the nginx server block; use the origin cert paths).
5. Turn on **Always Use HTTPS** and **Automatic HTTPS Rewrites** in Cloudflare.
6. Because traffic now arrives via Cloudflare's proxy IPs, keep Express `trust proxy` at `1` (already set in `src/app.ts`). If Cloudflare + nginx becomes two hops, bump to `2` and restrict nginx `set_real_ip_from` to the Cloudflare ranges.

## Option B — Let's Encrypt on the origin (no Cloudflare dependency)

1. Point `growth.landjet.com` A record at `95.216.199.47` (DNS only).
2. Issue a cert. Easiest is a host-level certbot + webroot, or run certbot in a sidecar. Host example:
   ```bash
   ssh root@95.216.199.47
   certbot certonly --webroot -w /opt/landjet-growth-engine/nginx/webroot -d growth.landjet.com
   # cert lands in /etc/letsencrypt/live/growth.landjet.com/
   ```
3. Add a `:443` server block to the LandJet nginx config (mount the cert dir into the nginx container), redirect `:80 -> :443`:
   ```nginx
   server { listen 80; server_name growth.landjet.com; return 301 https://$host$request_uri; }
   server {
     listen 443 ssl;
     server_name growth.landjet.com;
     ssl_certificate     /etc/letsencrypt/live/growth.landjet.com/fullchain.pem;
     ssl_certificate_key /etc/letsencrypt/live/growth.landjet.com/privkey.pem;
     # ... existing proxy_pass blocks to frontend + /api -> backend, unchanged ...
   }
   ```
4. Auto-renew: `certbot renew` via cron/systemd-timer; reload nginx on success.

---

## After TLS is live (both options)

1. Set the dashboard signal: add `HTTPS_ENABLED=true` to the backend env (prod `.env` / compose), redeploy backend. The Trust Command Center G3 row flips **open -> met** automatically (it reads this flag in `trustDashboardService.buildRemediation`).
2. Verify: `curl -sI https://growth.landjet.com/api/health` returns `200` over TLS; `http://` 301-redirects to `https://`.
3. Set the Mandrill webhook URL to the `https://` form and set `MANDRILL_WEBHOOK_KEY` (+ `MANDRILL_WEBHOOK_URL`) so G2 enforcement turns on (flips **partial -> met**).

## Verification of success
- Browser padlock on `growth.landjet.com`.
- `https://growth.landjet.com/admin/trust` shows G3 = **Met (LIVE)** and, once the webhook key is set, G2 = **Met (LIVE)**.
- No mixed-content warnings in the console.
