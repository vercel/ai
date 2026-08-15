import { describe, expect, it } from 'vitest';
import { createXai, xai } from './index';

describe('@ai-sdk/xai', () => {
  it('re-exports the spacexai provider', () => {
    expect(typeof createXai).toBe('function');
    expect(typeof xai).toBe('function');
  });
});
