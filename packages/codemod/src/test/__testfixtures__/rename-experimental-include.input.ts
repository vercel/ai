// @ts-nocheck
import { generateText, streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

// Case 1: generateText with experimental_include
const result1 = await generateText({
  model: openai('gpt-4o'),
  prompt: 'Hello',
  experimental_include: {
    requestBody: false,
    responseBody: false,
  },
});

// Case 2: streamText with experimental_include
const result2 = streamText({
  model: openai('gpt-4o'),
  prompt: 'Hello',
  experimental_include: {
    requestBody: false,
  },
});

// Case 3: generateText without experimental_include (should not change)
const result3 = await generateText({
  model: openai('gpt-4o'),
  prompt: 'Hello',
});

// Case 4: Other function with experimental_include (should not change)
const result4 = someOtherFunction({
  experimental_include: { requestBody: false },
});
