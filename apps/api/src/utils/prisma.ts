import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

prisma.$use(async (params, next) => {
  if (params.model === 'User' && params.args?.data?.email) {
    params.args.data.email = params.args.data.email.trim().toLowerCase();
  }
  return next(params);
});

export default prisma;
