// @ts-nocheck

import { generateText, streamText } from 'ai';

const result = await generateText({
  model: 'claude-3-5-sonnet-20241022',
  prompt: 'Explain your reasoning'
});

// Mixed destructuring (both properties in same pattern)
const { reasoning, reasoningDetails, text } = result;

// streamText with mixed destructuring
const streamResult = streamText({
  model: 'claude-3-5-sonnet-20241022',
  prompt: 'Explain your reasoning'
});

const { reasoning: r, reasoningDetails: rd } = streamResult;
