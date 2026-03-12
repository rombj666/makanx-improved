import webpush from 'web-push';
import prisma from '../utils/prisma';

const publicKey = process.env.VAPID_PUBLIC_KEY || '';
const privateKey = process.env.VAPID_PRIVATE_KEY || '';
const subject = process.env.VAPID_SUBJECT || '';

console.log(
  "VAPID PUBLIC KEY (first 20):",
  process.env.VAPID_PUBLIC_KEY?.slice(0, 20)
);

if (publicKey && privateKey && subject) {
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

export const saveSubscription = async (
  customerId: string,
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }
) => {
  if (!customerId) {
    throw new Error('customerId required');
  }
  const endpoint = subscription.endpoint;
  const p256dh = subscription.keys.p256dh;
  const auth = subscription.keys.auth;

  const existing = await prisma.pushSubscription.findUnique({
    where: { endpoint },
  });

  if (existing) {
    return prisma.pushSubscription.update({
      where: { endpoint },
      data: {
        customerId,
        p256dh,
        auth,
      },
    });
  }

  return prisma.pushSubscription.create({
    data: {
      customerId,
      endpoint,
      p256dh,
      auth,
    },
  });
};

export const sendReadyNotification = async (order: {
  id: string;
  customerId: string;
  vendorId: string;
  vendor?: { businessName?: string | null } | null;
}) => {
  if (!publicKey || !privateKey || !subject) {
    return;
  }

  const subs = await prisma.pushSubscription.findMany({
    where: { customerId: order.customerId },
  });

  if (!subs.length) return;
  console.log("Found subscriptions:", subs.length);

  const displayNumber = order.id.slice(-4).toUpperCase();
  const vendorName = order.vendor?.businessName || 'Booth';

  const booth = await prisma.booth.findFirst({
    where: { vendorId: order.vendorId },
    select: {
      name: true,
      event: { select: { slug: true } },
    },
  });

  const boothName = booth?.name || vendorName;
  const eventSlug = booth?.event?.slug || '';
  const url = eventSlug ? `/customer/event/${eventSlug}` : '/';

  const payload = JSON.stringify({
    title: "Order Ready 🍽️",
    body: `Booth ${boothName} – Order #${displayNumber} is ready for pickup!`,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: `order-${displayNumber}`,
    url,
  });

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          } as any,
          payload
        );
        console.log('Push sent');
      } catch (err: any) {
        console.error('Push error:', err);
        const statusCode = err?.statusCode || err?.statusCode === 0 ? err.statusCode : undefined;
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription.delete({
            where: { endpoint: sub.endpoint },
          });
        }
      }
    })
  );
};
