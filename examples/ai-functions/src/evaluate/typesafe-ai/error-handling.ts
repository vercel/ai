import { typeSafeAi } from '@ai-sdk/typesafe-ai';
import { APICallError } from '@ai-sdk/provider';
import { experimental_evaluate } from 'ai';
import { run } from '../../lib/run';

// TypeSafe reports some failures as a bare code with no prose field, for
// example {"error_type":"max_tokens_exceeded"}. Oversizing `state` is the
// cheapest way to provoke one and see what the message resolves to.
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

    // Before error_type was read, every one of these printed the generic
    // 'TypeSafe request failed' no matter what the provider reported.
    console.log('Message:     ', error.message);
    console.log('Status code: ', error.statusCode);
    console.log('Retryable:   ', error.isRetryable);
    console.log('Raw body:    ', error.responseBody);
  }
});
