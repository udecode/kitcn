import { createServer } from 'node:http';

import { describe, expect, test } from 'vitest';

import { convexBetterAuth } from './index';

describe('convexBetterAuth (Node)', () => {
  test('POST handler forwards non-2xx upstream responses', async () => {
    let requestBody = '';
    const server = createServer((req, res) => {
      req.setEncoding('utf8');
      req.on('data', (chunk) => {
        requestBody += chunk;
      });
      req.on('end', () => {
        res.statusCode = 401;
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            code: 'INVALID_EMAIL_OR_PASSWORD',
            message: 'Invalid email or password',
            path: req.url,
          })
        );
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    try {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('expected tcp server address');
      }

      const result = convexBetterAuth({
        api: {},
        convexSiteUrl: `http://127.0.0.1:${address.port}`,
      });

      const response = await result.handler.POST(
        new Request(
          'https://app.example/api/auth/sign-in/email?redirect=false',
          {
            body: JSON.stringify({
              email: 'user@example.com',
              password: 'wrong-password',
            }),
            headers: {
              'content-type': 'application/json',
            },
            method: 'POST',
          }
        )
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        code: 'INVALID_EMAIL_OR_PASSWORD',
        message: 'Invalid email or password',
        path: '/api/auth/sign-in/email?redirect=false',
      });
      expect(requestBody).toBe(
        JSON.stringify({
          email: 'user@example.com',
          password: 'wrong-password',
        })
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });
});
