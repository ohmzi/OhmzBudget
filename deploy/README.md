# OhmzBudget host deploy

Compose skeleton for the self-hosted OhmzBudget on this host. It builds the
image from the repo's root `Dockerfile` in server mode and binds it to loopback
only (`127.0.0.1:7300`); public access goes through the cloudflared tunnel.

## Files

- `compose.yml` — the service: server mode, loopback-only port, `/data` volume,
  compose secret, read-only root filesystem (writable `/tmp` only), no
  capabilities.
- `docker-compose.override.yml` — pins the project network to `10.88.0.0/24`
  because this host's Docker default address pools are exhausted. Pass it as a
  second `-f` on every compose command.
- `.env.example` — copy to `.env` to set `OHMZBUDGET_ALLOWED_HOSTS` (see below).
- `.gitignore` — keeps `secrets/` out of git. Never commit the key; keep a
  backup of it somewhere safe (without it, stored bank credentials can't be
  decrypted).

## Run

```bash
cd deploy
mkdir -p secrets
[ -f secrets/ohmzbudget_data_key ] || { openssl rand -base64 32 > secrets/ohmzbudget_data_key; }
chmod 400 secrets/ohmzbudget_data_key
docker compose -f compose.yml -f docker-compose.override.yml up -d --build
```

Verify:

```bash
curl -sf http://127.0.0.1:7300/api/health   # {"status":"ok"}
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:7300/   # 200 (login screen)
docker compose -f compose.yml -f docker-compose.override.yml ps
```

The first visit at http://localhost:7300 asks to set a password and needs the
one-time setup code printed in the logs: `docker logs ohmzbudget`.

After the first run, use `docker compose -f compose.yml -f docker-compose.override.yml up -d --build`
again to rebuild after a code change (this skeleton always builds the image
locally; it does not pull the published `ghcr.io/ohmzi/ohmzbudget` image).

## Remote access (owner)

- Cloudflare dashboard: route `budget.example.com` to
  `http://localhost:7300`.
- Then set `OHMZBUDGET_ALLOWED_HOSTS` in `deploy/.env` (copy `.env.example`) to
  include `budget.example.com`; with the default list only localhost is
  accepted and the tunnel's Host header is refused with 403.

## Data

The budget database lives in the `ohmzbudget-data` volume (`/data` in the
container). Back it up; `docker compose ... down` keeps the volume, `down -v`
deletes it.
