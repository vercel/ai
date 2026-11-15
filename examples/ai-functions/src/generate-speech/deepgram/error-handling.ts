import { createDeepgram } from '@ai-sdk/deepgram';
import { APICallError } from '@ai-sdk/provider';
import { generateSpeech } from 'ai';
import { run } from '../../lib/run';

/**
 * Checks that Deepgram error details survive to the caller.
 *
 * Deepgram's /v1/speak error body is `{"err_code","err_msg","request_id"}`
 * and the specific reason is often in the `dg-error` response header. If the
 * provider's error schema does not match that shape, the message falls back
 * to the HTTP reason phrase ("Bad Request") and the real cause is lost.
 *
 * Print `message` next to the raw `body` and the `dg-error` header: a
 * message that is only a status phrase while the body/header hold real text
 * means the schema does not match.
 */

const CASES: Array<{
  name: string;
  expect: string;
  run: () => Promise<unknown>;
}> = [
  {
    name: 'unknown voice (family composition)',
    expect: 'names the rejected voice or model',
    run: () =>
      generateSpeech({
        model: createDeepgram({}).speech('aura-2'),
        voice: 'not-a-real-voice',
        text: 'Hello, world!',
      }),
  },
  {
    name: 'out-of-range speed',
    expect: 'mentions the speed parameter or its range',
    run: () =>
      generateSpeech({
        model: createDeepgram({}).speech('aura-2'),
        voice: 'helena',
        speed: 2,
        text: 'Hello, world!',
      }),
  },
  {
    name: 'invalid api key',
    expect: 'mentions authentication',
    run: () =>
      generateSpeech({
        model: createDeepgram({ apiKey: 'not-a-real-key' }).speech('aura-2'),
        voice: 'helena',
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
        `  dg-error : ${apiError?.responseHeaders?.['dg-error'] ?? '-'}`,
      );
    }
  }
});
