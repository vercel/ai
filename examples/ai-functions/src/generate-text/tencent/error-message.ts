import { APICallError } from '@ai-sdk/provider';
import { createTencent } from '@ai-sdk/tencent';
import { generateText } from 'ai';
import { run } from '../../lib/run';

/**
 * Checks that TokenHub chat error details survive to the caller.
 *
 * Print `message` next to the raw `body`: a message that is only a status
 * phrase ("Bad Request") while the body holds real text means the error
 * schema does not match TokenHub's error envelope.
 */

const MODEL = 'hy4';

const CASES = [
  {
    name: 'unknown model',
    expect: 'names the model',
    model: createTencent({})('not-a-real-model'),
  },
  {
    name: 'out-of-range temperature',
    expect: '400, names the temperature parameter',
    model: createTencent({})(MODEL),
    temperature: 9,
  },
  {
    name: 'invalid api key',
    expect: '401, mentions the key',
    model: createTencent({ apiKey: 'sk-not-a-real-key' })(MODEL),
  },
];

run(async () => {
  for (const testCase of CASES) {
    try {
      await generateText({
        model: testCase.model,
        prompt: 'Reply with only the word: ok',
        maxOutputTokens: 256,
        ...(testCase.temperature != null
          ? { temperature: testCase.temperature }
          : {}),
        maxRetries: 0,
      });
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
