import 'dotenv/config';
import { parallel } from '@ai-sdk/parallel';
import { experimental_decide as decide } from 'ai';

const result = await decide({
  model: parallel.decisionModel('fast'),
  state: { company: 'Parallel', website: 'https://parallel.ai' },
  questions: {
    hasSearch: {
      type: 'boolean',
      instructions: 'Does this company offer a web search API?',
    },
  },
});

console.log(result.answers);
console.log(result.providerMetadata?.parallel);
console.log(result.usage);
