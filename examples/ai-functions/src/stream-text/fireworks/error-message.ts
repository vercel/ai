import { createFireworks } from '@ai-sdk/fireworks';
import { APICallError } from '@ai-sdk/provider';
import { streamText } from 'ai';
import { run } from '../../lib/run';

/**
 * Checks that a Fireworks error message survives to the caller.
 *
 * Fireworks returns errors as `{"error":{"object","type","code","message"}}`.
 * When the provider's error schema does not match that shape the parse fails
 * and the message falls back to the HTTP reason phrase — "Bad Request" over
 * HTTP/1.1, and the empty string over HTTP/2, where there is no reason phrase.
 * Either way the actual cause is lost.
 *
 * Each case below provokes a different error. The printed message should be
 * Fireworks' own text, not a bare status phrase:
 *
 *   unknown field  400  Extra inputs are not permitted, field: 'notARealField'
 *   unknown model  404  Model not found, inaccessible, and/or not deployed
 *   bad api key    401  invalid api key
 */

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
    // streamText's default onError writes the whole error object to stderr,
    // which buries the summary; capture it and report it ourselves.
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
      for await (const _ of result.textStream) {
        // drain; a request-time rejection surfaces here
      }
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
