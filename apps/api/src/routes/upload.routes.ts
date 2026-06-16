
import { Router } from 'express';
import { uploadMemory } from '../middleware/uploadCloudinary';
import { uploadToCloudinary } from '../utils/cloudinary';
import { requireAuth } from '../middleware/auth';

const router = Router();

// POST /uploads/image
// Generic upload route for authenticated users
router.post(
  '/image',
  requireAuth,
  uploadMemory.single('file'),
  async (req: any, res: any) => {
    try {
      const file = req.file;
      const type = req.query.type || 'generic'; // vendorLogo, menuItem, etc.

      if (!file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
      }

      // Upload to Cloudinary
      const folder = `smart-qr-ordering-system/uploads/${type}`;
      const result = await uploadToCloudinary(
        file.buffer,
        folder,
        `${type}_${Date.now()}`
      );

      res.json({
        success: true,
        data: {
          url: result.secure_url,
          publicId: result.public_id
        },
      });
    } catch (error) {
      console.error('Generic upload error:', error);
      res.status(500).json({ success: false, message: 'Upload failed' });
    }
  }
);

export default router;
