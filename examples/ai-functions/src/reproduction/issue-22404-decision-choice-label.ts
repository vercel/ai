import { InvalidResponseDataError } from '@ai-sdk/provider';
import { Experimental_DecisionLanguageModel as DecisionLanguageModel } from '@ai-sdk/provider-utils/experimental-decision';
import assert from 'node:assert/strict';
import { experimental_evaluate } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

const questions = {
  route: {
    type: 'choice',
    instructions: 'Return q0 as c0, c1, or c2. Do not return the label string.',
    criteria: {
      'deepseek-v4.1-flash': 'lightest',
      'glm-5.3': 'middle',
      'kimi-k3': 'heaviest',
    },
  },
} as const;

class ReproducedBugError extends Error {}

async function evaluateChoice(value: string) {
  const model = new DecisionLanguageModel({
    model: new MockLanguageModelV4({
      doGenerate: {
        content: [{ type: 'text', text: JSON.stringify({ q0: value }) }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage,
        warnings: [],
      },
    }),
  });

  return experimental_evaluate({
    model,
    state: { task: 'Dev review this PRD' },
    questions,
  });
}

async function main() {
  const codedResult = await evaluateChoice('c2');
  assert.deepEqual(codedResult.answers.route, {
    type: 'choice',
    choice: 'kimi-k3',
  });

  await assert.rejects(
    evaluateChoice('not-a-real-option'),
    error =>
      InvalidResponseDataError.isInstance(error) &&
      error.message.includes('Question "route" selected an unknown option.'),
  );

  try {
    const labelResult = await evaluateChoice('kimi-k3');
    assert.deepEqual(labelResult.answers.route, {
      type: 'choice',
      choice: 'kimi-k3',
    });
  } catch (error) {
    if (
      InvalidResponseDataError.isInstance(error) &&
      error.message.includes('Question "route" selected an unknown option.')
    ) {
      throw new ReproducedBugError(
        'ISSUE_22404_REPRODUCED: exact criteria label "kimi-k3" was rejected as an unknown option',
      );
    }
    throw error;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
