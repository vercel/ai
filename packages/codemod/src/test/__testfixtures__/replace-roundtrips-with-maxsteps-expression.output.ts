// @ts-nocheck
import { generateText, streamText } from 'ai';

const rounds = 4;
const config = { limit: 2 };
const getLimit = () => 3;

// Identifier
await generateText({
  model,
  maxSteps: rounds + 1
});

// Arithmetic expression
streamText({
  model,
  maxSteps: rounds * 2 + 1
});

// Function call
await generateText({
  model,
  maxSteps: getLimit() + 1
});

// Member access
streamText({
  model,
  maxSteps: config.limit + 1
});

// Conditional expression
await generateText({
  model,
  maxSteps: (isDeep ? 10 : 2) + 1
});

// Literal still gets the extra step
streamText({
  model,
  maxSteps: 6
});
