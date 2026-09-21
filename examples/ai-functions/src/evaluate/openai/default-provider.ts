import { openai } from '@ai-sdk/openai';
import { customProvider, experimental_evaluate } from 'ai';
import { run } from '../../lib/run';

// Configure once at application startup; this also affects other AI SDK functions.
globalThis.AI_SDK_DEFAULT_PROVIDER = customProvider({
  evaluationModels: { compact: openai.evaluationModel('gpt-5.6-luna') },
  fallbackProvider: openai,
});

run(async () => {
  const result = await experimental_evaluate({
    model: 'compact',
    state: 'I was charged twice.',
    questions: {
      department: {
        type: 'choice',
        instructions: 'Which team should handle this?',
        criteria: { billing: 'Charges and refunds', support: 'Other requests' },
      },
    },
  });

  console.log('Department:', result.answers.department.choice);
  console.log('Usage:', result.usage);
});
