// @ts-nocheck
import { generateText, streamText } from 'ai';

const rounds = 4;
const config = { limit: 2 };
const getLimit = () => 3;

// Identifier
await generateText({
  model,
  maxToolRoundtrips: rounds
});

// Arithmetic expression
streamText({
  model,
  maxToolRoundtrips: rounds * 2
});

// Function call
await generateText({
  model,
  maxAutomaticRoundtrips: getLimit()
});

// Member access
streamText({
  model,
  maxToolRoundtrips: config.limit
});

// Conditional expression
await generateText({
  model,
  maxToolRoundtrips: isDeep ? 10 : 2
});

// Literal still gets the extra step
streamText({
  model,
  maxAutomaticRoundtrips: 5
});
