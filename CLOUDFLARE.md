# Cloudflare Containers deployment

Run commands from the repository root. Nothing is deployed automatically.

## Architecture and prerequisites

The Worker forwards all paths, request bodies, query strings and WebSocket upgrades
to one named container. Express, Socket.IO rooms/events, Prisma/PostgreSQL, Cloudinary
and the existing route handlers run in Node unchanged. The Durable Object binding
only manages/routes the container; its SQLite migration is Cloudflare infrastructure,
not an application database migration. Neon remains the application database.

Use Node 22 or newer, npm, Docker Desktop running Linux containers, and a Cloudflare
account with Containers access and the required paid plan. The image targets
linux/amd64. The root Docker build installs API/shared workspaces, builds shared
before the API, generates Prisma Client, prunes development dependencies, and runs
compiled JavaScript as the non-root node user. It never runs migrations or seeds.

The single instance is intentional: Socket.IO's default in-memory adapter and
polling sessions cannot be randomly distributed across instances. Do not add load
balancing without a separate Socket.IO scaling change. Idle instances sleep after
30 minutes; cold starts add latency. Deploys/restarts disconnect clients; existing
client reconnection behavior remains unchanged. Reconnect alone does not replay
missed business events. Test recovery before cutover.

## Local checks

```powershell
npm ci
npm run build:api
npx tsc -p cloudflare/tsconfig.json
npm run test -w apps/api -- --run
node scripts/smoke-api.cjs
npx wrangler deploy --dry-run --outdir .wrangler/dry-run
```

The smoke script starts an isolated API with test-only environment variables and
an unreachable dummy database. It tests health, allowed/disallowed HTTP origins,
Socket.IO CORS, polling, direct WebSocket, polling upgrade and automatic reconnect.
It performs no database or Cloudinary operations. Port 13001 must be available.

For the complete Worker/container path, copy the example once, then edit the copy
with non-production Neon, Cloudinary and Resend credentials:

```powershell
Copy-Item .dev.vars.example .dev.vars
npx wrangler dev
```

In another terminal:

```powershell
curl.exe -i http://localhost:8787/health
curl.exe -i -H "Origin: http://localhost:5173" "http://localhost:8787/socket.io/?EIO=4&transport=polling"
```

For a standalone Docker check, prepare an ignored apps/api/.env.container file
using apps/api/.env.example and test credentials (do not overwrite an existing .env):

```powershell
docker build --platform linux/amd64 -t smart-qr-api .
docker run --rm --env-file apps/api/.env.container -p 3001:3001 smart-qr-api
curl.exe -i http://localhost:3001/health
```

## Production configuration and manual deployment

Retain the current Railway JWT_SECRET so existing tokens remain valid. Use the
existing Neon DATABASE_URL including its SSL options, and existing Cloudinary and
Resend credentials. No production values belong in tracked files or Docker builds.

Add each required Worker secret interactively:

```powershell
npx wrangler login
npx wrangler secret put DATABASE_URL
npx wrangler secret put JWT_SECRET
npx wrangler secret put CORS_ORIGIN
npx wrangler secret put CLIENT_URL
npx wrangler secret put CLOUDINARY_CLOUD_NAME
npx wrangler secret put CLOUDINARY_API_KEY
npx wrangler secret put CLOUDINARY_API_SECRET
npx wrangler secret put RESEND_API_KEY
```

Wrangler may offer to create the named Worker when setting the first secret on a
new deployment. These are manual remote operations. Required missing values return
503 rather than starting the API with incomplete settings. Resend is required here
because the existing email service constructs its client at module load.

Optional existing settings can also be added with `npx wrangler secret put NAME`:
JWT_EXPIRES_IN, EMAIL_FROM, EMAIL_FROM_NAME. NODE_ENV=production is configured in
wrangler.jsonc; PORT=3001 is fixed in the container router and image.

CLIENT_URL must be one canonical frontend URL because email links use it.
CORS_ORIGIN accepts comma-separated origins: list the current production frontend,
future Cloudflare frontend when known, and localhost origins if production should
allow local development. Existing development mode allows localhost by default.
Do not configure `*`; both Express and Socket.IO retain their existing CORS logic.

After adding secrets and completing local checks, deploy manually:

```powershell
npx wrangler deploy
npx wrangler containers list
```

Allow time for first container provisioning. Test the returned workers.dev URL
before any frontend URL or DNS cutover. Keep Railway available for rollback.

## Upload and proxy audit

POST /api/uploads/image uses memory storage and streams to Cloudinary, returning
secure_url/public_id. Menu writes persist the supplied imageUrl. No active route
imports src/middleware/upload.ts, the old disk-storage middleware.

The existing /uploads static route is retained for compatibility because production
database URLs and Railway disk contents were not inspected. The image deliberately
does not copy local uploads. Before cutover, audit existing MenuItem.imageUrl values
for Railway/local /uploads URLs. If any exist, copy their original assets to
Cloudinary and update the affected records in a separately reviewed data operation.
Do not remove Railway until those assets are accounted for. There are no active
disk-writing upload routes to convert. Container disk is never permanent storage.

Express retains trust proxy = 1. The public Worker discards caller-supplied
X-Forwarded-For/Forwarded and supplies the Cloudflare edge CF-Connecting-IP as the
single trusted client hop. It derives X-Forwarded-Proto from the request URL.
The Node port must remain reachable only through this router in production. Test
req.ip in deployment logs, including a request with forged forwarding headers.

## Manual acceptance checklist

- GET /health returns {"ok":true,"service":"smart-qr-api"}.
- Allowed current/local/future frontend origins receive matching CORS headers;
  an unlisted origin receives no Access-Control-Allow-Origin. Check preflight too.
- Log in with a test account; verify existing JWTs and password reset emails.
- Exercise menu, vendor, analytics, QR ordering and customer tracking flows.
- Connect the existing Socket.IO client to the new URL in a temporary test harness:
  test polling, WebSocket upgrade (101), vendor/customer rooms and order broadcasts
  between two clients. Drop the network and verify reconnection and room rejoin.
- Upload a test image; confirm its URL is HTTPS Cloudinary and remains usable after
  a container restart. Confirm older menu images do not depend on Railway disk.
- Verify real client IP and resistance to forged X-Forwarded-For in API logs.
- Confirm Neon reads/writes on test data, and recovery after container restart.

## Validation performed / outstanding

API/shared build, Worker type-check, all 21 existing tests and the database-free
HTTP/Socket.IO smoke checks passed. Wrangler's Worker-only dry run also passed
using Node 22 with `--dry-run --containers-rollout=none`; the full dry run was
blocked by missing Docker. The host has Node 20.11; current Wrangler needs
Node >=22. Docker was unavailable, so image build, Worker-to-container upgrades,
deployed IP forwarding, production credentials, legacy images and authenticated
business flows require the checks above. No database schema/data changes or
deployment were performed. Frontend and Railway files are unchanged.

References: [Containers setup](https://developers.cloudflare.com/containers/get-started/),
[WebSocket forwarding](https://developers.cloudflare.com/containers/examples/websocket/),
[environment variables and secrets](https://developers.cloudflare.com/containers/examples/env-vars-and-secrets/).
