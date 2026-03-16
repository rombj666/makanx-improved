export const registerServiceWorker = async () => {
  if (typeof window === "undefined") return null;
  if (!("serviceWorker" in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.register("/sw.js");
    return registration;
  } catch {
    return null;
  }
};

function base64ToUint8Array(base64: string) {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export type PushEnableResult =
  | { status: "enabled" }
  | { status: "blocked" }
  | { status: "not_supported" }
  | { status: "dismissed" }
  | { status: "error"; error: string };

function isPushSupported() {
  if (typeof window === "undefined") return false;
  if (!("Notification" in window)) return false;
  if (!("serviceWorker" in navigator)) return false;
  if (!("PushManager" in window)) return false;
  return true;
}

export async function getExistingPushSubscription() {
  if (!isPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const ready = reg ?? (await navigator.serviceWorker.ready);
    const sub = await ready.pushManager.getSubscription();
    return sub;
  } catch {
    return null;
  }
}

export const subscribeToPush = async (customerId: string): Promise<PushEnableResult> => {
  if (!isPushSupported()) return { status: "not_supported" };

  if (Notification.permission === "denied") {
    return { status: "blocked" };
  }

  if (Notification.permission !== "granted") {
    const permission = await Notification.requestPermission();
    if (permission === "denied") return { status: "blocked" };
    if (permission !== "granted") return { status: "dismissed" };
  }

  const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!publicKey) return { status: "error", error: "Missing VAPID public key" };

  const registration = (await navigator.serviceWorker.getRegistration()) ?? (await registerServiceWorker());
  const ready = registration ?? (await navigator.serviceWorker.ready);

  let subscription = await ready.pushManager.getSubscription();
  if (!subscription) {
    subscription = await ready.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64ToUint8Array(publicKey),
    });
  }

  const subJson = subscription.toJSON() as any;
  if (!subJson?.endpoint || !subJson?.keys?.p256dh || !subJson?.keys?.auth) {
    return { status: "error", error: "Invalid subscription object" };
  }

  try {
    const { api } = await import("./api");
    await api.post("/push/subscribe", {
      customerId,
      subscription: { endpoint: subJson.endpoint, keys: subJson.keys },
    });
    return { status: "enabled" };
  } catch (e: any) {
    return { status: "error", error: e?.message || "Failed to save subscription" };
  }
};
