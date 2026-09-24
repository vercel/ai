import { createBaseten } from '@ai-sdk/baseten';
import { APICallError } from '@ai-sdk/provider';
import { streamText } from 'ai';
import { run } from '../../lib/run';

/**
 * Checks that a Baseten error message survives to the caller.
 *
 * When the provider's error schema does not match the body Baseten actually
 * returns, the parse fails and the message falls back to the HTTP reason
 * phrase — "Not Found" over HTTP/1.1, and the empty string over HTTP/2, which
 * has no reason phrase. Either way the real cause is lost.
 *
 * Print `message` next to the raw `body`: a message that is only a status
 * phrase while the body holds real text means the schema does not match.
 */

const MODEL = 'openai/gpt-oss-120b';

const CASES = [
  {
    name: 'unknown model',
    expect: 'names the model, or says it is not deployed',
    model: createBaseten({})('not-a-real-model-xyz'),
  },
  {
    name: 'invalid api key',
    expect: 'mentions authentication',
    model: createBaseten({ apiKey: 'not-a-real-key' })(MODEL),
  },
  {
    name: 'unknown field',
    expect: 'names the rejected field, if Baseten validates strictly',
    model: createBaseten({})(MODEL),
    providerOptions: { baseten: { notARealField: 'x' } },
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
});
