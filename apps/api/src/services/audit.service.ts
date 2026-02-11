import prisma from '../utils/prisma';
import { AuditAction } from '@prisma/client';

export const createAuditLog = async (
  action: AuditAction,
  entityId: string,
  entityType: string,
  actorId: string,
  details?: any
) => {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        entityId,
        entityType,
        actorId,
        details: details || {},
      },
    });
  } catch (error) {
    console.error('Failed to create audit log:', error);
    // Don't throw, just log error so main flow isn't interrupted
  }
};
