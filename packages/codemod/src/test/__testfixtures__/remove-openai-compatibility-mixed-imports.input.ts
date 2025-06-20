// @ts-nocheck

import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAI as createOpenAICompatible } from '@ai-sdk/openai-compatible';

// This should have compatibility removed (from @ai-sdk/openai)
const openai = createOpenAI({
  apiKey: 'test-key',
  compatibility: 'strict',
});

// This should keep compatibility (from @ai-sdk/openai-compatible)
const openaiCompatible = createOpenAICompatible({
  apiKey: 'test-key',
  compatibility: 'compatible',
  baseURL: 'https://api.groq.com',
});

// Another @ai-sdk/openai case that should be transformed
const openai2 = createOpenAI({
  compatibility: 'strict',
  headers: { 'Custom': 'value' },
});

// Another @ai-sdk/openai-compatible case that should NOT be transformed
const groq = createOpenAICompatible({
  compatibility: 'compatible',
  name: 'groq',
}); 