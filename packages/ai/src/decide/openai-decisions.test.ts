import { createOpenAI } from '@ai-sdk/openai';
import { InvalidResponseDataError } from '@ai-sdk/provider';
import { expect, it, vi } from 'vitest';
import { decide } from './decide';

const questions = {
  team: {
    type: 'choice',
    instructions: 'Route the ticket.',
    criteria: { billing: 'Charges', technical: 'Bugs', other: null },
  },
  severity: {
    type: 'score',
    instructions: 'Rate severity.',
    criteria: ['Low', 'Medium', 'High'],
  },
  refund: { type: 'boolean', instructions: 'Is a refund requested?' },
} as const;
const answers = [
  {
    type: 'choice',
    name: 'team',
    choice: 'billing',
    confidence: 0.6,
    probabilities: [
      { value: 'billing', probability: 0.34 },
      { value: 'technical', probability: 0.33 },
      { value: 'other', probability: 0.32 },
    ],
  },
  {
    type: 'score',
    name: 'severity',
    score: 0.98,
    confidence: 0.79,
    probabilities: [
      { value: 0, probability: 0.08 },
      { value: 1, probability: 0.86 },
      { value: 2, probability: 0.06 },
    ],
  },
  { type: 'predicate', name: 'refund', probability: 0.96 },
];

function setup(responseAnswers: unknown = answers) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
    new Response(
      JSON.stringify({
        answers: responseAnswers,
        model: 'gpt-6-luna-resolved',
        usage: {
          input_tokens: 387,
          output_tokens: 3,
          total_tokens: 390,
          input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
          output_tokens_details: { reasoning_tokens: 0 },
        },
      }),
      {
        headers: { 'content-type': 'application/json' },
      },
    ),
  );
  return {
    model: createOpenAI({ apiKey: 'test', fetch }).decisionModel('gpt-6-luna'),
    fetch,
  };
}

it('decides native Decisions answers through core with rounded distributions and confidence intact', async () => {
  const { model, fetch } = setup();
  const result = await decide({
    model,
    state: { ticket: 'Charged twice.' },
    questions,
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe('https://api.openai.com/v1/decisions');
  expect(result.answers).toEqual({
    team: {
      type: 'choice',
      choice: 'billing',
      probabilities: { billing: 0.34, technical: 0.33, other: 0.32 },
    },
    severity: {
      type: 'score',
      score: 0.98,
      probabilities: { 0: 0.08, 1: 0.86, 2: 0.06 },
    },
    refund: { type: 'boolean', probability: 0.96 },
  });
  expect(result.providerMetadata).toEqual({
    openai: {
      confidence: { team: 0.6, severity: 0.79 },
      usage: {
        input_tokens: 387,
        output_tokens: 3,
        total_tokens: 390,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
        output_tokens_details: { reasoning_tokens: 0 },
      },
    },
  });
  expect(result.usage).toEqual({
    inputTokens: 387,
    outputTokens: 3,
    totalTokens: 390,
  });
  expect(result.response.modelId).toBe('gpt-6-luna-resolved');
  expect(result.rounding).toEqual({ probabilityDecimals: 2 });
});

it.each([
  { type: 'predicate', name: 'team', probability: 0.5 },
  { ...answers[0], choice: 'unknown' },
  { ...answers[0], choice: 'technical' },
  { ...answers[0], probabilities: [{ value: 'billing', probability: 1 }] },
  { ...answers[1], score: 1.5 },
  { ...answers[1], score: 3 },
])(
  'rejects invalid native semantics without returning partial results',
  async answer => {
    const replacement = answers.map(original =>
      original.name === answer.name ? answer : original,
    );
    await expect(
      decide({
        model: setup(replacement).model,
        state: 'Ticket',
        questions,
        maxRetries: 0,
      }),
    ).rejects.toBeInstanceOf(InvalidResponseDataError);
  },
);
