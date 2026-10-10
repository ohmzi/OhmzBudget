import { fetch, Headers, type RequestInit, type Response } from 'undici';
import { internalFetchAllow } from '../config.js';

// Outbound HTTP for private-network sidecars (paperless-ngx, M2's document
// bridge): the opposite admission rule to safeFetch. Where safeFetch reaches
// public https endpoints only and refuses anything private, internalFetch
// reaches *only* the private host[:port] targets named in
// OHMZBUDGET_INTERNAL_FETCH_ALLOW — the SSRF bound here is that allowlist, so an
// empty one makes nothing reachable. The allowlist is read from ../config.ts at
// import time, so tests (and a future settings reload) must set the env var
// before importing this module.
//
// Entries must be written the way URL#host normalizes a target: the host is
// lowercased, and a default port (80 for http, 443 for https) is dropped — so a
// bare "paperless" permits https://paperless/ and http://paperless/, while a
// non-default port needs its own entry ("paperless:8000").

export type InternalFetchErrorCode =
  'not_allowed' | 'http_error' | 'too_many_redirects' | 'timeout';

export class InternalFetchError extends Error {
  readonly code: InternalFetchErrorCode;

  constructor(code: InternalFetchErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'InternalFetchError';
    this.code = code;
  }
}

const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 30_000;

/**
 * The admission rule: http/https only, and the URL's host[:port] must match an
 * allowlist entry exactly (a different port on an allowlisted host is refused).
 */
export function assertAllowedUrl(raw: string | URL): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new InternalFetchError('not_allowed', 'Invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new InternalFetchError('not_allowed', 'Only http:// and https:// URLs are allowed');
  }
  if (!internalFetchAllow.includes(url.host)) {
    throw new InternalFetchError(
      'not_allowed',
      `Refusing to connect to ${url.host}: not in OHMZBUDGET_INTERNAL_FETCH_ALLOW`,
    );
  }
  return url;
}

/**
 * fetch() restricted to the private host[:port] targets in
 * OHMZBUDGET_INTERNAL_FETCH_ALLOW. Redirects are followed manually (at most 5),
 * and **every hop is re-validated against the allowlist**, so an allowlisted
 * host can never bounce the request to somewhere else. The 30s timeout is
 * combined with `init.signal`, so either can abort the request (a caller abort
 * keeps its AbortError; the module's own deadline throws `timeout`). The
 * Authorization header is dropped if a redirect leaves the original origin, and
 * non-2xx statuses are returned, not thrown: callers check the status (e.g.
 * paperless's 401 for token rotation). Response sizes are NOT capped here —
 * callers must limit what they read themselves.
 */
export async function internalFetch(raw: string, init: RequestInit = {}): Promise<Response> {
  let url = assertAllowedUrl(raw);
  const origin = url.origin;
  const headers = new Headers(init.headers);
  const timeoutSignal = AbortSignal.timeout(TIMEOUT_MS);
  const signal = init.signal ? AbortSignal.any([timeoutSignal, init.signal]) : timeoutSignal;

  for (let hop = 0; ; hop++) {
    let response: Response;
    try {
      response = await fetch(url, { ...init, headers, redirect: 'manual', signal });
    } catch (err) {
      if (timeoutSignal.aborted && !init.signal?.aborted) {
        throw new InternalFetchError('timeout', `Request to ${url.host} timed out`, { cause: err });
      }
      // A caller abort is the caller's own control flow — keep its AbortError
      if (init.signal?.aborted) throw err;
      throw new InternalFetchError('http_error', `Request to ${url.host} failed`, { cause: err });
    }

    const location = response.headers.get('location');
    if (response.status < 300 || response.status >= 400 || !location) return response;

    await response.body?.cancel();
    if (hop >= MAX_REDIRECTS) {
      throw new InternalFetchError('too_many_redirects', 'Too many redirects');
    }
    let next: URL;
    try {
      next = new URL(location, url);
    } catch {
      throw new InternalFetchError('not_allowed', `Invalid redirect location from ${url.host}`);
    }
    url = assertAllowedUrl(next);
    if (url.origin !== origin) headers.delete('authorization');
  }
}
