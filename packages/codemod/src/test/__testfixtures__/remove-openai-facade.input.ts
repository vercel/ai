// @ts-nocheck
import { OpenAI } from '@ai-sdk/openai';

const openai = new OpenAI({
  apiKey: 'key',
  baseURL: 'url',
  headers: { 'custom': 'header' }
});
