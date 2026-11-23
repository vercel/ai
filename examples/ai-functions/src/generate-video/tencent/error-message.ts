import { APICallError } from '@ai-sdk/provider';
import { createTencent } from '@ai-sdk/tencent';
import { experimental_generateVideo as generateVideo } from 'ai';
import { run } from '../../lib/run';

/**
 * Checks that TokenHub Kling and VOD error details survive to the caller.
 *
 * Every case is rejected when the task is submitted, so no video is
 * generated. Print `message` next to the raw `body`: a message that is only a
 * status phrase while the body holds real text means the error schema does
 * not match. VOD reports errors with HTTP 200 and `Response.Error`, so its
 * status is derived from the error code.
 */

const CASES: Array<{
  name: string;
  expect: string;
  run: () => Promise<unknown>;
}> = [
  {
    name: 'TokenHub: unknown Kling model',
    expect: 'names the model',
    run: () =>
      generateVideo({
        model: createTencent({}).video('kling-video-v99'),
        prompt: 'A cat walking on a beach',
        maxRetries: 0,
      }),
  },
  {
    // TokenHub does not enforce the documented duration range (an
    // out-of-range duration still generates a video), so use an input that
    // cannot produce output.
    name: 'TokenHub: unreachable first-frame image',
    expect: 'rejected at submit, or a failed task naming the image',
    run: () =>
      generateVideo({
        model: createTencent({}).video('kling-video-v3'),
        prompt: {
          image: 'https://example.com/does-not-exist.png',
          text: 'A cat walking on a beach',
        },
        maxRetries: 0,
      }),
  },
  {
    name: 'TokenHub: invalid api key',
    expect: '401, mentions the key',
    run: () =>
      generateVideo({
        model: createTencent({ apiKey: 'sk-not-a-real-key' }).video(
          'kling-video-v3',
        ),
        prompt: 'A cat walking on a beach',
        maxRetries: 0,
      }),
  },
  {
    name: 'VOD: unknown model version',
    expect: '400, InvalidParameterValue naming the version',
    run: () =>
      generateVideo({
        model: createTencent({}).video('vod/VS/9.9'),
        prompt: 'A cat walking on a beach',
        maxRetries: 0,
      }),
  },
  {
    name: 'VOD: out-of-range duration',
    expect: '400, mentions duration',
    run: () =>
      generateVideo({
        model: createTencent({}).video('vod/VS/2.0'),
        prompt: 'A cat walking on a beach',
        duration: 99,
        maxRetries: 0,
      }),
  },
  {
    name: 'VOD: wrong SecretKey',
    expect: '401, AuthFailure.SignatureFailure',
    run: () =>
      generateVideo({
        model: createTencent({ secretKey: 'not-a-real-secret-key' }).video(
          'vod/VS/2.0',
        ),
        prompt: 'A cat walking on a beach',
        maxRetries: 0,
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
      console.log(`  status    : ${apiError?.statusCode ?? '-'}`);
      console.log(`  retryable : ${apiError?.isRetryable ?? '-'}`);
      console.log(`  message   : ${(error as Error)?.message}`);
      console.log(`  body      : ${apiError?.responseBody ?? '-'}`);
    }
  }
});
