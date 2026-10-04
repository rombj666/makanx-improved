# Security batch 2

> Phase 3 supersedes the Vendor browser credential details below: Vendor web HTTP and Socket authentication now use an HttpOnly cookie. Guest Bearer authentication is unchanged. See `SECURITY_BATCH_3.md`.

## Socket authorization

The handshake requires auth.token and reuses batch 1 vendor/guest verification without changing JWT configuration or guest issuance. The server resolves vendor userId to VendorProfile.id, or uses the verified guestId, and joins only the corresponding vendor/user room. Caller-supplied guestId, userId and room names do not grant access. The join and join_vendor handlers are removed; the browser no longer sends room requests.

Invalid/expired credentials and missing vendor profiles reject the connection with SOCKET_AUTH_ERROR. Established connections have an expiry timer and disconnect with auth_error at expiry; long-lived guest tokens are scheduled within Node's timer limit. Reconnection verifies credentials again. The browser reads current credentials on each handshake, uses guest credentials on customer pages even when a vendor login exists, and routes vendor socket authentication failures through the shared session-expiry handler.

All production broadcasts were audited: order_created targets the owning vendor; order_updated targets that vendor plus the verified guest's room. Guest updates reuse the existing customerOrderView allowlist. No global order broadcasts remain or were added. Event/order workflow logic is unchanged.

## Cloudinary-only uploads

The unused middleware/upload.ts diskStorage implementation was deleted after verifying that no route imported it. Express no longer serves /uploads. The unused frontend local-upload URL helper was removed. Existing local files are not deleted or migrated, but are no longer publicly served.

/api/uploads/image continues to require vendor authentication and uses memoryStorage. It accepts only matching JPEG/PNG/WebP filename extensions and MIME types, checks the binary signature, caps the file at 10 MB and rejects multiple files. SVG, HTML and disguised HTML/SVG are rejected. Upload destination types are limited to the existing generic/vendorLogo/menuItem values.

Cloudinary receives an image stream with allowed_formats restricted to raster formats and format=webp, ensuring it decodes/re-encodes the accepted image rather than delivering original active content. Signature checks are preliminary; malformed raster data must also pass Cloudinary decoding. Cloudinary configuration and credentials are unchanged.

## Vendor session expiry

api.ts centrally handles 401 only for vendor endpoints. vendorSession.ts removes the vendor token, emits a single expiry event to clear AuthContext, and replaces vendor/admin routes with /login?reason=session-expired. The navigation clears page-local vendor caches; there are no persisted vendor data caches beyond the token. Guest credentials, carts, order locks and preferences are preserved. SocketProvider disconnects when the session changes.

Login displays "Your session has expired. Please log in again." The login page itself never redirects in response to 401. Failed login requests do not trigger the session-expiry handler. 403 does not log out. Public requests no longer carry the vendor token; batch 1's separate guest API client is unchanged. A background vendor auth check on a customer page may clear an expired vendor session but cannot redirect the customer. Parallel 401 responses are deduplicated and responses from old sessions cannot clear a newer login.

## Files changed in this batch

- apps/api/src/socket.ts
- apps/api/src/services/order.service.ts (guest socket payload only)
- apps/api/src/index.ts (remove static uploads)
- apps/api/src/middleware/upload.ts (deleted)
- apps/api/src/middleware/uploadCloudinary.ts
- apps/api/src/routes/upload.routes.ts
- apps/api/src/utils/cloudinary.ts
- apps/web/src/App.tsx
- apps/web/src/context/AuthContext.tsx
- apps/web/src/context/SocketContext.tsx
- apps/web/src/lib/api.ts
- apps/web/src/lib/vendorSession.ts
- apps/web/src/pages/auth/Login.tsx
- apps/api/src/tests/socket-auth.test.ts
- apps/api/src/tests/upload-security.test.ts
- apps/api/src/tests/order-ready.test.ts (guest payload assertion only)
- apps/web/src/context/SocketContext.test.tsx
- apps/web/src/lib/vendorSession.test.tsx
- apps/web/package.json and package-lock.json (React test renderer and types, development only)
- SECURITY_BATCH_2.md

## Validation

- npm run build:api: passed.
- npm run build:web: passed; existing nonfatal Browserslist age and bundle-size warnings remain.
- npx vitest run: 93 tests passed across 12 files, including batch 1 regressions.
- Socket tests use real local HTTP/Socket.IO server and client connections, with vendor database lookups mocked. They cover room isolation, invalid/expired tokens, caller-selected room attacks and disconnect/reconnect at expiry.
- Upload tests exercise multipart HTTP requests and the real memory middleware/Cloudinary stream helper, with the remote Cloudinary uploader mocked. They cover accepted raster images, spoofed filename/content, SVG, oversize uploads, authorization, and disabled static access even when a local file exists.
- React renderer tests mount AuthContext/Login and SocketProvider; Axios adapters and transport are mocked. They cover state clearing, concurrent 401, 403, customer isolation, login notice/loop prevention, stale session failures and socket credential refresh.

No production deployment, database migration, Railway environment change, secret rotation, or real Cloudinary upload was performed. No event, cup limit, numbering, preparation/ready, sales, or customer ordering business logic was changed.
