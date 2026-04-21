# Deploy a second MCP on the same VPS

Runbook for adding a new MCP server (e.g. `sales-mcp`, `onboard-mcp`) alongside `refund-mcp` on VPS `52.55.66.40` (`pf-support`).

> **Current state (as of 2026-04-21):** the one-time infrastructure (Caddy + refund-mcp on port 3000) is already deployed. Jump straight to **Part 2** unless you're replacing the VPS. Part 1 is kept at the end of this doc for reference and disaster recovery.

---

## Architecture

```
IT edge (HTTPS termination, public internet)
    ├── refund-mcp.pagefly.io:443  ─┐
    ├── sales-mcp.pagefly.io:443   ─┼──►  VPS :80 (Caddy)
    └── onboard-mcp.pagefly.io:443 ─┘           │
                                                ├── Host: refund-mcp.pagefly.io  → localhost:3000
                                                ├── Host: sales-mcp.pagefly.io   → localhost:3001
                                                └── Host: onboard-mcp.pagefly.io → localhost:3002
```

Caddy routes by `Host` header to the correct Node process. Each MCP has its own folder, `.env`, Turso DB and PM2 process — zero cross-talk.

### Port allocation on `pf-support`

| Port | Owner |
|------|-------|
| 80 | Caddy (reverse proxy, receives from IT edge) |
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
| `<NAME>` | `sales` | short name (folder + PM2 process id) |
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

### Step 1 — Clone the repo

SSH into the VPS via Teleport as `root`, then:

```bash
git clone <REPO_URL> /opt/mcp/<NAME>
```

```bash
cd /opt/mcp/<NAME>
```

### Step 2 — Create `.env`

Use `nano` (installed globally) — safer than heredocs in the Teleport web terminal:

```bash
nano /opt/mcp/<NAME>/.env
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
chmod 600 /opt/mcp/<NAME>/.env
```

### Step 3 — Build and start

If the repo has `scripts/setup.sh`:

```bash
bash /opt/mcp/<NAME>/scripts/setup.sh
```

The script installs Node/PM2 if missing, runs `npm ci && npm run build`, registers a PM2 process named `<NAME>-mcp`, and registers it as a systemd service.

Fallback when there's no setup script:

```bash
cd /opt/mcp/<NAME> && npm ci && npm run build
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

### Step 4 — Add Caddy route

Edit the Caddyfile:

```bash
nano /etc/caddy/Caddyfile
```

The current file looks like this:

```caddy
{
    auto_https off
}

:80 {
    @refund host refund-mcp.pagefly.io
    handle @refund {
        reverse_proxy localhost:3000
    }

    handle {
        respond "Unknown host" 404
    }
}
```

Add a new matcher + handle block **above** the catch-all `handle { respond ... }`. After editing, the file should look like:

```caddy
{
    auto_https off
}

:80 {
    @refund host refund-mcp.pagefly.io
    handle @refund {
        reverse_proxy localhost:3000
    }

    @<NAME> host <SUBDOMAIN>
    handle @<NAME> {
        reverse_proxy localhost:<PORT>
    }

    handle {
        respond "Unknown host" 404
    }
}
```

Save with `Ctrl+O` → Enter → `Ctrl+X`.

Validate and reload:

```bash
caddy validate --config /etc/caddy/Caddyfile
```

Must print `Valid configuration`. If not, fix the syntax before reloading.

```bash
systemctl reload caddy
```

### Step 5 — Verify end-to-end

From the VPS:

```bash
curl -s -H "Host: <SUBDOMAIN>" http://localhost/health && echo
```

Must return `OK` (and the same for `refund-mcp.pagefly.io` — existing MCP must not be broken).

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

```bash
cd /opt/mcp/<NAME>
```

```bash
git pull
```

```bash
bash scripts/setup.sh
```

(or `npm ci && npm run build && pm2 reload <NAME>-mcp` without the setup script).

**Env vars changed**: after editing `.env`, use `pm2 restart` instead of `reload` so Node picks up the new values:

```bash
nano /opt/mcp/<NAME>/.env
pm2 restart <NAME>-mcp
```

---

## Rolling back a broken MCP

If the new MCP crashes or breaks the Caddyfile:

```bash
pm2 stop <NAME>-mcp && pm2 delete <NAME>-mcp && pm2 save
```

Remove the `@<NAME>` + matching `handle` block from `/etc/caddy/Caddyfile`, then:

```bash
caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy
```

Delete the folder when you're ready to clean up:

```bash
rm -rf /opt/mcp/<NAME>
```

`refund-mcp` keeps running the whole time.

---

## Troubleshooting

### `502 Bad Gateway` from the edge

Caddy reached, but the upstream Node process is down.

```bash
pm2 status
pm2 logs <NAME>-mcp --lines 50 --nostream
```

Common causes: app crashed on boot (bad `.env`), port conflict, DB unreachable.

### `Unknown host` response

Request reached Caddy but `Host` header doesn't match any matcher. Usually the `@<NAME>` block is missing or the subdomain doesn't match.

```bash
curl -sI -H "Host: <SUBDOMAIN>" http://localhost/
```

### Caddy reload fails

```bash
caddy validate --config /etc/caddy/Caddyfile
```

Points at the exact line with a syntax error. Fix and reload.

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

Pick a different port. Update `.env` (`PORT=<NEW>`), `pm2 restart <NAME>-mcp`, and the Caddy `reverse_proxy` line.

---

## Resource notes

`pf-support` has 7.7 GB RAM / 40 GB SSD. Each MCP uses ~150 MB RAM under load plus ~30 MB for Caddy. Comfortable for 5+ MCPs. If you see sustained memory pressure in `free -h`, ask IT to bump RAM.

Turso free tier covers 500 DBs and 25 M writes/month per account — well beyond anything we'll need here.

---

## Part 1 reference — one-time infra (already done)

> This section is historical — the commands ran on 2026-04-21 during the first multi-MCP migration. Only re-run them if the VPS is rebuilt from scratch.

1. **Move refund-mcp to port 3000**

   ```bash
   sed -i 's/^PORT=.*/PORT=3000/' /opt/mcp/refund/.env
   pm2 restart refund-mcp
   ```

2. **Install Caddy**

   ```bash
   apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
   apt update && apt install -y caddy
   ```

3. **Create the initial `/etc/caddy/Caddyfile`** with only the refund route (block at the top of Part 2 Step 4).

4. **Restart Caddy** and verify refund-mcp still responds externally:

   ```bash
   systemctl restart caddy
   curl https://refund-mcp.pagefly.io/health
   ```

Total time on the live VPS: ~5 minutes, no data loss, ~30 s downtime while Caddy replaced the direct Node-on-port-80 binding.
