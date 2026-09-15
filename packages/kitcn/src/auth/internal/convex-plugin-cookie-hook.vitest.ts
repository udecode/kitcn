import { expect, test } from 'vitest';
import { getJwtCookieToken } from './convex-plugin';

test('JWT-cookie token guard skips sessionless hooks and passes Headers', async () => {
  const requests: { headers: Headers }[] = [];
  const getToken = async (request: { headers: Headers }) => {
    requests.push(request);
    return { token: 'synthetic-token' };
  };

  expect(await getJwtCookieToken(undefined, getToken)).toBeUndefined();
  expect(requests).toEqual([]);

  expect(
    await getJwtCookieToken({ session: { id: 'session' } }, getToken)
  ).toEqual({ token: 'synthetic-token' });
  expect(requests).toHaveLength(1);
  expect(requests[0]?.headers).toBeInstanceOf(Headers);
});
