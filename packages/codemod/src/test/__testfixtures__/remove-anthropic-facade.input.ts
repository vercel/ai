// @ts-nocheck
import { Anthropic } from '@ai-sdk/anthropic';

const anthropic = new Anthropic({
  apiKey: 'key',
  baseURL: 'url',
  headers: { 'custom': 'header' }
});
