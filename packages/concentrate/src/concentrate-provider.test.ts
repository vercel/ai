import { describe, expect, it, vi } from 'vitest';
import { createConcentrate } from './concentrate-provider';

describe('createConcentrate', () => {
  it('defaults to the Responses API and Concentrate endpoint', () => {
    const provider = createConcentrate({ apiKey: 'test-key' });

    expect(provider('gpt-5.2').provider).toBe('concentrate.responses');
    expect(provider.responses('gpt-5.2').provider).toBe(
      'concentrate.responses',
    );
    expect(provider.chat('gpt-5.2').provider).toBe('concentrate.chat');
  });

  it('accepts a custom endpoint and headers', () => {
    const provider = createConcentrate({
      apiKey: 'test-key',
      baseURL: 'https://example.com/v1/',
      headers: { 'X-Test': 'value' },
      fetch: vi.fn(),
    });

    expect(provider.chat('model').provider).toBe('concentrate.chat');
  });

  it('rejects unsupported model types', () => {
    const provider = createConcentrate({ apiKey: 'test-key' });

    expect(() => provider.embeddingModel('model')).toThrow();
    expect(() => provider.imageModel('model')).toThrow();
  });
});
