# Smart QR Ordering System

A simplified vendor and customer QR ordering application.

## Applications

- `apps/web`: React + TypeScript vendor UI and public customer ordering UI
- `apps/api`: Express + TypeScript API with Prisma/PostgreSQL

## Main Routes

- `/login`
- `/vendor`
- `/vendor/menu`
- `/vendor/live-orders`
- `/vendor/sales`
- `/vendor/settings`
- `/order/:vendorId`
- `/track/:orderId`

## Local Setup

1. Point `DATABASE_URL` to a disposable local PostgreSQL database.
2. Run `npm install`.
3. Run `npx prisma migrate dev` from `apps/api`.
4. Run `npm run db:seed -w apps/api`.
5. Start the API and web applications.

Seed login: `vendor@test.com` / `password`.

The new baseline migration is destructive and must not be applied to production without a reviewed data-migration plan and backup.
