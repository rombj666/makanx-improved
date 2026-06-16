/* eslint-disable no-console */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (arg.startsWith('--')) {
    const next = process.argv[i + 1];
    if (next && !next.startsWith('--')) {
      args.set(arg, next);
      i += 1;
    } else {
      args.set(arg, true);
    }
  }
}

const csvDir = path.resolve(String(args.get('--csv-dir') || process.cwd()));
const includeOrders = args.has('--include-orders');
const dryRun = args.has('--dry-run');

function csvPath(name) {
  return path.join(csvDir, name);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows
    .slice(1)
    .filter((values) => values.some((value) => String(value || '').trim() !== ''))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

function readCsv(name, required = true) {
  const file = csvPath(name);
  if (!fs.existsSync(file)) {
    if (required) throw new Error(`Missing required CSV: ${file}`);
    return [];
  }
  const rows = parseCsv(fs.readFileSync(file, 'utf8'));
  console.log(`[restore] ${name}: ${rows.length} row(s)`);
  return rows;
}

function blankToNull(value) {
  const text = value == null ? '' : String(value);
  return text.trim() === '' ? null : text;
}

function boolValue(value, fallback = true) {
  if (value == null || String(value).trim() === '') return fallback;
  return ['true', '1', 'yes', 'y'].includes(String(value).trim().toLowerCase());
}

function intValue(value, fallback = 0) {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

function decimalValue(value, fallback = 0) {
  const n = Number(String(value ?? '').replace(/^RM\s*/i, ''));
  return Number.isFinite(n) ? n : fallback;
}

function dateValue(value, fallback = new Date()) {
  const raw = blankToNull(value);
  if (!raw) return fallback;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

function jsonValue(value, fallback) {
  const raw = blankToNull(value);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function slugify(input) {
  const slug = String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'vendor';
}

function uniqueSlug(base, used) {
  let candidate = base;
  let counter = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }
  used.add(candidate);
  return candidate;
}

function orderStatus(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'READY' || normalized === 'COMPLETED') return 'READY';
  return 'PREPARING';
}

function itemStatus(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'READY' || normalized === 'COMPLETED') return 'READY';
  return 'PREPARING';
}

function paymentStatus(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'PAID' || normalized === 'FAILED') return normalized;
  return 'PENDING';
}

async function ensureEmptyTarget() {
  const counts = await Promise.all([
    prisma.user.count(),
    prisma.vendorProfile.count(),
    prisma.menuItem.count(),
    prisma.order.count(),
    prisma.orderItem.count(),
  ]);
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total > 0 && !args.has('--allow-nonempty')) {
    throw new Error(
      `Target DB is not empty (User/Vendor/Menu/Order/OrderItem counts: ${counts.join('/')}). ` +
      'Use a new clean DB, or pass --allow-nonempty intentionally.'
    );
  }
}

async function main() {
  console.log('[restore] CSV directory:', csvDir);
  console.log('[restore] include order history:', includeOrders);
  console.log('[restore] dry run:', dryRun);

  const userRows = readCsv('User.csv');
  const vendorRows = readCsv('VendorProfile.csv');
  const menuRows = readCsv('MenuItem.csv');
  const orderRows = readCsv('Order.csv', false);
  const orderItemRows = readCsv('OrderItem.csv', false);

  await ensureEmptyTarget();

  const users = userRows.map((row) => ({
    id: row.id,
    email: String(row.email || '').trim().toLowerCase(),
    password: row.password,
    name: row.name || 'Vendor',
    role: 'VENDOR',
    isActive: boolValue(row.isActive, true),
    createdAt: dateValue(row.createdAt),
    updatedAt: dateValue(row.updatedAt),
  }));

  const usedSlugs = new Set();
  const vendors = vendorRows.map((row) => {
    const baseSlug = slugify(row.slug || row.businessName || row.id);
    return {
      id: row.id,
      userId: row.userId,
      slug: uniqueSlug(baseSlug, usedSlugs),
      businessName: row.businessName || 'Vendor',
      description: blankToNull(row.description),
      category: blankToNull(row.category),
      phoneNumber: blankToNull(row.phoneNumber),
      createdAt: dateValue(row.createdAt),
      updatedAt: dateValue(row.updatedAt),
    };
  });

  const userIds = new Set(users.map((user) => user.id));
  const vendorsWithMissingUsers = vendors.filter((vendor) => !userIds.has(vendor.userId));
  if (vendorsWithMissingUsers.length > 0) {
    throw new Error(`VendorProfile.csv has ${vendorsWithMissingUsers.length} row(s) with missing userId references.`);
  }

  const menuItems = menuRows.map((row, index) => ({
    id: row.id,
    vendorId: row.vendorId,
    name: row.name || 'Menu Item',
    description: blankToNull(row.description),
    price: decimalValue(row.price),
    imageUrl: blankToNull(row.imageUrl),
    isAvailable: boolValue(row.isAvailable, true),
    optionGroups: jsonValue(row.optionGroups, []),
    remarksEnabled: boolValue(row.remarksEnabled, true),
    displayOrder: intValue(row.displayOrder, index + 1),
    basePrepMin: intValue(row.basePrepMin, 5),
    extraPerItemMin: intValue(row.extraPerItemMin, 1),
    createdAt: dateValue(row.createdAt),
    updatedAt: dateValue(row.updatedAt),
  }));

  const vendorIds = new Set(vendors.map((vendor) => vendor.id));
  const menuWithMissingVendors = menuItems.filter((item) => !vendorIds.has(item.vendorId));
  if (menuWithMissingVendors.length > 0) {
    throw new Error(`MenuItem.csv has ${menuWithMissingVendors.length} row(s) with missing vendorId references.`);
  }

  const hourCoffee = vendors.find((vendor) => slugify(vendor.businessName) === 'hour-coffee' || vendor.slug === 'hour-coffee');
  console.log('[restore] Hour Coffee:', hourCoffee ? { id: hourCoffee.id, slug: hourCoffee.slug } : 'not found in VendorProfile.csv');

  let orders = [];
  let orderItems = [];
  if (includeOrders) {
    const menuIds = new Set(menuItems.map((item) => item.id));
    orders = orderRows.map((row, index) => ({
      id: row.id,
      customerId: row.customerId || row.guestId || `restored-customer-${index + 1}`,
      customerName: blankToNull(row.customerName),
      customerPhone: blankToNull(row.customerPhone),
      customerEmail: blankToNull(row.customerEmail),
      deviceId: blankToNull(row.deviceId),
      vendorId: row.vendorId,
      displayNumber: intValue(row.displayNumber || row.orderNumber || row.queueNumber, index + 1),
      status: orderStatus(row.status),
      paymentMode: 'PAY_AT_COUNTER',
      paymentStatus: paymentStatus(row.paymentStatus),
      totalAmount: decimalValue(row.totalAmount),
      createdAt: dateValue(row.createdAt),
      updatedAt: dateValue(row.updatedAt),
      acceptedAt: blankToNull(row.acceptedAt) ? dateValue(row.acceptedAt) : null,
      readyAt: blankToNull(row.readyAt) ? dateValue(row.readyAt) : null,
      completedAt: blankToNull(row.completedAt) ? dateValue(row.completedAt) : null,
    }));

    const orderIds = new Set(orders.map((order) => order.id));
    orderItems = orderItemRows.map((row) => ({
      id: row.id,
      orderId: row.orderId,
      menuItemId: row.menuItemId,
      quantity: intValue(row.quantity, 1),
      price: decimalValue(row.price),
      remark: blankToNull(row.remark),
      selectedOptions: jsonValue(row.selectedOptions, []),
      status: itemStatus(row.status),
    }));

    const badOrders = orders.filter((order) => !vendorIds.has(order.vendorId));
    const badItemsByOrder = orderItems.filter((item) => !orderIds.has(item.orderId));
    const badItemsByMenu = orderItems.filter((item) => !menuIds.has(item.menuItemId));

    if (badOrders.length || badItemsByOrder.length || badItemsByMenu.length) {
      console.error('[restore] Order history failed FK validation', {
        ordersWithMissingVendor: badOrders.length,
        itemsWithMissingOrder: badItemsByOrder.length,
        itemsWithMissingMenuItem: badItemsByMenu.length,
      });
      throw new Error('Order history was not imported because references do not match safely.');
    }
  }

  console.log('[restore] prepared counts', {
    users: users.length,
    vendors: vendors.length,
    menuItems: menuItems.length,
    orders: includeOrders ? orders.length : 0,
    orderItems: includeOrders ? orderItems.length : 0,
  });

  if (dryRun) return;

  await prisma.$transaction(async (tx) => {
    await tx.user.createMany({ data: users, skipDuplicates: true });
    await tx.vendorProfile.createMany({ data: vendors, skipDuplicates: true });
    await tx.vendorSettings.createMany({
      data: vendors.map((vendor) => ({ vendorId: vendor.id })),
      skipDuplicates: true,
    });
    await tx.menuItem.createMany({ data: menuItems, skipDuplicates: true });

    if (includeOrders) {
      await tx.order.createMany({ data: orders, skipDuplicates: true });
      await tx.orderItem.createMany({ data: orderItems, skipDuplicates: true });
    }
  });

  console.log('[restore] import complete');
}

main()
  .catch((error) => {
    console.error('[restore] failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
