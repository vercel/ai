// @ts-nocheck
import { Anthropic } from '@ai-sdk/anthropic';

const anthropic = new Anthropic({
  apiKey: 'key',
  baseURL: 'url',
  headers: { 'custom': 'header' }
});

const model = anthropic.chat('claude-3', {
  cacheControl: true
});

const messages = anthropic.messages('claude-3', { cacheControl: true });
