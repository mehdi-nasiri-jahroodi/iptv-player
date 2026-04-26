import { describe, expect, test } from 'vitest';
import {
  describeShakaError,
  formatShakaErrorForClipboard,
} from '../../src/lib/describe-error';
import type { ShakaError } from '../../src/lib/use-shaka-player';

const baseError = (overrides: Partial<ShakaError>): ShakaError => ({
  message: 'shaka error',
  ...overrides,
});

describe('describeShakaError', () => {
  test('translates HTTP_ERROR (1002) to a user-friendly headline + hint', () => {
    const desc = describeShakaError(
      baseError({
        code: 1002,
        category: 1,
        data: ['http://example.com/stream.m3u8', 0],
        message: 'HTTP_ERROR',
      })
    );
    expect(desc.headline).toBe('The stream is unreachable.');
    expect(desc.hint).toMatch(/network|provider/i);
    expect(desc.code).toBe(1002);
    expect(desc.codeName).toBe('HTTP_ERROR');
    expect(desc.category).toBe(1);
    expect(desc.url).toBe('http://example.com/stream.m3u8');
  });

  test('1002 hint mentions stream proxy when none is configured', () => {
    const desc = describeShakaError(
      baseError({
        code: 1002,
        category: 1,
        data: ['http://example.com/stream.m3u8', 0],
        message: 'HTTP_ERROR',
      }),
      { streamProxyConfigured: false }
    );
    expect(desc.hint).toMatch(/Settings/i);
    expect(desc.hint).toMatch(/proxy/i);
  });

  test('1002 keeps default hint when stream proxy is configured', () => {
    const desc = describeShakaError(
      baseError({
        code: 1002,
        category: 1,
        data: ['http://example.com/stream.m3u8', 0],
        message: 'HTTP_ERROR',
      }),
      { streamProxyConfigured: true }
    );
    expect(desc.hint).toMatch(/network|provider/i);
    expect(desc.hint).not.toMatch(/Settings/i);
  });

  test('extracts httpStatus from network error data', () => {
    const desc = describeShakaError(
      baseError({
        code: 1001,
        data: ['http://example.com/x.m3u8', 403],
      })
    );
    expect(desc.httpStatus).toBe(403);
    expect(desc.url).toBe('http://example.com/x.m3u8');
  });

  test('falls back to a category headline for unknown codes', () => {
    const desc = describeShakaError(
      baseError({ code: 9999, category: 4, message: 'mystery' })
    );
    // Category 4 is manifest/parser
    expect(desc.headline).toBe('The stream manifest could not be parsed.');
    expect(desc.code).toBe(9999);
    expect(desc.codeName).toBeNull();
    expect(desc.hint).not.toBeNull();
  });

  test('falls back to the original message when no code or category is recognised', () => {
    const desc = describeShakaError(baseError({ message: 'plain old error' }));
    expect(desc.headline).toBe('plain old error');
    expect(desc.code).toBeNull();
    expect(desc.category).toBeNull();
  });

  test('treats non-numeric httpStatus as null', () => {
    const desc = describeShakaError(
      baseError({ code: 1002, data: ['http://example.com', 'oops'] })
    );
    expect(desc.httpStatus).toBeNull();
  });
});

describe('formatShakaErrorForClipboard', () => {
  test('renders a compact multi-line summary including code name and URL', () => {
    const desc = describeShakaError(
      baseError({
        code: 1002,
        category: 1,
        data: ['http://example.com/x.m3u8', 0],
        message: 'HTTP_ERROR',
      })
    );
    const text = formatShakaErrorForClipboard(desc);
    expect(text).toContain('Playback error: The stream is unreachable.');
    expect(text).toContain('Code: 1002 (HTTP_ERROR)');
    expect(text).toContain('Category: 1');
    expect(text).toContain('URL: http://example.com/x.m3u8');
    expect(text).toContain('Shaka message: HTTP_ERROR');
  });

  test('omits sections that are not available', () => {
    const desc = describeShakaError(baseError({ message: 'unknown' }));
    const text = formatShakaErrorForClipboard(desc);
    expect(text).not.toContain('Code:');
    expect(text).not.toContain('Category:');
    expect(text).not.toContain('URL:');
  });

  test('handles unserialisable data gracefully', () => {
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    const desc = describeShakaError(baseError({ data: circular }));
    const text = formatShakaErrorForClipboard(desc);
    expect(text).toContain('Data:');
  });
});
