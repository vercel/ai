import { createXai } from '@ai-sdk/xai';
import { APICallError } from '@ai-sdk/provider';
import { generateSpeech } from 'ai';
import { run } from '../../lib/run';

/**
 * Checks that xAI error details survive to the caller.
 *
 * xAI's /v1/tts error body is usually `{"error":"..."}` (no code), while
 * other xAI APIs use `{"code":"...","error":"..."}` or the chat completions
 * `{"error":{"message":"..."}}` shape. If the provider's error schema does
 * not match the actual shape, the message falls back to the HTTP reason
 * phrase ("Bad Request", "Not Found") and the real cause is lost.
 *
 * Print `message` next to the raw `body`: a message that is only a status
 * phrase while the body holds real text means the schema does not match.
 */

const CASES: Array<{
  name: string;
  expect: string;
  run: () => Promise<unknown>;
}> = [
  {
    name: 'unknown voice',
    expect: 'names the rejected voice',
    run: () =>
      generateSpeech({
        model: createXai({}).speech(),
        voice: 'not-a-real-voice',
        text: 'Hello, world!',
      }),
  },
  {
    name: 'out-of-range speed',
    expect: 'mentions the speed range',
    run: () =>
      generateSpeech({
        model: createXai({}).speech(),
        speed: 2,
        text: 'Hello, world!',
      }),
  },
  {
    name: 'invalid replace key',
    expect: 'explains the replace key constraint',
    run: () =>
      generateSpeech({
        model: createXai({}).speech(),
        text: 'C++ is a language.',
        providerOptions: { xai: { replace: { 'C++': 'C plus plus' } } },
      }),
  },
  {
    name: 'invalid api key',
    expect: 'mentions authentication',
    run: () =>
      generateSpeech({
        model: createXai({ apiKey: 'not-a-real-key' }).speech(),
        text: 'Hello, world!',
      }),
  },
];

run(async () => {
  for (const testCase of CASES) {
    try {
      await testCase.run();
      console.log(`\n${testCase.name}  unexpectedly succeeded`);
    } catch (error) {
      const apiError = APICallError.isInstance(error) ? error : undefined;
      console.log(`\n${testCase.name}  (expect ${testCase.expect})`);
      console.log(`  status   : ${apiError?.statusCode ?? '-'}`);
      console.log(`  message  : ${(error as Error)?.message}`);
      console.log(`  body     : ${apiError?.responseBody ?? '-'}`);
      console.log(
        `  trace id : ${apiError?.responseHeaders?.['x-trace-id'] ?? '-'}`,
      );
    }
  }
});
