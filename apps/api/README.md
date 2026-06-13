# Smart QR Ordering System API

The API supports vendor authentication, store settings, menu management, direct customer ordering, live orders, tracking, and vendor sales analytics.

There are no organizer, event, booth, invite-token, Google Form, or Apps Script routes.

For a fresh local database:

```powershell
$env:DATABASE_URL='postgresql://postgres:postgres@localhost:5432/smart_qr_ordering'
npx prisma migrate dev
npm run db:seed
```

Confirm the database is local and disposable before running the migration.
