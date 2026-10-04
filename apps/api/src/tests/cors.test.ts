import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../index';

describe('credentialed CORS', () => {
  it('allows configured frontend origins with credentials', async () => {
    const response = await request(app).get('/health').set('Origin', 'http://localhost:5173');
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does not grant an unauthorized origin credentialed access', async () => {
    const response = await request(app).get('/health').set('Origin', 'https://attacker.example');
    expect(response.headers).not.toHaveProperty('access-control-allow-origin');
    expect(response.headers).not.toHaveProperty('access-control-allow-credentials');
  });
});
