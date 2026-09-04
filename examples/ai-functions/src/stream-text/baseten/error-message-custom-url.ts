import { createBaseten } from '@ai-sdk/baseten';
import { APICallError } from '@ai-sdk/provider';
import { streamText } from 'ai';
import { requireEnv } from '../../lib/require-env';
import { run } from '../../lib/run';

/**
 * The dedicated-deployment counterpart to `error-message.ts`, which covers the
 * Model APIs.
 *
 * The two surfaces do not return the same error envelope. The Model APIs send
 * `error` as a bare string, while a dedicated deployment passes through its
 * server's OpenAI-shaped `{ error: { message, code, param, type } }` object.
 * Both have to parse, or the message falls back to the HTTP reason phrase —
 * "Not Found" over HTTP/1.1, and the empty string over HTTP/2, which has none.
 *
 * Print `message` next to the raw `body`: a message that is only a status
 * phrase while the body holds real text means the schema does not match.
 */

run(async () => {
  const CHAT_MODEL_ID = requireEnv('CHAT_MODEL_ID'); // e.g. wx4r1y7q
  const CHAT_MODEL_URL = `https://model-${CHAT_MODEL_ID}.api.baseten.co/environments/production/sync/v1`;

  // The name the server advertises; see custom-url.ts for how to look it up.
  const CHAT_MODEL_NAME = requireEnv('CHAT_MODEL_NAME'); // e.g. Qwen/Qwen3.5-4B

  const CASES = [
    {
      // vLLM validates the model field and reports it in an object envelope.
      name: 'unknown model',
      expect: 'names the model — object envelope, from the server',
      model: createBaseten({ modelURL: CHAT_MODEL_URL })(
        'not-a-real-model-xyz',
      ),
    },
    {
      // Baseten authenticates at its edge, before the request reaches the
      // deployment, so this one comes back in the string envelope instead.
      name: 'invalid api key',
      expect: 'mentions the api key — string envelope, from Baseten',
      model: createBaseten({
        apiKey: 'not-a-real-key',
        modelURL: CHAT_MODEL_URL,
      })(CHAT_MODEL_NAME),
    },
  ];

  for (const testCase of CASES) {
    // streamText's default onError writes the whole error object to stderr,
    // which buries the summary; capture it and report it ourselves.
    let streamError: unknown;
    try {
      const result = streamText({
        model: testCase.model,
        prompt: 'Reply with only the word: ok',
        maxOutputTokens: 512,
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
