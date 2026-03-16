## Web Push Verification Checklist (MakanX)

### 1) Permission / subscription
- Place an order (guest flow) and land on `/customer/order-confirmed`
- Tap “Enable Notifications”
- Browser prompts for notification permission (only on tap)
- Service worker is registered and controlling the page
- Push subscription is created (check in browser Application → Service Workers / Push)
- Subscription is saved to backend successfully (`POST /api/push/subscribe`)

### 2) Trigger
- Vendor marks an order READY (status transition PREPARING → READY)
- Backend logs show push attempt and success/failure per subscription
- Correct customer subscription is targeted (by guestId/customerId on the order)
- No duplicate push when READY is saved again for the same order

### 3) Notification behavior
- Android Chrome: notification appears in system notification tray
- Desktop Chrome: notification appears as a system/browser notification
- Title/body look correct (MakanX + order ready message)
- Notification is not an in-page toast (must be OS/browser notification UI)

### 4) Click behavior
- Tap notification → opens/focuses the site
- Navigates to the correct order page:
  - `/customer/order-confirmed?orderId=...` (and `eventSlug` when present)
- If a tab already exists, it focuses it and navigates instead of opening many duplicates

### 5) Platform reality checks
- Test Android Chrome
- Test desktop Chrome
- iPhone/Safari limitations: Web Push support is limited; requires recent iOS and (often) PWA installation. Confirm expected behavior and do not assume parity with Chrome.

### 6) Failure cases
- Denied permission handled safely
- Invalid/expired subscription handled safely
- Old subscriptions do not crash backend
- Wrong customer never receives another user's notification
- Stale subscriptions are removed on 404/410 responses from push provider

### 7) Final pass criteria
- Works while site is open (foreground)
- Works while site is backgrounded where supported
- Appears in notification tray where supported
- Tap opens the correct order view reliably
