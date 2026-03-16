# MakanX API

## Setup

1.  Copy `.env.example` to `.env` and fill in your `DATABASE_URL` (Neon PostgreSQL) and secrets.
2.  Install dependencies: `npm install` (from root).
3.  Sync database schema:
    ```bash
    npx prisma db push
    ```
4.  Seed the database:
    ```bash
    npx prisma db seed
    ```
5.  Start the server:
    ```bash
    npm run dev
    ```

## Testing

Run unit/integration tests (requires database connection):

```bash
npm test
```

## Features Implemented

-   **Auth**: Register, Login, JWT, RBAC (Middleware).
-   **Events**: CRUD (Organizer), Public Read (by slug).
-   **Booths**: Linked to events (Organizer).
-   **Applications**: Webhook integration, Organizer approval/rejection.
-   **Invites**: Generated on application approval.

## Vendor Application Event Matching

Vendor applications are matched to events by Event.name.

- The organizer-created Event.name in the database
- The event name displayed in the organizer UI
- The Google Form “Select Event” option text

must use the same text. Matching ignores case and trims/collapses extra spaces.
