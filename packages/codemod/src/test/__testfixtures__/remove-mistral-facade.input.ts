// @ts-nocheck
import { Mistral } from '@ai-sdk/mistral';

const mistral = new Mistral({
  apiKey: 'key',
  baseURL: 'url',
  headers: { 'custom': 'header' }
});

const model = mistral.chat('mistral-large', {
  maxTokens: 1000
});

const messages = mistral.messages('mistral-medium');
