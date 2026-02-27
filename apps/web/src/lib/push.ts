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

export const subscribeToPush = async (customerId: string) => {
  if (typeof window === "undefined") return;
  if (!("Notification" in window)) return;
  if (!("serviceWorker" in navigator)) return;
  if (!("PushManager" in window)) return;

  const existing = localStorage.getItem("mx_notif_asked");
  if (existing === "1") return;

  localStorage.setItem("mx_notif_asked", "1");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return;

  const registration = await registerServiceWorker();
  if (!registration) return;

  const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!publicKey) return;

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64ToUint8Array(publicKey),
  });

  try {
    const { api } = await import("./api");
    await api.post("/push/subscribe", {
      customerId,
      subscription,
    });
  } catch (e) {
    console.error("Push subscribe error", e);
  }
};
