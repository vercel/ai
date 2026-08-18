import { google } from '@ai-sdk/google';
import assert from 'node:assert/strict';
import { APICallError, generateText } from 'ai';

const unsupportedMinimalMessage =
  'Thinking level MINIMAL is not supported for this model. Please retry with other thinking level.';

async function main() {
  const lowResult = await generateText({
    model: google('gemini-3.7-flash'),
    reasoning: 'low',
    prompt: 'Hello!',
  });

  assert.notEqual(
    lowResult.text.length,
    0,
    'The low-reasoning control request should return text.',
  );

  const rejectedReasoningLevels: Array<'minimal' | 'none'> = [];

  for (const reasoning of ['minimal', 'none'] as const) {
    try {
      const result = await generateText({
        model: google('gemini-3.7-flash'),
        reasoning,
        prompt: 'Hello!',
      });

      assert.notEqual(
        result.text.length,
        0,
        `The ${reasoning} reasoning request should return text.`,
      );
    } catch (error) {
      if (
        APICallError.isInstance(error) &&
        error.statusCode === 400 &&
        error.message === unsupportedMinimalMessage
      ) {
        rejectedReasoningLevels.push(reasoning);
        continue;
      }

      throw error;
    }
  }

  assert.deepEqual(
    rejectedReasoningLevels,
    [],
    'ISSUE_18986_REPRODUCED: gemini-3.7-flash rejected AI SDK reasoning "minimal" or "none" with unsupported MINIMAL thinking level',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
