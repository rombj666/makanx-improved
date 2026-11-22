# Smart QR Ordering System API

The API supports vendor authentication, store settings, menu management, direct customer ordering, live orders, tracking, and vendor sales analytics.

For a fresh local database:

```powershell
$env:DATABASE_URL='postgresql://postgres:postgres@localhost:5432/smart_qr_ordering'
npx prisma migrate dev
npm run db:seed
```

Confirm the database is local and disposable before running the migration.
# Vendor staff account provisioning

Username login uses the existing `User.email` unique column as the normalized username; email-shaped usernames remain valid. `VendorPermission` is separate from the existing vendor/customer authentication role. The additive `20261122020000_vendor_staff_permissions` migration assigns existing accounts `ADMIN` by default and adds an optional staff-to-Vendor link. It does not alter Vendor IDs, owner passwords, or business data.

Apply the migration only after deploying a backend build that contains this schema and authorization code:

```powershell
npx prisma migrate deploy
```

Provisioning is a separate, idempotent operation. Run it only after confirming the deployed backend release and the database target. Use a protected `DATABASE_URL`; the script prints only the database host, Vendor name, and Vendor ID. It locates the Vendor through the existing `rombj45@gmail.com` Admin account, verifies the Vendor is Hour Coffee, checks that the permission migration is applied, and refuses username collisions or incompatible existing accounts. It never updates the Admin password or an existing Barista password.

```powershell
$env:PROVISIONING_TARGET = 'isolated'
# Set DATABASE_URL and BARISTA_INITIAL_PASSWORD from your protected secret source,
# or omit BARISTA_INITIAL_PASSWORD to use the hidden interactive prompt.
node scripts/provision-hour-coffee-barista.cjs
Remove-Item Env:BARISTA_INITIAL_PASSWORD -ErrorAction SilentlyContinue
Remove-Item Env:DATABASE_URL
```

When `BARISTA_INITIAL_PASSWORD` is absent, the script requests it without echoing input in an interactive terminal. For production, set `PROVISIONING_TARGET=production` and `PRODUCTION_PROVISIONING_APPROVED=Hour Coffee` only after the deployed release, migration, exact database, and Vendor have been confirmed and production write approval has been given, then run `node scripts/provision-hour-coffee-barista.cjs`. Keep the initial password in a protected environment variable or enter it at the hidden prompt. Never place it in command history, source control, or the Neon console.
