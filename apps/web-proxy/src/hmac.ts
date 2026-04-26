import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Computes a hex-encoded HMAC-SHA256 over the canonical request payload
 * `${u}|${ua ?? ''}` using the proxy's shared secret.
 *
 * The web app must compute the same value with the Web Crypto API
 * (`crypto.subtle.sign('HMAC', ...)` over UTF-8 bytes of the same payload)
 * and pass it as the `sig` query parameter.
 */
export function signProxyRequest(
  secret: string,
  u: string,
  ua: string | undefined
): string {
  return createHmac('sha256', secret)
    .update(`${u}|${ua ?? ''}`)
    .digest('hex');
}

/**
 * Constant-time comparison of two hex signatures. Returns false on length
 * mismatch or any decode failure rather than throwing — the caller treats a
 * `false` result as a 403 outcome.
 */
export function verifyProxySignature(
  secret: string,
  u: string,
  ua: string | undefined,
  providedSig: string
): boolean {
  const expected = signProxyRequest(secret, u, ua);
  if (expected.length !== providedSig.length) return false;
  try {
    return timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(providedSig, 'hex')
    );
  } catch {
    return false;
  }
}
