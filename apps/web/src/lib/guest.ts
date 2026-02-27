const GUEST_ID_KEY = 'makanx_guestId';

export function getOrCreateGuestId(): string {
  const existing = localStorage.getItem(GUEST_ID_KEY);
  if (existing) {
    return existing;
  }
  const guestId = crypto.randomUUID();
  localStorage.setItem(GUEST_ID_KEY, guestId);
  return guestId;
}