// @ts-nocheck
import { Anthropic } from '@ai-sdk/anthropic';

const anthropic = new Anthropic({
  apiKey: 'key',
  baseURL: 'url',
  headers: { 'custom': 'header' }
});

const model = anthropic.chat('claude-3', {
  maxTokens: 1000
});

const messages = anthropic.messages('claude-3');
