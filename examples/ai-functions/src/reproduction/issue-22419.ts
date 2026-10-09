import type { Experimental_DecisionModelV4 } from '@ai-sdk/provider';
import { experimental_evaluate, InvalidResponseDataError } from 'ai';
import assert from 'node:assert/strict';

const questions = {
  topic: {
    type: 'choice',
    instructions: 'Which topic?',
    criteria: { a: 'A', b: 'B', c: 'C' },
  },
} as const;

function createModel(probabilities: Record<'a' | 'b' | 'c', number>) {
  let callCount = 0;

  const model: Experimental_DecisionModelV4 = {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-evaluator',
    supportedQuestionTypes: ['choice'],
    async doDecide() {
      callCount++;
      return {
        rounding: { probabilityDecimals: 2 },
        answers: {
          topic: { type: 'choice', choice: 'b', probabilities },
        },
        usage: { inputTokens: 1, outputTokens: 1 },
        warnings: [],
      };
    },
  };

  return { model, getCallCount: () => callCount };
}

async function evaluate(model: Experimental_DecisionModelV4) {
  return await experimental_evaluate({
    model,
    state: { message: 'hello' },
    questions,
    maxRetries: 2,
  });
}

async function main() {
  const exactTie = createModel({ a: 0.44, b: 0.44, c: 0.12 });
  const exactTieResult = await evaluate(exactTie.model);
  assert.equal(exactTieResult.answers.topic.choice, 'b');
  assert.equal(exactTie.getCallCount(), 1);

  const roundedNearTie = createModel({ a: 0.44, b: 0.43, c: 0.13 });
  try {
    const roundedNearTieResult = await evaluate(roundedNearTie.model);
    assert.equal(roundedNearTieResult.answers.topic.choice, 'b');
    assert.equal(roundedNearTie.getCallCount(), 1);
  } catch (error) {
    if (
      InvalidResponseDataError.isInstance(error) &&
      error.message.includes(
        'Question "topic" did not select a highest-probability option.',
      )
    ) {
      assert.equal(roundedNearTie.getCallCount(), 1);
      throw new Error(
        'ISSUE_22419_REPRODUCED: experimental_evaluate rejected a selected choice within the declared probability rounding precision.',
        { cause: error },
      );
    }
    throw error;
  }
}

await main();
