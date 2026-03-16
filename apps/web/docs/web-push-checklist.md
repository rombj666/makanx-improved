## Web Push Verification Checklist (MakanX)

### 1) Permission / subscription
- Browser prompts for notification permission
- User can allow permission
- Service worker registers successfully
- Push subscription is created in browser
- Subscription is saved to backend successfully

### 2) Trigger
- Vendor marks an order READY
- Backend sends a push message
- Correct customer subscription is targeted
- No duplicate push for the same order/event action

### 3) Notification behavior
- Android: notification appears in system notification tray (Chrome)
- Desktop: notification appears (Chrome)
- Title/body are correct
- Notification clearly indicates MakanX and order status

### 4) Click behavior
- Tapping notification opens the site
- Tapping notification opens the correct order view
- If a tab already exists, it focuses the existing tab when possible

### 5) Platform reality checks
- Test Android Chrome
- Test desktop Chrome
- iPhone/Safari limitations: verify expected behavior and document any constraints

### 6) Failure cases
- Denied permission handled safely
- Invalid/expired subscription handled safely
- Old subscriptions do not crash backend
- Wrong customer never receives another user's notification

### 7) Final pass criteria
- Works while site is open (foreground)
- Works while site is backgrounded where supported
- Appears in notification tray where supported
- Tap opens the correct order view reliably

