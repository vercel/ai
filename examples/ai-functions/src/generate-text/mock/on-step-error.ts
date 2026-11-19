import { generateText } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { run } from '../../lib/run';

run(async () => {
  const abortController = new AbortController();
  setTimeout(() => abortController.abort(), 100);

  try {
    await generateText({
      model: new MockLanguageModelV4({
        // the provider call runs until it is aborted:
        doGenerate: ({ abortSignal }) =>
          new Promise((_, reject) => {
            abortSignal?.addEventListener('abort', () =>
              reject(abortSignal.reason),
            );
          }),
      }),
      prompt: 'Hello, test!',
      abortSignal: abortController.signal,
      onStepStart: ({ stepNumber }) => {
        console.log(`step ${stepNumber} started`);
      },
      onStepEnd: ({ stepNumber }) => {
        console.log(`step ${stepNumber} ended`);
      },
      onStepError: ({ stepNumber, error }) => {
        console.log(`step ${stepNumber} failed:`, error);
      },
    });
  } catch (error) {
    console.log('generateText rejected:', error);
  }
});
