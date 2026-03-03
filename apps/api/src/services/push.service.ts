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

  const title = 'MakanX Order Ready';
  const displayNumber = order.id.slice(-4).toUpperCase();
  const body = `Order #${displayNumber} is READY. Please collect your food.`;
  const url = `/customer/orders?orderId=${order.id}`;

  const payload = JSON.stringify({ title, body, url });

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
