import { parseM3uToPlaylist } from './m3u';
import { sourceSchema, type Source } from './contracts';
import { fetchXtreamPlayerApi, isXtreamAuthSuccessful } from './xtream';

export type SourceValidationErrorCode =
  | 'invalid_url'
  | 'cors_blocked'
  | 'unreachable'
  | 'parse_error'
  | 'empty_content'
  | 'auth_failed'
  | 'unexpected_payload';

export type SourceValidationResult =
  | { ok: true; source: Source }
  | { ok: false; code: SourceValidationErrorCode; message: string };

type FetchLike = (input: string) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export async function validateSource(
  sourceInput: unknown,
  options: { fetcher?: FetchLike; rawM3uText?: string } = {}
): Promise<SourceValidationResult> {
  const parsed = sourceSchema.safeParse(sourceInput);
  if (!parsed.success) {
    return { ok: false, code: 'invalid_url', message: parsed.error.message };
  }
  const source = parsed.data;

  if (source.type === 'm3u_file') {
    const content = options.rawM3uText?.trim() ?? '';
    if (!content) {
      return { ok: false, code: 'empty_content', message: 'M3U file content is empty.' };
    }
    try {
      parseM3uToPlaylist(content, source.id);
      return { ok: true, source };
    } catch (error) {
      return {
        ok: false,
        code: 'parse_error',
        message: error instanceof Error ? error.message : 'Failed to parse M3U content.',
      };
    }
  }

  if (source.type === 'm3u_url') {
    const fetcher = options.fetcher ?? (async () => Promise.reject(new Error('No fetcher configured')));
    try {
      const response = await fetcher(source.url ?? '');
      if (!response.ok) {
        return {
          ok: false,
          code: 'unreachable',
          message: `Source URL returned HTTP ${response.status}.`,
        };
      }
      const text = (await response.text()).trim();
      if (!text) {
        return { ok: false, code: 'empty_content', message: 'Source URL returned empty body.' };
      }
      parseM3uToPlaylist(text, source.id);
      return { ok: true, source };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown fetch error.';
      if (message.toLowerCase().includes('cors')) {
        return {
          ok: false,
          code: 'cors_blocked',
          message: 'Request was blocked by CORS. Paste raw content or import a file.',
        };
      }
      return { ok: false, code: 'unreachable', message };
    }
  }

  if (source.type === 'xtream') {
    if (!source.credentials) {
      // sourceSchema.superRefine already guards this, but narrow for TS.
      return {
        ok: false,
        code: 'invalid_url',
        message: 'Xtream sources require credentials.',
      };
    }
    const fetcher = options.fetcher ?? (async () => Promise.reject(new Error('No fetcher configured')));
    try {
      // `XtreamFetcher` only needs `.text()`; `FetchLike` is a superset.
      const xtreamFetcher = async (url: string) => {
        const r = await fetcher(url);
        return { text: () => r.text() };
      };
      const payload = await fetchXtreamPlayerApi(source.credentials, xtreamFetcher);
      if (!isXtreamAuthSuccessful(payload)) {
        return {
          ok: false,
          code: 'auth_failed',
          message: 'Xtream panel rejected the credentials (auth=0).',
        };
      }
      return { ok: true, source };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Xtream error.';
      // Zod parse failures throw `ZodError` whose message starts with `[`.
      // SyntaxError comes from JSON.parse on non-JSON bodies (e.g. HTML error
      // pages or HTTP 461 user-agent blocks that return text).
      if (
        error instanceof SyntaxError ||
        message.startsWith('[') ||
        message.toLowerCase().includes('zod')
      ) {
        return {
          ok: false,
          code: 'unexpected_payload',
          message: `Xtream panel returned an unexpected response: ${message}`,
        };
      }
      if (message.toLowerCase().includes('cors')) {
        return {
          ok: false,
          code: 'cors_blocked',
          message: 'Request was blocked by CORS.',
        };
      }
      return { ok: false, code: 'unreachable', message };
    }
  }

  return { ok: true, source };
}
