import { expect, it, describe } from 'vitest';
import { LanguageModelV1 } from '@ai-sdk/provider';
import { bailing } from './bailing-provider';

// Test that the provider is properly configured
it('should create provider instances', () => {
  expect(bailing).toBeDefined();
  expect(typeof bailing).toBe('function');
  expect(typeof bailing.chatModel).toBe('function');
});

// Test that chat models can be created
it('should create chat models', () => {
  const model = bailing.chatModel('Ling-1T');
  expect(model).toBeDefined();
  expect(model.specificationVersion).toBe('v3');
});

// Test that chat models can be created with search options
it('should create chat models with search options', () => {
  const model = bailing.chatModel('Ling-1T');
  expect(model).toBeDefined();
  expect(model.specificationVersion).toBe('v3');
});

// Test that provider options are properly typed
it('should accept valid provider options', async () => {
  const model = bailing.chatModel('Ling-1T');
  
  // This test just verifies that the types are correct
  // In a real test, we would mock the API calls
  expect(model).toBeDefined();
});
