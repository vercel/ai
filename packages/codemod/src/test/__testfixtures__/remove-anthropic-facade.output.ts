// @ts-nocheck
import { createAnthropic } from '@ai-sdk/anthropic';

const anthropic = createAnthropic({
  apiKey: 'key',
  baseURL: 'url',
  headers: { 'custom': 'header' }
});

const model = anthropic('claude-3', {
  maxTokens: 1000
});

const messages = anthropic('claude-3');
