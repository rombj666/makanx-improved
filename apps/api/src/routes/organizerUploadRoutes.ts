
import { Router, Request, Response } from 'express';
import prisma from '../utils/prisma';
import { uploadToCloudinary } from '../utils/cloudinary';
import { requireAuth, requireRole } from '../middleware/auth';
import { Role } from '@prisma/client';
import { uploadMemory } from '../middleware/uploadCloudinary';

const router = Router();

// POST /organizer/events/:eventId/map
router.post(
  '/events/:eventId/map',
  requireAuth,
  requireRole([Role.ORGANIZER]),
  uploadMemory.single('file'),
  async (req: any, res: any) => {
    try {
      // Debug Auth
      console.log(`[Upload] Origin: ${req.headers.origin}`);
      console.log(`[Upload] User: ${req.user?.userId}, Role: ${req.user?.role}`);
      console.log(`[Upload] Auth Header Present: ${!!req.headers.authorization}`);

      const { eventId } = req.params;
      const file = req.file;

      if (!file) {
        console.log('[Upload] No file received or field name incorrect (expected "file")');
        return res.status(400).json({ success: false, message: 'No file received (field name must be "file")' });
      }

      console.log(`[Upload] File received: ${file.originalname}, ${file.mimetype}, ${file.size} bytes`);

      const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedMimeTypes.includes(file.mimetype)) {
        return res.status(400).json({ success: false, message: 'Invalid file type. Only JPG, PNG, and WebP are allowed.' });
      }

      if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
         console.error('[Upload] Cloudinary configuration missing');
         return res.status(500).json({ success: false, message: 'Cloudinary not configured' });
      }

      // Check event ownership
      const event = await prisma.event.findUnique({
        where: { id: eventId },
      });

      if (!event) {
        return res.status(404).json({ success: false, message: 'Event not found' });
      }

      if (event.organizerId !== req.user?.userId) {
        console.log(`[Upload] Forbidden: Event owner ${event.organizerId} !== User ${req.user?.userId}`);
        return res.status(403).json({ success: false, message: 'Not authorized to edit this event' });
      }

      // Upload to Cloudinary
      const result = await uploadToCloudinary(
        file.buffer,
        `makanx/events/${eventId}/maps`,
        `map_${Date.now()}`
      );

      // Update DB
      const updatedEvent = await prisma.event.update({
        where: { id: eventId },
        data: { mapImageUrl: result.secure_url },
      });

      res.json({
        success: true,
        data: {
          mapImageUrl: updatedEvent.mapImageUrl,
        },
      });
    } catch (error) {
      console.error('Map upload error:', error);
      res.status(500).json({ success: false, message: 'Upload failed' });
    }
  }
);

export default router;
