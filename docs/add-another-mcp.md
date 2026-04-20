# Deploy a second MCP on the same VPS

Runbook for adding an additional MCP server (e.g. `sales-mcp`, `onboard-mcp`) alongside the existing `refund-mcp` on VPS `52.55.66.40` (`pf-support`).

---

## Architecture after the change

```
IT edge (HTTPS termination)
    ├── refund-mcp.pagefly.io:443  ─┐
    ├── sales-mcp.pagefly.io:443   ─┼──►  VPS port 80 (Caddy reverse proxy)
    └── onboard-mcp.pagefly.io:443 ─┘               │
                                                    ├── Host: refund-mcp.pagefly.io  → localhost:3000
                                                    ├── Host: sales-mcp.pagefly.io   → localhost:3001
                                                    └── Host: onboard-mcp.pagefly.io → localhost:3002
```

Caddy routes incoming traffic by `Host` header to the correct Node process. Each MCP owns its own folder, `.env`, Turso DB, and PM2 process.

---

## Prerequisites

Before starting, get these from IT and Turso:

- [ ] **Subdomain** from IT — e.g. `sales-mcp.pagefly.io`. IT must add forwarding rule: `sales-mcp.pagefly.io:443` (HTTPS) → VPS `52.55.66.40:80` (same as `refund-mcp`).
- [ ] **Turso database** — sign in to [turso.tech](https://turso.tech), create a new DB (e.g. `sales-leads`), generate an auth token with no expiration. Save URL + token.
- [ ] **Git repo** of the second MCP — must have the same `scripts/setup.sh` contract (or adapt). Assume URL is `https://github.com/<you>/<second-mcp>.git`.

---

## Part 1 — One-time setup (skip if already done)

Only runs the **first time** you add a second MCP. Migrates `refund-mcp` from port 80 to port 3000 and installs Caddy as a reverse proxy.

### 1.1 Move refund-mcp to port 3000

```bash
sed -i 's/^PORT=.*/PORT=3000/' /opt/mcp/refund/.env
```

```bash
pm2 restart refund-mcp
```

```bash
pm2 logs refund-mcp --lines 5 --nostream
```

Verify the log shows `Refund MCP Server running on http://localhost:3000/mcp`.

### 1.2 Install Caddy

```bash
apt install -y debian-keyring debian-keyring-keyring apt-transport-https curl
```

```bash
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
```

```bash
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
```

```bash
apt update && apt install -y caddy
```

### 1.3 Write the Caddyfile

Heredoc — one command, Teleport-safe:

```bash
cat > /etc/caddy/Caddyfile <<'EOF'
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
EOF
```

`auto_https off` disables Caddy's own HTTPS — IT's edge handles HTTPS termination, Caddy only serves plain HTTP on port 80.

### 1.4 Reload Caddy

```bash
systemctl reload caddy
```

```bash
systemctl status caddy --no-pager | head -10
```

Must show `active (running)`.

### 1.5 Verify refund-mcp still works

```bash
curl -s -H "Host: refund-mcp.pagefly.io" http://localhost/health && echo
```

Must print `OK`.

From your laptop (VPN off):

```powershell
curl.exe https://refund-mcp.pagefly.io/health
```

Must return `OK`. If yes, existing Crisp integration keeps working — Part 1 done.

---

## Part 2 — Deploy the second MCP

For every new MCP, repeat this section. Replace:

- `<NAME>` → short name, e.g. `sales`
- `<PORT>` → unused local port, e.g. `3001`, `3002`, …
- `<SUBDOMAIN>` → domain from IT, e.g. `sales-mcp.pagefly.io`
- `<REPO_URL>` → Git URL of the new MCP
- `<TURSO_URL>` and `<TURSO_TOKEN>` → new Turso DB credentials

### 2.1 Clone the repo

```bash
git clone <REPO_URL> /opt/mcp/<NAME>
```

```bash
cd /opt/mcp/<NAME>
```

### 2.2 Create `.env`

If the token is very long (JWT), split into chunks to work around Teleport's paste limit. For shorter configs, one heredoc is fine:

```bash
cat > /opt/mcp/<NAME>/.env <<'EOF'
TURSO_DATABASE_URL=<TURSO_URL>
TURSO_AUTH_TOKEN=<TURSO_TOKEN>
PORT=<PORT>
EOF
```

```bash
chmod 600 /opt/mcp/<NAME>/.env
```

### 2.3 Build and start

If the repo has `scripts/setup.sh` (like `refund-mcp`):

```bash
bash /opt/mcp/<NAME>/scripts/setup.sh
```

Otherwise, do it manually:

```bash
cd /opt/mcp/<NAME> && npm ci && npm run build
```

```bash
pm2 start npm --name <NAME>-mcp -- run start
```

```bash
pm2 save
```

### 2.4 Add Caddy route

Append a new block to `/etc/caddy/Caddyfile` **before the final `handle { respond ... }`** block.

Use `sed` to insert right above the catch-all handler:

```bash
sed -i '/^    handle {$/i\
    @<NAME> host <SUBDOMAIN>\
    handle @<NAME> {\
        reverse_proxy localhost:<PORT>\
    }\
' /etc/caddy/Caddyfile
```

Verify manually:

```bash
cat /etc/caddy/Caddyfile
```

The file should now contain both `@refund` and `@<NAME>` matchers.

### 2.5 Reload Caddy

```bash
caddy validate --config /etc/caddy/Caddyfile
```

Must print `Valid configuration`. If not, fix the syntax before reloading.

```bash
systemctl reload caddy
```

### 2.6 Verify

From the VPS:

```bash
curl -s -H "Host: <SUBDOMAIN>" http://localhost/health && echo
```

From your laptop (VPN off):

```powershell
curl.exe https://<SUBDOMAIN>/health
```

Both must return `OK`.

MCP endpoint smoke test:

```powershell
curl.exe -X POST https://<SUBDOMAIN>/mcp -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}"
```

Must return a JSON list of tools.

### 2.7 Add to Crisp

1. app.crisp.chat → **AI Agent → Automate → Integrations & MCP → External MCP servers**
2. **Add MCP server** → URL `https://<SUBDOMAIN>/mcp` → name it → **Refresh tools from server** → enable → save
3. Test in **Playground**

---

## Updating an MCP after deploy

Whenever the code changes:

```bash
cd /opt/mcp/<NAME>
```

```bash
git pull
```

```bash
bash scripts/setup.sh
```

(or `npm ci && npm run build && pm2 reload <NAME>-mcp` if no setup script).

---

## Troubleshooting

### `502 Bad Gateway` from the edge

Caddy got the request but cannot reach the upstream Node process.

```bash
pm2 status
```

If the app is not `online` → check `pm2 logs <NAME>-mcp` for a crash.

### Caddy reload fails

```bash
caddy validate --config /etc/caddy/Caddyfile
```

Reveals the syntax error. Fix it, reload.

### `Unknown host` response

Request reached Caddy but the `Host` header doesn't match any matcher.

```bash
curl -sI -H "Host: <SUBDOMAIN>" http://localhost/
```

If this still fails, the `@<NAME>` matcher is missing or misspelled in the Caddyfile.

### DNS not resolving

IT hasn't finished the edge setup, or DNS hasn't propagated yet. Wait 5–30 min and retry:

```bash
getent hosts <SUBDOMAIN>
```

Must resolve to `52.55.66.40` (or the public IP of the VPS).

### VPN issue

If `curl https://<SUBDOMAIN>` works without VPN but fails on VPN → split-horizon DNS / routing. Normal behaviour, ignore — Crisp reaches the endpoint from the public internet, not via your VPN.

---

## Rollback

If the new MCP is broken and you need to revert to just `refund-mcp`:

```bash
pm2 stop <NAME>-mcp && pm2 delete <NAME>-mcp && pm2 save
```

Remove the `@<NAME>` and matching `handle` block from `/etc/caddy/Caddyfile`, then:

```bash
systemctl reload caddy
```

The refund-mcp route stays intact. Delete the `/opt/mcp/<NAME>` folder when you're ready.

---

## Resource planning

A VPS with **2 GB RAM / 1 vCPU / 20 GB SSD** comfortably runs 3 MCPs (each ~150 MB RAM under load plus ~30 MB for Caddy). Beyond 5 MCPs, bump to 4 GB / 2 vCPU.

Turso free tier covers 500 databases, 9 GB storage, 25 M writes/month per account — well within limits for dozens of MCPs.
