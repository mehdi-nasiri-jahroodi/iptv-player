import { describe, expect, it } from 'vitest';
import { core, sourceTypeSchema } from './core';

describe('core', () => {
  it('should work', () => {
    expect(core()).toEqual('core');
  });

  it('parses source type', () => {
    expect(sourceTypeSchema.parse('m3u_url')).toBe('m3u_url');
  });
});
