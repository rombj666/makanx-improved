import prisma from './prisma';

/** Resolve either the owner login or a linked staff login to the shared Vendor. */
export async function vendorForUser(userId: string) {
  return prisma.vendorProfile.findFirst({
    where: { OR: [{ userId }, { staffUsers: { some: { id: userId } } }] },
  });
}
