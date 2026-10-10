import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';

// internalFetch reads OHMZBUDGET_INTERNAL_FETCH_ALLOW through ../config.ts when
// it is imported, so the test servers must be listening (their ports known)
// before the dynamic import below — hence no static import of the module under
// test. Only the main server's host:port is allowlisted; the decoy is not.

type InternalFetchModule = typeof import('./internalFetch.js');

let server: http.Server;
let decoy: http.Server;
let base = '';
let decoyBase = '';
let decoyHits = 0;
let internalFetch: InternalFetchModule['internalFetch'];
let InternalFetchError: InternalFetchModule['InternalFetchError'];

function listen(server: http.Server) {
  return new Promise<number>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
  });
}

beforeAll(async () => {
  decoy = http.createServer((_req, res) => {
    decoyHits++;
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('decoy');
  });
  decoyBase = `http://127.0.0.1:${await listen(decoy)}`;

  server = http.createServer((req, res) => {
    switch (req.url) {
      case '/redirect-away':
        res.writeHead(302, { location: `${decoyBase}/x` });
        return res.end();
      case '/redirect':
        res.writeHead(302, { location: '/ok' });
        return res.end();
      case '/loop':
        res.writeHead(302, { location: '/loop' });
        return res.end();
      case '/hangup':
        return req.destroy(); // transport failure: no reply, socket closed
      default:
        res.writeHead(200, { 'content-type': 'text/plain' });
        return res.end('internal-ok');
    }
  });
  base = `http://127.0.0.1:${await listen(server)}`;

  process.env.OHMZBUDGET_INTERNAL_FETCH_ALLOW = `127.0.0.1:${new URL(base).port}`;
  ({ internalFetch, InternalFetchError } = await import('./internalFetch.js'));
});

afterAll(async () => {
  delete process.env.OHMZBUDGET_INTERNAL_FETCH_ALLOW;
  await Promise.all([new Promise((r) => server.close(r)), new Promise((r) => decoy.close(r))]);
});

describe('internalFetch', () => {
  it('reaches an allowlisted host:port', async () => {
    const response = await internalFetch(`${base}/ok`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('internal-ok');
  });

  it('refuses a non-allowlisted host before any connection', async () => {
    await expect(internalFetch('http://localhost:9/x')).rejects.toMatchObject({
      code: 'not_allowed',
    });
  });

  it('refuses a redirect that leaves the allowlist', async () => {
    await expect(internalFetch(`${base}/redirect-away`)).rejects.toBeInstanceOf(InternalFetchError);
    await expect(internalFetch(`${base}/redirect-away`)).rejects.toMatchObject({
      code: 'not_allowed',
    });
    expect(decoyHits).toBe(0); // the non-allowlisted target was never contacted
  });

  it('allows a redirect within the allowlist', async () => {
    const response = await internalFetch(`${base}/redirect`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('internal-ok');
  });

  it('matches host:port exactly (a different port on the same host is refused)', async () => {
    await expect(internalFetch('http://127.0.0.1:9/x')).rejects.toMatchObject({
      code: 'not_allowed',
    });
  });

  it('rejects unsupported schemes and invalid URLs', async () => {
    for (const url of ['ftp://127.0.0.1:9/x', 'file:///etc/passwd', 'not a url']) {
      await expect(internalFetch(url)).rejects.toMatchObject({ code: 'not_allowed' });
    }
  });

  it('gives up after 5 redirects', async () => {
    await expect(internalFetch(`${base}/loop`)).rejects.toMatchObject({
      code: 'too_many_redirects',
    });
  });

  it('wraps transport failures as http_error', async () => {
    const error = await internalFetch(`${base}/hangup`).catch((e) => e);
    expect(error).toBeInstanceOf(InternalFetchError);
    expect(error.code).toBe('http_error');
    expect(error.cause).toBeDefined();
  });

  it('propagates a caller abort instead of waiting for the timeout', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(internalFetch(`${base}/ok`, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});
