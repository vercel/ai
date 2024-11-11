// @ts-nocheck
import { createVertex } from '@ai-sdk/google-vertex';
import { generateText, streamText } from 'ai';

const vertexClient = createVertex({
  topK: 10,
  temperature: 0.7,
  project: 'my-project',
  location: 'us-central1'
});

const result = await generateText({
  model: vertexClient('gemini-pro'),
  prompt: 'Hello'
});

const stream = await streamText({
  model: vertexClient('gemini-pro'),
  prompt: 'Hello'
});
