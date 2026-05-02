/**
 * GET `{baseUrl}/healthz` — used by the stream proxy add/edit modal.
 */
export async function fetchProxyHealthz(baseUrlRaw: string): Promise<
  { ok: true } | { ok: false; reason: string }
> {
  const trimmed = baseUrlRaw.trim();
  if (!trimmed) {
    return { ok: false, reason: 'Enter a proxy URL first.' };
  }
  let base: string;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return { ok: false, reason: 'Must be an http(s) URL.' };
    }
    base = trimmed.replace(/\/+$/, '');
  } catch {
    return { ok: false, reason: 'Invalid URL.' };
  }
  try {
    const res = await fetch(`${base}/healthz`);
    if (!res.ok) {
      return { ok: false, reason: `Server responded ${res.status}` };
    }
    return { ok: true };
  } catch (cause) {
    const reason =
      cause instanceof TypeError
        ? 'Cannot reach the proxy. Is it running and the URL correct?'
        : cause instanceof Error
          ? cause.message
          : 'Unknown error.';
    return { ok: false, reason };
  }
}
