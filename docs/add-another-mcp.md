# Deploy a second MCP on the same VPS

Runbook for adding a new MCP server (e.g. `sales-mcp`, `onboard-mcp`) alongside `refund-mcp` on VPS `52.55.66.40` (`pf-support`).

> **Current state (as of 2026-05-14):** the one-time infrastructure (nginx + refund-mcp on port 3000) is already deployed. Jump straight to **Part 2** unless you're replacing the VPS. Part 1 is kept at the end of this doc for reference and disaster recovery.
>
> Reverse proxy migrated from Caddy → nginx on 2026-05-14. If you read older revisions of this doc that mention Caddy, the routing model is identical (Host-header → localhost port), only the config format changed.

---

## Architecture

```
IT edge (HTTPS termination, public internet)
    ├── refund-mcp.pagefly.io:443  ─┐
    ├── sales-mcp.pagefly.io:443   ─┼──►  VPS :80 (nginx)
    └── onboard-mcp.pagefly.io:443 ─┘           │
                                                ├── Host: refund-mcp.pagefly.io  → localhost:3000
                                                ├── Host: sales-mcp.pagefly.io   → localhost:3001
                                                └── Host: onboard-mcp.pagefly.io → localhost:3002
```

nginx routes by `server_name` (Host header) to the correct Node process. Each MCP has its own folder, `.env`, Turso DB, PM2 process, and nginx site config — zero cross-talk.

### Port allocation on `pf-support`

| Port | Owner |
|------|-------|
| 80 | nginx (reverse proxy, receives from IT edge) |
| 3000 | `refund-mcp` (active) |
| 3001 | next MCP — claim when deploying |
| 3002 | … |
| 3003 | … |

Assign the next free 30xx port to each new MCP. Keep this table in the doc up to date.

---

## Part 2 — Per-MCP deploy (do this for every new MCP)

Replace these placeholders throughout the commands below:

| Placeholder | Example | Meaning |
|-------------|---------|---------|
| `<NAME>` | `sales` | short name. Folder is `/var/www/mcp-<NAME>`, PM2 process is `<NAME>-mcp` (note the order differs: `mcp-sales` folder, `sales-mcp` process — matching the existing `mcp-refund` / `refund-mcp`) |
| `<PORT>` | `3001` | unused local port |
| `<SUBDOMAIN>` | `sales-mcp.pagefly.io` | subdomain IT forwards to VPS:80 |
| `<REPO_URL>` | `https://github.com/<org>/<repo>.git` | Git URL of the MCP code |
| `<TURSO_URL>` | `libsql://sales-leads-xxx.turso.io` | Turso DB URL |
| `<TURSO_TOKEN>` | `eyJhbGc…` | Turso auth token |

### Prerequisites checklist

Before running any commands, have these ready:

- [ ] IT has created `<SUBDOMAIN>` with HTTPS → VPS `52.55.66.40:80` forwarding
- [ ] Turso DB created, URL + token in hand
- [ ] MCP repo pushed to Git with a working `scripts/setup.sh` (adapt from refund-crisp-mcp if missing)
- [ ] `<PORT>` is free (`ss -tlnp | grep :30` to confirm nothing else is listening)
- [ ] DNS resolves — run `getent hosts <SUBDOMAIN>` and expect `52.55.66.40`
- [ ] nginx is already running (`systemctl status nginx`) — it terminates port 80 and routes via `server_name` to the right MCP

### Step 1 — Clone the repo

SSH into the VPS via Teleport as `root`, then:

```bash
git clone <REPO_URL> /var/www/mcp-<NAME>
```

```bash
cd /var/www/mcp-<NAME>
```

### Step 2 — Create `.env`

Use `nano` (installed globally) — safer than heredocs in the Teleport web terminal:

```bash
nano /var/www/mcp-<NAME>/.env
```

Paste content:

```env
TURSO_DATABASE_URL=<TURSO_URL>
TURSO_AUTH_TOKEN=<TURSO_TOKEN>
PORT=<PORT>
```

Save with `Ctrl+O` → Enter → `Ctrl+X`.

If the MCP also writes back to Crisp (e.g. `tag_case`-style tools), add:

```env
CRISP_WEBSITE_ID=7cd1799e-e8eb-476e-8cb7-33778fc41c2a
CRISP_IDENTIFIER=<plugin-identifier>
CRISP_KEY=<plugin-key>
```

Lock the file permissions:

```bash
chmod 600 /var/www/mcp-<NAME>/.env
```

### Step 3 — Build and start

If the repo has `scripts/setup.sh`:

```bash
bash /var/www/mcp-<NAME>/scripts/setup.sh
```

The script installs Node/PM2 if missing, runs `npm ci && npm run build`, registers a PM2 process named `<NAME>-mcp`, and registers it as a systemd service.

Fallback when there's no setup script:

```bash
cd /var/www/mcp-<NAME> && npm ci && npm run build
```

```bash
pm2 start npm --name <NAME>-mcp -- run start
```

```bash
pm2 save
```

Verify the process is online:

```bash
pm2 status
```

```bash
curl -s http://localhost:<PORT>/health && echo
```

Must return `OK`.

### Step 4 — Add nginx site

Each MCP gets its own file under `/etc/nginx/sites-available/`, symlinked into `sites-enabled/`. The catch-all (404 for unknown hosts) lives in `refund-mcp.conf` via `listen 80 default_server` and does not need to be touched.

```bash
nano /etc/nginx/sites-available/<NAME>-mcp.conf
```

Paste:

```nginx
server {
    listen 80;
    server_name <SUBDOMAIN>;

    location / {
        proxy_pass http://127.0.0.1:<PORT>;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_buffering   off;
        proxy_read_timeout 1h;
        proxy_send_timeout 1h;
    }
}
```

Save with `Ctrl+O` → Enter → `Ctrl+X`.

Enable the site:

```bash
ln -s /etc/nginx/sites-available/<NAME>-mcp.conf /etc/nginx/sites-enabled/<NAME>-mcp.conf
```

Validate:

```bash
nginx -t
```

Must print `syntax is ok` + `test is successful`. If not, fix the syntax before reloading.

```bash
systemctl reload nginx
```

### Step 5 — Verify end-to-end

From the VPS:

```bash
curl -s -H "Host: <SUBDOMAIN>" http://localhost/health && echo
```

```bash
curl -s -H "Host: refund-mcp.pagefly.io" http://localhost/health && echo
```

Both must return `OK` — the second confirms the existing MCP wasn't broken by the new site.

From your laptop with VPN **off**:

```powershell
curl.exe https://<SUBDOMAIN>/health
```

Must return `OK`.

MCP endpoint smoke:

```powershell
curl.exe -X POST https://<SUBDOMAIN>/mcp -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}"
```

Must return a JSON list of tools.

### Step 6 — Connect to Crisp

1. app.crisp.chat → **AI Agent → Automate → Integrations & MCP → External MCP servers**
2. **Add MCP server** → URL `https://<SUBDOMAIN>/mcp` → name it → **Refresh tools from server** → enable → save
3. Test in **Playground**

### Step 7 — Update the port allocation table

Come back to this file and mark `<PORT>` as taken:

```
| 3001 | sales-mcp (active since 2026-04-25) |
```

Commit the change so the next deploy sees the right starting port.

---

## Updating an MCP after it's deployed

SSH into the VPS via Teleport as `root`, `cd` into the MCP folder, pull, rebuild, reload. For **refund-mcp** specifically (folder `/var/www/mcp-refund`, process `refund-mcp`):

```bash
cd /var/www/mcp-refund
git pull
npm ci && npm run build && pm2 reload refund-mcp
```

Generic form for any MCP:

```bash
cd /var/www/mcp-<NAME>
git pull
npm ci && npm run build && pm2 reload <NAME>-mcp   # or: bash scripts/setup.sh
```

`pm2 reload` is enough for code-only changes (zero-downtime). Verify after:

```bash
curl -s http://localhost:3000/health && echo    # refund-mcp is on :3000
pm2 logs refund-mcp --lines 30 --nostream
```

**Env vars changed**: after editing `.env`, use `pm2 restart` instead of `reload` so Node picks up the new values (`reload` keeps the old env):

```bash
nano /var/www/mcp-<NAME>/.env
pm2 restart <NAME>-mcp
```

---

## Rolling back a broken MCP

If the new MCP crashes or breaks nginx:

```bash
pm2 stop <NAME>-mcp && pm2 delete <NAME>-mcp && pm2 save
```

Remove the nginx site (file + symlink), then reload:

```bash
rm /etc/nginx/sites-enabled/<NAME>-mcp.conf
rm /etc/nginx/sites-available/<NAME>-mcp.conf
nginx -t && systemctl reload nginx
```

Delete the folder when you're ready to clean up:

```bash
rm -rf /var/www/mcp-<NAME>
```

`refund-mcp` keeps running the whole time — its own site config and PM2 process are untouched.

---

## Troubleshooting

### `502 Bad Gateway` from the edge

nginx reached, but the upstream Node process is down.

```bash
pm2 status
pm2 logs <NAME>-mcp --lines 50 --nostream
```

Also check nginx error log:

```bash
tail -50 /var/log/nginx/error.log
```

Common causes: app crashed on boot (bad `.env`), port conflict, DB unreachable.

### `Unknown host` response (404)

Request reached nginx but `Host` header doesn't match any `server_name`. Usually the site config is missing or the symlink wasn't created.

```bash
ls -l /etc/nginx/sites-enabled/
curl -sI -H "Host: <SUBDOMAIN>" http://localhost/
```

### nginx reload fails

```bash
nginx -t
```

Points at the exact file + line with a syntax error. Fix and re-run before `systemctl reload nginx`.

### DNS not resolving

IT hasn't finished the edge setup, or DNS is still propagating. Wait 5–30 min.

```bash
getent hosts <SUBDOMAIN>
```

Must resolve to `52.55.66.40`.

### HTTPS works off-VPN, fails on VPN

Normal. VPN split-horizon DNS routes you internally while Crisp always hits the public edge. Ignore for MCP purposes.

### Port `<PORT>` already in use

```bash
ss -tlnp | grep :<PORT>
```

Pick a different port. Update `.env` (`PORT=<NEW>`), `pm2 restart <NAME>-mcp`, and the `proxy_pass` line in `/etc/nginx/sites-available/<NAME>-mcp.conf`. Then `nginx -t && systemctl reload nginx`.

---

## Resource notes

`pf-support` has 7.7 GB RAM / 40 GB SSD. Each MCP uses ~150 MB RAM under load plus ~20 MB for nginx (3 worker processes). Comfortable for 5+ MCPs. If you see sustained memory pressure in `free -h`, ask IT to bump RAM.

Turso free tier covers 500 DBs and 25 M writes/month per account — well beyond anything we'll need here.

---

## Part 1 reference — one-time infra (already done)

> This section is historical — only re-run if the VPS is rebuilt from scratch.
> - **2026-04-21:** first multi-MCP migration, installed Caddy as reverse proxy.
> - **2026-05-14:** swapped Caddy for nginx (sites-available pattern, per-MCP file). Current state.

1. **Move refund-mcp to port 3000** (only needed on a brand-new VPS where it's binding port 80 directly):

   ```bash
   sed -i 's/^PORT=.*/PORT=3000/' /var/www/mcp-refund/.env
   pm2 restart refund-mcp
   ```

2. **Install nginx**

   ```bash
   apt update && apt install -y nginx
   rm -f /etc/nginx/sites-enabled/default
   ```

3. **Create `/etc/nginx/sites-available/refund-mcp.conf`** with both the refund site and the catch-all 404 (one server block per concern):

   ```nginx
   server {
       listen 80;
       server_name refund-mcp.pagefly.io;

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";

           proxy_buffering   off;
           proxy_read_timeout 1h;
           proxy_send_timeout 1h;
       }
   }

   server {
       listen 80 default_server;
       server_name _;
       return 404 "Unknown host\n";
   }
   ```

4. **Enable + reload**

   ```bash
   ln -s /etc/nginx/sites-available/refund-mcp.conf /etc/nginx/sites-enabled/refund-mcp.conf
   nginx -t && systemctl enable --now nginx
   curl https://refund-mcp.pagefly.io/health
   ```

### Migration from Caddy → nginx (2026-05-14)

Performed live with ~3 s downtime:

```bash
# Install nginx alongside (Caddy still holds port 80)
apt update && apt install -y nginx && systemctl stop nginx
rm -f /etc/nginx/sites-enabled/default

# Drop in /etc/nginx/sites-available/refund-mcp.conf (same content as Part 1 step 3)
ln -s /etc/nginx/sites-available/refund-mcp.conf /etc/nginx/sites-enabled/refund-mcp.conf
nginx -t

# Cutover
systemctl stop caddy && systemctl disable caddy
systemctl start nginx && systemctl enable nginx

# (later, after verification) Purge Caddy
apt remove --purge -y caddy && rm -rf /etc/caddy /var/lib/caddy
```
