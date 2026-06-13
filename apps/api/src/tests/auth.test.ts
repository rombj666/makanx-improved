import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../index';

describe('Simplified API surface', () => {
  it('reports the active product name', async () => {
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.text).toBe('Smart QR Ordering System API Running');
  });

  it('does not expose organizer, event, or booth routes', async () => {
    const responses = await Promise.all([
      request(app).get('/api/organizer'),
      request(app).get('/api/events'),
      request(app).get('/api/booths'),
    ]);
    responses.forEach((response) => expect(response.status).toBe(404));
  });
});
