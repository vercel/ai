// @ts-nocheck
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText, streamText } from 'ai';

const googleClient = createGoogleGenerativeAI({
  topK: 10,
  temperature: 0.7
});

const result = await generateText({
  model: googleClient('gemini-pro'),
  prompt: 'Hello'
});

const stream = await streamText({
  model: googleClient('gemini-pro'),
  prompt: 'Hello'
});
