export const registerServiceWorker = async () => {
  if (typeof window === "undefined") return null;
  if (!("serviceWorker" in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.register("/sw.js");
    return registration;
  } catch (e) {
    if (import.meta.env.DEV) console.log("[push] service worker register failed", e);
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

function pushDebug(label: string, data?: any) {
  if (!import.meta.env.DEV) return;
  if (data === undefined) console.log(`[push] ${label}`);
  else console.log(`[push] ${label}`, data);
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
  pushDebug("enable start", {
    supported: isPushSupported(),
    permission: typeof window !== "undefined" ? (Notification as any)?.permission : "n/a",
    customerIdPresent: !!customerId,
  });
  if (!isPushSupported()) return { status: "not_supported" };

  if (Notification.permission === "denied") {
    return { status: "blocked" };
  }

  try {
    if (Notification.permission !== "granted") {
      const permission = await Notification.requestPermission();
      pushDebug("permission result", { permission });
      if (permission === "denied") return { status: "blocked" };
      if (permission !== "granted") return { status: "dismissed" };
    }
  } catch (e: any) {
    pushDebug("permission request failed", { message: e?.message || String(e) });
    return { status: "error", error: "Notification permission request failed" };
  }

  const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!publicKey) return { status: "error", error: "Missing VAPID public key (VITE_VAPID_PUBLIC_KEY)" };
  pushDebug("vapid key present", { present: true, length: String(publicKey).length });

  let ready: ServiceWorkerRegistration;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const registration = reg ?? (await registerServiceWorker());
    if (!registration) {
      return { status: "error", error: "Service worker registration failed" };
    }
    ready = registration ?? (await navigator.serviceWorker.ready);
    pushDebug("service worker ready", { scope: ready.scope });
  } catch (e: any) {
    pushDebug("service worker init failed", { message: e?.message || String(e) });
    return { status: "error", error: "Service worker registration failed" };
  }

  let subscription: PushSubscription | null = null;
  try {
    subscription = await ready.pushManager.getSubscription();
    pushDebug("existing subscription", { present: !!subscription });
    if (!subscription) {
      subscription = await ready.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToUint8Array(publicKey),
      });
      pushDebug("push subscribed", { present: !!subscription });
    }
  } catch (e: any) {
    pushDebug("push subscribe failed", { message: e?.message || String(e) });
    return { status: "error", error: "Push subscription failed" };
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
    pushDebug("backend subscribe ok");
    return { status: "enabled" };
  } catch (e: any) {
    const status = e?.response?.status;
    const backendError = e?.response?.data?.error;
    pushDebug("backend subscribe failed", {
      status,
      error: backendError || e?.message || String(e),
    });
    return {
      status: "error",
      error: backendError
        ? `Unable to save notification subscription: ${backendError}`
        : status
          ? `Unable to save notification subscription (HTTP ${status})`
          : "Unable to save notification subscription",
    };
  }
};
