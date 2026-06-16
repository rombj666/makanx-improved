# Smart QR Ordering System API Routes

- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/public/vendors/:slug`
- `GET /api/public/vendors/:slug/menu`
- `POST /api/public/vendors/:slug/orders`
- `GET /api/menu-items/public/:vendorId`
- `GET|POST|PUT|DELETE /api/menu-items`
- `POST /api/orders`
- `GET /api/orders/:orderId`
- `GET /api/orders/vendor-live`
- `POST /api/orders/:orderId/items/:itemId/mark-ready`
- `GET|PATCH /api/vendor/settings`
- `GET|PATCH /api/vendor/order-limit-settings`
- `GET /api/vendor/daily-usage`
- `POST /api/vendor/toggle-ordering`
- `POST /api/vendor/sales/reset-today`
- `GET /api/analytics/vendor/*`
