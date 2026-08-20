import { describe, expect, it } from 'vitest';
import { createSpaceXAI, createXai, spacexai, xai } from './index';

describe('@ai-sdk/xai', () => {
  it('re-exports the spacexai provider', () => {
    expect(typeof createSpaceXAI).toBe('function');
    expect(typeof spacexai).toBe('function');
  });

  it('re-exports deprecated xai aliases', () => {
    expect(createXai).toBe(createSpaceXAI);
    expect(xai).toBe(spacexai);
  });
});
