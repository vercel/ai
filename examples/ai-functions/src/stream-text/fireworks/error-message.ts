import { createFireworks } from '@ai-sdk/fireworks';
import { APICallError } from '@ai-sdk/provider';
import { streamText } from 'ai';
import { run } from '../../lib/run';

const MODEL = 'accounts/fireworks/models/kimi-k3';

const CASES = [
  {
    name: 'unknown field',
    expect: '400, names the rejected field',
    model: createFireworks({})(MODEL),
    providerOptions: { fireworks: { notARealField: 'x' } },
  },
  {
    name: 'unknown model',
    expect: '404, names the model',
    model: createFireworks({})('accounts/fireworks/models/not-a-real-model'),
  },
  {
    name: 'invalid api key',
    expect: '401, mentions the key',
    model: createFireworks({ apiKey: 'not-a-real-key' })(MODEL),
  },
];

run(async () => {
  for (const testCase of CASES) {
    let streamError: unknown;
    try {
      const result = streamText({
        model: testCase.model,
        prompt: 'Reply with only the word: ok',
        maxOutputTokens: 512,
        ...(testCase.providerOptions
          ? { providerOptions: testCase.providerOptions }
          : {}),
        onError: ({ error }) => {
          streamError = error;
        },
      });
      await result.consumeStream();
      if (streamError) throw streamError;
      console.log(`\n${testCase.name}  unexpectedly succeeded`);
    } catch (error) {
      const apiError = APICallError.isInstance(error) ? error : undefined;
      console.log(`\n${testCase.name}  (expect ${testCase.expect})`);
      console.log(`  status  : ${apiError?.statusCode ?? '-'}`);
      console.log(`  message : ${(error as Error)?.message}`);
      console.log(`  body    : ${apiError?.responseBody ?? '-'}`);
    }
  }

  console.log(
    '\nA message that is only "Bad Request" / "Not Found" / "" while the body\n' +
      'holds real text means the error schema no longer matches Fireworks.',
  );
});
