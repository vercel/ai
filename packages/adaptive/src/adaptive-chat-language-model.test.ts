import { describe, it, expect } from 'vitest';
import { AdaptiveChatLanguageModel } from './adaptive-chat-language-model';

describe('AdaptiveChatLanguageModel', () => {
  it('should construct with modelId and config', () => {
    const model = new AdaptiveChatLanguageModel('test-model', {
      provider: 'adaptive.chat',
      baseURL: 'https://example.com',
      headers: () => ({}),
    });
    expect(model.modelId).toBe('test-model');
    expect(model.provider).toBe('adaptive.chat');
  });

  // doGenerate and doStream would require API mocking for full tests
  // Here we just check that the methods exist and are callable
  it('should have doGenerate and doStream methods', () => {
    const model = new AdaptiveChatLanguageModel('test-model', {
      provider: 'adaptive.chat',
      baseURL: 'https://example.com',
      headers: () => ({}),
    });
    expect(typeof model.doGenerate).toBe('function');
    expect(typeof model.doStream).toBe('function');
  });
});
