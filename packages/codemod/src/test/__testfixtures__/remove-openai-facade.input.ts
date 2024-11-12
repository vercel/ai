// @ts-nocheck
import { OpenAI } from '@ai-sdk/openai';

const openai = new OpenAI({
  apiKey: 'key',
  baseURL: 'url',
  headers: { 'custom': 'header' }
});

const chatModel = openai.chat('gpt-4', {
  logprobs: true
});

const completionModel = openai.completion('gpt-3.5-turbo-instruct');
