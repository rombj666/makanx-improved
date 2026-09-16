import { Container, getContainer } from '@cloudflare/containers';

interface Env {
  API_CONTAINER: DurableObjectNamespace<ApiContainer>;
  NODE_ENV: string;
  DATABASE_URL: string;
  JWT_SECRET: string;
  CORS_ORIGIN: string;
  CLIENT_URL: string;
  CLOUDINARY_CLOUD_NAME: string;
  CLOUDINARY_API_KEY: string;
  CLOUDINARY_API_SECRET: string;
  RESEND_API_KEY: string;
  JWT_EXPIRES_IN?: string;
  EMAIL_FROM?: string;
  EMAIL_FROM_NAME?: string;
}

export class ApiContainer extends Container<Env> {
  defaultPort = 3001;
  sleepAfter = '30m';
  envVars = {
    PORT: '3001',
    NODE_ENV: this.env.NODE_ENV || 'production',
    DATABASE_URL: this.env.DATABASE_URL,
    JWT_SECRET: this.env.JWT_SECRET,
    CORS_ORIGIN: this.env.CORS_ORIGIN,
    CLIENT_URL: this.env.CLIENT_URL,
    CLOUDINARY_CLOUD_NAME: this.env.CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY: this.env.CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET: this.env.CLOUDINARY_API_SECRET,
    RESEND_API_KEY: this.env.RESEND_API_KEY,
    ...(this.env.JWT_EXPIRES_IN ? { JWT_EXPIRES_IN: this.env.JWT_EXPIRES_IN } : {}),
    ...(this.env.EMAIL_FROM ? { EMAIL_FROM: this.env.EMAIL_FROM } : {}),
    ...(this.env.EMAIL_FROM_NAME ? { EMAIL_FROM_NAME: this.env.EMAIL_FROM_NAME } : {}),
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Fail closed instead of starting with the API's legacy JWT fallback.
    const required = ['DATABASE_URL', 'JWT_SECRET', 'CORS_ORIGIN', 'CLIENT_URL',
      'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET',
      'RESEND_API_KEY'] as const;
    if (required.some((key) => !env[key]?.trim())) {
      return new Response('API deployment configuration is incomplete', { status: 503 });
    }
    const forwarded = new Request(request);
    // CF-Connecting-IP is set by Cloudflare's edge; never trust a supplied XFF chain.
    forwarded.headers.delete('Forwarded');
    forwarded.headers.delete('X-Forwarded-For');
    const clientIp = request.headers.get('CF-Connecting-IP');
    if (clientIp) forwarded.headers.set('X-Forwarded-For', clientIp);
    forwarded.headers.set('X-Forwarded-Proto', new URL(request.url).protocol.slice(0, -1));
    // One stable instance preserves Socket.IO sessions and in-memory rooms.
    // Container.fetch forwards WebSocket upgrades as well as normal HTTP requests.
    return getContainer(env.API_CONTAINER, 'smart-qr-api').fetch(forwarded);
  },
} satisfies ExportedHandler<Env>;
