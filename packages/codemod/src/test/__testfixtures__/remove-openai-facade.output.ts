// @ts-nocheck
import { createOpenAI } from '@ai-sdk/openai';

const openai = createOpenAI({
  apiKey: 'key',
  baseURL: 'url',
  headers: { 'custom': 'header' }
});

const chatModel = openai('gpt-4', {
  maxTokens: 1000
});

const completionModel = openai('gpt-3.5-turbo-instruct');
