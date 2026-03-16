import webpush from 'web-push';
import prisma from '../utils/prisma';

const publicKey = process.env.VAPID_PUBLIC_KEY || '';
const privateKey = process.env.VAPID_PRIVATE_KEY || '';
const subject = process.env.VAPID_EMAIL || process.env.VAPID_SUBJECT || '';

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
    select: { id: true, customerId: true },
  });

  const result = await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { customerId, p256dh, auth },
    create: { customerId, endpoint, p256dh, auth },
  });

  console.log('[push] subscription upsert', {
    action: existing ? 'updated' : 'created',
    customerId,
    reassigned: existing ? existing.customerId !== customerId : false,
    endpointPrefix: endpoint.slice(0, 32),
  });

  return result;
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
  console.log('[push] ready: subscriptions found', { orderId: order.id, count: subs.length });

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
  const url = `/customer/order-confirmed?orderId=${encodeURIComponent(order.id)}${
    eventSlug ? `&eventSlug=${encodeURIComponent(eventSlug)}` : ''
  }`;

  const payload = JSON.stringify({
    title: 'MakanX',
    body: `Your order #${displayNumber} is ready for pickup at Booth ${boothName}.`,
    icon: "/images/event-map.jpg",
    badge: "/images/event-map.jpg",
    tag: `order-${order.id}`,
    orderId: order.id,
    displayNumber,
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
        console.log('[push] ready: sent', { orderId: order.id, endpointPrefix: sub.endpoint.slice(0, 32) });
      } catch (err: any) {
        console.error('[push] ready: error', { orderId: order.id, message: err?.message || err });
        const statusCode = err?.statusCode || err?.statusCode === 0 ? err.statusCode : undefined;
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription.delete({
            where: { endpoint: sub.endpoint },
          });
          console.log('[push] subscription deleted (stale)', { endpointPrefix: sub.endpoint.slice(0, 32) });
        }
      }
    })
  );
};
