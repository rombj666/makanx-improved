# Security batch 1

JWT_SECRET is mandatory (including at startup); environment loading precedes route imports. Both example environment files contain an empty JWT_SECRET. Existing vendor claims and JWT_EXPIRES_IN are unchanged. No Railway secret or database changes are required.

GET /api/orders/:id was used by the customer tracking page; vendor screens currently use vendor list endpoints. It now verifies a vendor or guest bearer token before lookup. Vendor ownership maps token userId to VendorProfile.id and compares Order.vendorId. Guest ownership compares the verified token guestId to Order.customerId. Missing credentials return 401, foreign orders 403, and nonexistent orders 404. The latter two share a generic body; their status codes remain distinguishable as required.

POST /api/auth/guest creates a server-generated, namespaced identity, never adopting a submitted guestId or device cookie. A valid guest bearer token renews the same identity. Guest tokens use the existing JWT_SECRET, HS256, tokenType=guest, audience=guest-orders, and a 365-day expiry. Vendor verification rejects guest tokens, and guest verification rejects vendor tokens. The browser renews after a day on use. Expired or invalid credentials return 401 and are not silently exchanged for another identity.

Both order creation routes now require guest authentication and override submitted guestId with the verified identity. History ignores query guestId. Customer creation, history and detail responses use an explicit allowlist that omits contact PII, customer/device/vendor internal IDs and internal menu configuration. Order id remains for tracking links. Vendor detail responses retain their existing shape after authorization.

## Legacy transition

Old localStorage UUIDs and unsigned device cookies do not prove ownership. The browser archives the old UUID as smart_qr_legacy_guest_id and stores the new guest credential separately. No orders are deleted, reassigned, or migrated. Existing orders remain visible to their owning vendor. Legacy customer tracking shows an explicit instruction to contact the store for ownership verification; automatic access to legacy history cannot safely be retained using the available credentials. No recovery or reassignment endpoint was added. Lost/expired guest credentials likewise require store assistance for old orders.

## Scope and validation

Socket.IO, device/cup limits, event numbering, production workflows, uploads, reports and vendor redirect behavior were not modified. Customer HTTP uses a separate Axios client so vendor credentials/interceptors cannot replace the guest bearer token.

Run npm run build:api, npm run build:web, and npx vitest run. Security tests exercise token separation, forgery/tampering/expiry, ownership, sanitized errors/responses, query identity substitution, both creation routes, legacy issuance and browser credential persistence. Database calls are mocked for these tests; production data is never touched.

## Changed files

- `.env.example`, `apps/api/.env.example`
- `apps/api/src/index.ts`, `apps/api/src/utils/jwt.ts`, `apps/api/src/middleware/auth.ts`
- `apps/api/src/routes/auth.routes.ts`, `apps/api/src/routes/order.routes.ts`, `apps/api/src/routes/public.routes.ts`
- `apps/api/src/controllers/order.controller.ts`, `apps/api/src/controllers/public.controller.ts`, `apps/api/src/services/order.service.ts`
- `apps/web/src/lib/guest.ts`, `apps/web/src/pages/customer/CustomerOrderPage.tsx`, `apps/web/src/pages/customer/TrackOrderPage.tsx`
- `apps/api/src/tests/test-env.ts`, `apps/api/src/tests/jwt-startup.test.ts`, `apps/api/src/tests/order-auth.test.ts`, `apps/web/src/lib/guest.test.ts`
- `apps/api/vitest.config.ts`, `vitest.config.ts`, `SECURITY_BATCH_1.md`

Verified: API production build passed; Web production build passed; all 60 tests across 8 files passed. A separate subprocess running the compiled production entrypoint without JWT_SECRET and without dotenv input exited with the expected required-variable error before listening. Web build reports non-fatal Browserslist age and bundle-size warnings. No production deployment or real-database/browser end-to-end test was performed.
