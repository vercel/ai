import { streamText } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: new MockLanguageModelV4({
      doStream: async () => ({
        // the stream ends without output or a finish chunk:
        stream: convertArrayToReadableStream([
          { type: 'stream-start', warnings: [] },
        ]),
      }),
    }),
    prompt: 'Hello, test!',
    onError: () => {},
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

  await result.consumeStream();

  try {
    await result.text;
  } catch (error) {
    console.log('text rejected:', error);
  }
});
