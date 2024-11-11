// @ts-nocheck
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText, streamText } from 'ai';

const googleClient = createGoogleGenerativeAI({
  temperature: 0.7
});

const result = await generateText({
  model: googleClient('gemini-pro'),
  prompt: 'Hello',
  topK: 10
});

const stream = await streamText({
  model: googleClient('gemini-pro'),
  prompt: 'Hello',
  topK: 10
});
