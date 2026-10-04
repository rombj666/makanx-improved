import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Writable } from 'stream';
import { existsSync, writeFileSync, unlinkSync, mkdirSync } from 'fs';
import path from 'path';
const mocks = vi.hoisted(() => ({ stream: vi.fn(), buffers: [] as Buffer[] }));
vi.mock('cloudinary', () => ({ v2: { config: vi.fn(), uploader: { upload_stream: mocks.stream } } }));
import { app } from '../index';
import { generateGuestToken, generateToken } from '../utils/jwt';
import { VENDOR_AUTH_COOKIE } from '../utils/vendor-auth-cookie';
const token = generateToken({ userId: 'vendor', role: 'VENDOR' });
const vendorCookie = `${VENDOR_AUTH_COOKIE}=${encodeURIComponent(token)}`;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
beforeEach(() => {
  mocks.buffers.length = 0;
  mocks.stream.mockReset();
  mocks.stream.mockImplementation((_options, done) => new Writable({
    write(chunk, _encoding, callback) { mocks.buffers.push(chunk); callback(); },
    final(callback) { done(null, { secure_url: 'https://res.cloudinary.com/test/image/upload/image.webp', public_id: 'image' }); callback(); },
  }));
});

describe('Cloudinary-only image uploads', () => {
  it('sends a valid image in memory to Cloudinary with raster-only output', async () => {
    const result = await request(app).post('/api/uploads/image?type=menuItem').set('Cookie', vendorCookie)
      .attach('file', png, { filename: 'photo.png', contentType: 'image/png' });
    expect(result.status).toBe(200);
    expect(result.body.data.url).toMatch(/^https:\/\/res.cloudinary.com/);
    expect(Buffer.concat(mocks.buffers)).toEqual(png);
    expect(mocks.stream.mock.calls[0][0]).toMatchObject({ resource_type: 'image', allowed_formats: ['jpg', 'jpeg', 'png', 'webp'], format: 'webp', folder: 'smart-qr-ordering-system/uploads/menuItem' });
  });
  it.each([
    ['attack.html', 'image/png', png],
    ['attack.html.png', 'image/png', Buffer.from('<html><script>alert(1)</script></html>')],
    ['attack.png', 'image/png', Buffer.from('<svg onload="alert(1)"></svg>')],
    ['attack.svg', 'image/svg+xml', Buffer.from('<svg></svg>')],
    ['attack.svg', 'image/png', png],
    ['photo.jpg', 'image/jpeg', png],
    ['image.gif', 'image/gif', Buffer.from('GIF89a')],
  ])('rejects disguised or unsupported images: %s', async (filename, contentType, buffer) => {
    const result = await request(app).post('/api/uploads/image').set('Cookie', vendorCookie)
      .attach('file', buffer as Buffer, { filename: filename as string, contentType: contentType as string });
    expect(result.status).toBe(400);
    expect(mocks.stream).not.toHaveBeenCalled();
  });
  it('requires vendor authentication', async () => {
    for (const credential of ['', generateGuestToken('guest:A')]) {
      const result = await request(app).post('/api/uploads/image').set('Authorization', `Bearer ${credential}`)
        .attach('file', png, { filename: 'photo.png', contentType: 'image/png' });
      expect(result.status).toBe(401);
    }
    expect(mocks.stream).not.toHaveBeenCalled();
  });
  it('rejects oversized files and invalid destination types', async () => {
    const large = await request(app).post('/api/uploads/image').set('Cookie', vendorCookie)
      .attach('file', Buffer.alloc(10 * 1024 * 1024 + 1), { filename: 'photo.png', contentType: 'image/png' });
    expect(large.status).toBe(413);
    const traversal = await request(app).post('/api/uploads/image?type=../../other').set('Cookie', vendorCookie)
      .attach('file', png, { filename: 'photo.png', contentType: 'image/png' });
    expect(traversal.status).toBe(400);
    expect(mocks.stream).not.toHaveBeenCalled();
  });
  it('does not expose even existing local files and has removed disk upload middleware', async () => {
    const directory = path.resolve(__dirname, '../../uploads');
    mkdirSync(directory, { recursive: true });
    const filename = `security-test-${process.pid}.html`;
    const target = path.join(directory, filename);
    writeFileSync(target, '<script>dangerous()</script>');
    try {
      const response = await request(app).get(`/uploads/${filename}`);
      expect(response.status).toBe(404);
      expect(response.text).not.toContain('dangerous()');
    } finally { unlinkSync(target); }
    expect(existsSync(path.resolve(__dirname, '../middleware/upload.ts'))).toBe(false);
  });
  it('fails closed when Cloudinary rejects invalid raster data', async () => {
    mocks.stream.mockImplementation((_options, done) => new Writable({
      write(_chunk, _encoding, callback) { callback(); },
      final(callback) { done(new Error('Invalid image')); callback(); },
    }));
    const response = await request(app).post('/api/uploads/image').set('Cookie', vendorCookie)
      .attach('file', png.subarray(0, 8), { filename: 'fake.png', contentType: 'image/png' });
    expect(response.status).toBe(500);
    expect(response.body).not.toHaveProperty('data');
  });
});
