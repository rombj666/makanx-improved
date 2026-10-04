import multer from 'multer';
import path from 'path';
import { RequestHandler } from 'express';

const extensions: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'image/webp': ['.webp'],
};
const invalidImage = 'Only valid JPG, PNG, and WebP images are allowed';

const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (extensions[file.mimetype]?.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error(invalidImage));
  },
});

// Do not trust the extension or MIME label: inspect the bytes before sending them.
// Cloudinary then decodes and re-encodes the accepted raster image.
export function hasImageSignature(buffer: Buffer, mime: string): boolean {
  if (mime === 'image/jpeg') return buffer.length >= 3 && buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  if (mime === 'image/png') return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === 'image/webp') return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  return false;
}

export const uploadImage: RequestHandler = (req, res, next) => {
  uploadMemory.single('file')(req, res, (error: unknown) => {
    if (error) {
      const tooLarge = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE';
      return res.status(tooLarge ? 413 : 400).json({ success: false, message: tooLarge ? 'Image must be at most 10 MB' : invalidImage });
    }
    if (!req.file || !hasImageSignature(req.file.buffer, req.file.mimetype)) {
      return res.status(400).json({ success: false, message: invalidImage });
    }
    next();
  });
};
