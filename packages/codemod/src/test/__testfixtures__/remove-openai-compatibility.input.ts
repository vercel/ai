// @ts-nocheck

import { createOpenAI } from '@ai-sdk/openai';

// Case 1: createOpenAI with compatibility: 'strict'
const openai1 = createOpenAI({
  apiKey: 'test-api-key',
  compatibility: 'strict',
});

// Case 2: createOpenAI with compatibility: 'compatible'
const openai2 = createOpenAI({
  compatibility: 'compatible',
  baseURL: 'https://api.example.com',
  apiKey: 'test-key',
});

// Case 3: createOpenAI with other properties and compatibility
const openai3 = createOpenAI({
  apiKey: 'test-api-key',
  compatibility: 'strict',
  headers: {
    'Custom-Header': 'value',
  },
  baseURL: 'https://custom.openai.com',
});

// Case 4: createOpenAI without compatibility (should not change)
const openai4 = createOpenAI({
  apiKey: 'test-api-key',
  baseURL: 'https://api.openai.com',
});

// Case 5: Multiple properties with compatibility in the middle
const openai5 = createOpenAI({
  apiKey: 'key',
  compatibility: 'compatible',
  fetch: customFetch,
  name: 'custom-openai',
});

// Case 6: Only compatibility property
const openai6 = createOpenAI({
  compatibility: 'strict',
});

function createCustomProvider() {
  return createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    compatibility: 'strict',
    baseURL: getBaseURL(),
  });
} 