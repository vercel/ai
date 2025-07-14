// @ts-nocheck

import { generateText, streamText } from 'ai';

const result = await generateText({
  model: 'claude-3-5-sonnet-20241022',
  prompt: 'Explain your reasoning'
});

// Member expression access
console.log(result.reasoningText);
console.log(result.reasoning);

// Destructuring assignment
const { reasoningText } = result;
const { reasoningText: reasoning } = result;

// String literal property access
const reasoningText = result['reasoningText'];
const reasoningArray = result['reasoning'];

// Object literal
const responseData = {
  reasoningText: result.reasoningText,
  reasoning: result.reasoning,
  text: result.text
};

// streamText usage
const streamResult = streamText({
  model: 'claude-3-5-sonnet-20241022',
  prompt: 'Explain your reasoning'
});

// Access reasoning from stream result
console.log(streamResult.reasoningText);
console.log(streamResult.reasoning);

// Destructuring from stream result
const { reasoningText: streamReasoning } = streamResult;
const { reasoningText: streamReasoningDetails } = streamResult; 