import { openai } from '@ai-sdk/openai';
import { experimental_evaluate } from 'ai';
import { run } from '../../lib/run';

// Reuse this instance to cache criterion embeddings across evaluations.
const model = openai.evaluationModel('text-embedding-3-large');

run(async () => {
  for (const state of [
    'I was charged twice. Please refund the duplicate.',
    'The application crashes whenever I open it.',
  ]) {
    const result = await experimental_evaluate({
      model,
      state,
      questions: {
        department: {
          type: 'choice',
          instructions: 'Which team should handle this request?',
          criteria: {
            billing: 'Charges, invoices, payments, and refunds',
            technical: 'Software bugs, crashes, and outages',
            account: 'Login, passwords, and account access',
          },
        },
      },
    });
    console.log('State:', state);
    console.log('Answer:', result.answers.department);
    console.log('Usage:', result.usage);
  }
});
