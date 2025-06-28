// @ts-nocheck

import { generateText, streamText } from 'ai';

const result = await generateText({
  model: 'claude-3-5-sonnet-20241022',
  prompt: 'Explain your reasoning'
});

// Member expression access
console.log(result.reasoning);
console.log(result.reasoningDetails);

// Destructuring assignment
const { reasoning } = result;
const { reasoningDetails } = result;

// String literal property access
const reasoningText = result['reasoning'];
const reasoningArray = result['reasoningDetails'];

// Object literal
const responseData = {
  reasoning: result.reasoning,
  reasoningDetails: result.reasoningDetails,
  text: result.text
};

// streamText usage
const streamResult = streamText({
  model: 'claude-3-5-sonnet-20241022',
  prompt: 'Explain your reasoning'
});

// Access reasoning from stream result
console.log(streamResult.reasoning);
console.log(streamResult.reasoningDetails);

// Destructuring from stream result
const { reasoning: streamReasoning } = streamResult;
const { reasoningDetails: streamReasoningDetails } = streamResult; 