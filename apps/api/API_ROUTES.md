# MakanX API Routes

## Authentication
- `POST /auth/register` - `{ email, password, name, role }` -> `{ token, user }`
- `POST /auth/login` - `{ email, password }` -> `{ token, user }`
- `GET /auth/me` - (Auth Header) -> `{ user }`

## Webhooks
- `POST /webhooks/vendor-application` - Receives Google Form payload.

## Events
- `GET /events` - List active events.
- `POST /events` - (Organizer) Create event.

## Booths
- `GET /events/:eventId/booths` - Get booth map/status.

## Vendors
- `GET /vendors/:id/menu` - Public menu.
- `GET /vendor/applications` - (Organizer) List pending apps.
- `POST /vendor/applications/:id/approve` - (Organizer) Approve app.

## Orders
- `POST /orders` - (Customer) Create order.
- `GET /orders` - List own orders.
- `PATCH /orders/:id/status` - (Vendor) Update status.
