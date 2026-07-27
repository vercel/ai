import { describe, expect, it } from 'vitest';
import { createMistral } from './mistral-provider';

describe('MistralProvider', () => {
  const provider = createMistral({ apiKey: 'test-api-key' });

  it('should create Conversations API models', () => {
    const model = provider.conversations('mistral-small-latest');

    expect(model.provider).toBe('mistral.conversations');
    expect(model.modelId).toBe('mistral-small-latest');
  });

  it('should expose web search provider tools', () => {
    expect(provider.tools.webSearch()).toMatchObject({
      type: 'provider',
      id: 'mistral.web_search',
      args: {},
    });
    expect(provider.tools.webSearchPremium()).toMatchObject({
      type: 'provider',
      id: 'mistral.web_search_premium',
      args: {},
    });
  });
});
