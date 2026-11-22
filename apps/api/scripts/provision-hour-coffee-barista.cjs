const { emitKeypressEvents } = require('node:readline');
const { stdin, stdout } = require('node:process');
const bcrypt = require('bcryptjs');
const { PrismaClient, VendorPermission, Role } = require('@prisma/client');

function readHiddenPassword() {
  if (!stdin.isTTY || !stdin.setRawMode) return Promise.reject(new Error('Provide BARISTA_INITIAL_PASSWORD through a protected environment variable when no interactive terminal is available.'));
  emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdout.write('Barista initial password (hidden): ');
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = (error) => {
      stdin.setRawMode(false);
      stdin.removeListener('keypress', onKey);
      stdout.write('\n');
      error ? reject(error) : resolve(value);
    };
    const onKey = (char, key = {}) => {
      if (key.ctrl && key.name === 'c') return finish(new Error('Cancelled.'));
      if (key.name === 'return' || key.name === 'enter') return finish();
      if (key.name === 'backspace') { value = value.slice(0, -1); return; }
      if (!key.ctrl && char) value += char;
    };
    stdin.on('keypress', onKey);
  });
}

function dbHost(url) {
  try { return new URL(url).host; } catch { return 'unparseable target'; }
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Set DATABASE_URL to the verified target database.');
  if (!['isolated', 'production'].includes(process.env.PROVISIONING_TARGET)) throw new Error('Set PROVISIONING_TARGET to isolated or production.');
  let password = process.env.BARISTA_INITIAL_PASSWORD;
  if (!password && process.stdin.isTTY) {
    password = await readHiddenPassword();
  }
  if (!password || password.length < 6) throw new Error('Set BARISTA_INITIAL_PASSWORD (minimum 6 characters) using a protected secret input.');

  const production = process.env.PROVISIONING_TARGET === 'production';
  if (production && process.env.PRODUCTION_PROVISIONING_APPROVED !== 'Hour Coffee') {
    throw new Error('Production writes require explicit approval: set PRODUCTION_PROVISIONING_APPROVED=Hour Coffee after verifying deployment and target.');
  }

  const prisma = new PrismaClient({ datasources: { db: { url: connectionString } } });
  try {
    const admin = await prisma.user.findUnique({
      where: { email: 'rombj45@gmail.com' },
      include: { vendorProfile: true },
    });
    if (!admin || admin.role !== Role.VENDOR || !admin.isActive || !admin.vendorProfile) {
      throw new Error('Expected active Admin owner and Vendor profile were not found; nothing was written.');
    }
    if (admin.permission !== VendorPermission.ADMIN) throw new Error('Existing Admin does not have ADMIN permission; nothing was written.');
    const vendor = admin.vendorProfile;
    if (vendor.businessName.trim().toLowerCase() !== 'hour coffee') throw new Error('Admin is linked to a Vendor other than Hour Coffee; nothing was written.');
    console.log(JSON.stringify({ target: process.env.PROVISIONING_TARGET, databaseHost: dbHost(connectionString), vendor: vendor.businessName, vendorId: vendor.id }));
    const matching = await prisma.user.findMany({ select: { id: true, email: true, permission: true, vendorId: true, isActive: true } });
    const existing = matching.find((user) => user.email.trim().toLowerCase() === 'hour coffee');
    if (existing) {
      if (existing.vendorId !== vendor.id || existing.permission !== VendorPermission.BARISTA || !existing.isActive) {
        throw new Error('Username Hour Coffee already belongs to a different or incompatible account; nothing was changed.');
      }
      console.log(JSON.stringify({ result: 'already-provisioned', username: 'Hour Coffee', permission: existing.permission, vendorId: vendor.id }));
      return;
    }
    const [applied] = await prisma.$queryRaw`SELECT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name = '20261122020000_vendor_staff_permissions' AND finished_at IS NOT NULL) AS applied`;
    if (!applied?.applied) throw new Error('Vendor staff permissions migration is not applied; nothing was written.');
    const passwordHash = await bcrypt.hash(password, await bcrypt.genSalt(10));
    const created = await prisma.user.create({
      data: {
        email: 'hour coffee',
        name: 'Hour Coffee',
        password: passwordHash,
        role: Role.VENDOR,
        permission: VendorPermission.BARISTA,
        vendorId: vendor.id,
        isActive: true,
      },
      select: { id: true, permission: true, vendorId: true, isActive: true },
    });
    console.log(JSON.stringify({ result: 'created', username: 'Hour Coffee', permission: created.permission, vendorId: created.vendorId, active: created.isActive }));
  } finally {
    password = undefined;
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error.message || 'Provisioning failed.');
  process.exitCode = 1;
});
