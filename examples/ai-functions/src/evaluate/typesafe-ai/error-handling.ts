import { typeSafeAi } from '@ai-sdk/typesafe-ai';
import { APICallError } from '@ai-sdk/provider';
import { experimental_evaluate } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const oversizedState =
    'The support agent reviewed the account history in detail. '.repeat(12_000);

  try {
    await experimental_evaluate({
      model: typeSafeAi.evaluationModel('jev-latest'),
      state: oversizedState,
      questions: {
        reviewed: {
          type: 'boolean',
          instructions: 'Was the account reviewed?',
        },
      },
    });

    console.log('No error: the provider accepted the oversized state.');
  } catch (error) {
    if (!APICallError.isInstance(error)) throw error;

    console.log('Message:     ', error.message);
    console.log('Status code: ', error.statusCode);
    console.log('Retryable:   ', error.isRetryable);
    console.log('Raw body:    ', error.responseBody);
  }
});
