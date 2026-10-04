import axios from 'axios';
import { api } from './api';

const GUEST_ID_KEY = 'smart_qr_guest_id';

const CREDENTIAL_KEY = 'smart_qr_guest_credential';
// Dedicated client keeps customer credentials separate from the vendor interceptors.
export const guestApi = axios.create({ baseURL: api.defaults.baseURL, withCredentials: true });
let pendingCredential: Promise<string> | undefined;

export function ensureGuestToken(): Promise<string> {
  if (pendingCredential) return pendingCredential;
  pendingCredential = (async () => {
    const saved = localStorage.getItem(CREDENTIAL_KEY);
    let credential: { guestId: string; guestAccessToken: string; renewedAt: number } | undefined;
    try { credential = saved ? JSON.parse(saved) : undefined; } catch { /* Preserve legacy ID separately. */ }
    if (credential?.guestAccessToken && Date.now() - credential.renewedAt < 24 * 60 * 60 * 1000) {
      return credential.guestAccessToken;
    }
    // A valid token renews the same identity. Invalid/expired tokens are not silently replaced.
    const { data } = await axios.post(`${api.defaults.baseURL}/auth/guest`, {}, {
      withCredentials: true,
      headers: credential?.guestAccessToken ? { Authorization: `Bearer ${credential.guestAccessToken}` } : {},
    });
    const legacyId = localStorage.getItem(GUEST_ID_KEY);
    if (legacyId && legacyId !== data.data.guestId && !localStorage.getItem('smart_qr_legacy_guest_id')) {
      localStorage.setItem('smart_qr_legacy_guest_id', legacyId);
    }
    localStorage.setItem(CREDENTIAL_KEY, JSON.stringify({ ...data.data, renewedAt: Date.now() }));
    localStorage.setItem(GUEST_ID_KEY, data.data.guestId);
    return data.data.guestAccessToken;
  })().finally(() => { pendingCredential = undefined; });
  return pendingCredential;
}

guestApi.interceptors.request.use(async (config) => {
  config.headers.Authorization = `Bearer ${await ensureGuestToken()}`;
  return config;
});

export async function getMyOrders() {
  const { data } = await guestApi.get('/orders/my-orders');
  return data.data;
}
