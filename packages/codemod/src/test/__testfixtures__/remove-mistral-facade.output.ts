// @ts-nocheck
import { createMistral } from '@ai-sdk/mistral';

const mistral = createMistral({
  apiKey: 'key',
  baseURL: 'url',
  headers: { 'custom': 'header' }
});

const model = mistral('mistral-large', {
  maxTokens: 1000
});

const messages = mistral('mistral-medium');
