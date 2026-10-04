# Security batch 3

## Money precision

Order pricing now uses `Prisma.Decimal` for base price, option additions, quantity multiplication, and final order totals. Analytics summary, product performance, hourly revenue, averages, and completed-order totals also remain Decimal until the JSON response boundary. Shared helpers live in `apps/api/src/utils/money.ts`. Database Decimal columns and stored price values are unchanged.

Tests cover exact `0.10 + 0.20`, several prices multiplied by quantities, and analytics totals/averages/trends.

## Authentication logging

Login probing logs, password-validity logs, reset email addresses, provider details, and email message IDs were removed. Login failures always return `Invalid email or password`, including inactive, unknown, and wrong-password cases. Remaining authentication logs are generic high-level failures and contain no email, password, hash, token, JWT payload, or secret.

## Public menu DTO

The duplicate ID/slug implementations now call one private `buildPublicMenu` helper. Its public response contains:

- vendor `id` (required by the existing ID-based order route), `slug`, `businessName`, and `description`;
- active event public name/date only;
- public ordering state: `showPrices`, `orderingOpen`, `orderingStatus`, `orderingClosedReason`, and a nullable `maxDrinksPerOrder` when the customer limit applies;
- available menu item `id`, name, description, optional public price, image URL, sanitized option groups, and remarks setting.

It does not return full VendorSettings, event IDs, vendor category/contact data, daily-limit configuration, report recipients, device-limit flags, timestamps, display order, or menu vendor IDs. Prices and option additions are omitted when `showPrices` is false. Daily-limit fields are selected internally only to preserve server enforcement and are never copied into the response.

## Vendor HttpOnly cookie

Successful login sets `smart_qr_vendor_session` and returns only the user DTO. Cookie attributes are:

- `HttpOnly=true`
- `Secure=true` when `NODE_ENV=production`
- `SameSite=Lax`
- `Path=/`
- expiry derived from the signed JWT, so it matches `JWT_EXPIRES_IN`
- host-only (no Domain attribute), which sends it only to the API host

This matches the documented `hourcoffee.com.my` / `api.hourcoffee.com.my` same-site deployment. Axios and Socket.IO already use credentials. Vendor HTTP and Socket authentication now use the cookie; Vendor Bearer JWT authentication was removed. The production frontend has no Vendor token localStorage read, write, or delete code. Existing localStorage Vendor JWTs are inert because Vendor endpoints and sockets no longer accept them.

`POST /api/auth/logout` clears the cookie with matching attributes. AuthContext clears in-memory state and redirects. Phase 2's centralized 401 handling remains, using a session generation to ignore stale responses and deduplicate redirects; 403 and Guest API failures do not log out the Vendor. Guest access tokens remain in their dedicated localStorage credential and Bearer flow unchanged.

Credentialed CORS rejects wildcard configuration at startup and grants CORS headers only to explicit `CLIENT_URL` / `CORS_ORIGIN` origins.

## Cleanup

- Consolidated duplicate public-menu queries and transformations.
- Removed the unused `getOrCreateGuestId` browser helper.
- Removed obsolete Vendor Authorization-header injection and localStorage token lifecycle code.
- Removed sensitive authentication/email debug logging.
- Retained all Guest auth, Socket room authorization, Cloudinary validation, event, cup-limit, numbering, ready-order, sales, and Excel behavior.

## Validation

- `npm run build:api`: passed.
- `npm run build:web`: passed. Existing nonfatal Browserslist age and bundle-size warnings remain.
- `npx vitest run`: 106 tests passed across 17 files.
- Tests cover Decimal totals, analytics totals, minimized public menu output, hidden prices, cookie flags in development/production, cookie-authenticated API access, no-cookie and Guest rejection, logout, generic login errors/log output, explicit credentialed CORS, Vendor cookie sockets, Guest Bearer sockets, and all Phase 1/2 regressions.

No database migration is required. No new Railway environment variable or secret change is required. The existing production `NODE_ENV=production`, explicit `CLIENT_URL` / `CORS_ORIGIN`, and `JWT_SECRET` values must remain configured; the JWT secret must not be rotated for this deployment.

After deployment, manually verify login cookie attributes in browser DevTools; refresh each Vendor page; save menu/settings changes; exercise Live/Ready actions; log out; wait for or simulate expiry; open the customer QR menu with prices both shown and hidden; place and track a Guest order; and confirm Socket updates for one Vendor and one Guest without cross-account delivery.
