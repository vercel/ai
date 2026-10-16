import { createPerplexity } from '@ai-sdk/perplexity';
import {
  createProviderRegistry,
  experimental_decide as decide,
  Experimental_DecisionUnsupportedQuestionTypeError,
  InvalidResponseDataError,
} from 'ai';
import { expect, expectTypeOf, it, vi } from 'vitest';

// Mock HTTP responses exercise the published provider through Core without API credentials.
const questions = {
  team: {
    type: 'choice',
    instructions: { task: 'Route the ticket' },
    criteria: { billing: ['Payments'], other: null },
  },
  severity: {
    type: 'score',
    instructions: 'Rate severity',
    criteria: ['Low', 'Medium', 'High'],
  },
  refund: {
    type: 'boolean',
    instructions: 'Is a refund requested?',
    criteria: { true: 'Asks for money back', false: 'Only asks for status' },
  },
} as const;

const answers = {
  team: {
    type: 'choice',
    choice: 'billing',
    confidence: 0.8,
    probabilities: { billing: 0.987654321, other: 0.012345679 },
  },
  severity: {
    type: 'score',
    score: 1.6,
    confidence: 0.75,
    probabilities: { '0': 0.1, '1': 0.2, '2': 0.7 },
    legend: { '0': 'Low', '1': 'Medium', '2': 'High' },
  },
  refund: { type: 'noul', noul: 0.9123456789 },
};

function setup(responseAnswers: unknown = answers) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          model: 'pplx-decider-latest',
          answers: responseAnswers,
          usage: { input_tokens: 30, output_tokens: 3 },
        }),
        {
          headers: {
            'content-type': 'application/json',
            'x-request-id': 'request-123',
          },
        },
      ),
  );
  const perplexity = createPerplexity({ apiKey: 'test-key', fetch });
  return {
    perplexity,
    fetch,
    model: perplexity.decisionModel('pplx-decider-latest'),
  };
}

it('decides all native question types through a registry with full precision and inferred choices', async () => {
  const { perplexity, fetch } = setup();
  const registry = createProviderRegistry({ perplexity });
  const result = await decide({
    model: registry.decisionModel('perplexity:pplx-decider-latest'),
    state: { ticket: 'Charged twice. Please refund the extra payment.' },
    questions,
  });
  expectTypeOf(result.answers.team.choice).toEqualTypeOf<'billing' | 'other'>();
  expect(result.answers).toEqual({
    team: {
      type: 'choice',
      choice: 'billing',
      probabilities: answers.team.probabilities,
    },
    severity: {
      type: 'score',
      score: 1.6,
      probabilities: answers.severity.probabilities,
    },
    refund: { type: 'boolean', probability: answers.refund.noul },
  });
  expect(result.rounding).toBeUndefined();
  expect(result.usage).toEqual({
    inputTokens: 30,
    outputTokens: 3,
    totalTokens: 33,
  });
  expect(result.response.id).toBe('request-123');
  expect(result.providerMetadata?.perplexity).toEqual({
    confidence: { team: 0.8, severity: 0.75 },
    legend: { severity: answers.severity.legend },
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetch.mock.calls[0][1]?.body as string)).toMatchObject({
    state: { ticket: 'Charged twice. Please refund the extra payment.' },
    questions: {
      team: questions.team,
      refund: { ...questions.refund, type: 'noul' },
    },
  });
});

it('prepares SDK image data URLs and preserves nested native images', async () => {
  const { model, fetch } = setup();
  const image = {
    type: 'image_url',
    image_url: { url: 'data:image/png;base64,iVBORw==' },
  };
  await decide({
    model,
    questions,
    state: [
      { type: 'text', text: 'Inspect' },
      {
        type: 'file',
        mediaType: 'image/png',
        data: 'data:image/png;base64,iVBORw==',
      },
      { type: 'json', value: { product: { photos: [image] } } },
    ],
  });
  expect(JSON.parse(fetch.mock.calls[0][1]?.body as string).state).toEqual([
    'Inspect',
    image,
    { product: { photos: [image] } },
  ]);
});

it.each([
  { ...answers, team: { ...answers.team, choice: 'unknown' } },
  { ...answers, team: { ...answers.team, choice: 'other' } },
  {
    ...answers,
    team: { ...answers.team, probabilities: { billing: 0.7, other: 0.29 } },
  },
  { ...answers, team: { ...answers.team, probabilities: { billing: 1 } } },
  { ...answers, severity: { ...answers.severity, score: 1.5 } },
  { ...answers, severity: { ...answers.severity, score: 3 } },
  {
    ...answers,
    refund: { type: 'choice', choice: 'yes', probabilities: { yes: 1 } },
  },
])(
  'rejects invalid native semantics without normalization or retries',
  async responseAnswers => {
    const { model, fetch } = setup(responseAnswers);
    await expect(
      decide({ model, state: 'Ticket', questions }),
    ).rejects.toBeInstanceOf(InvalidResponseDataError);
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);

it('rejects unsupported questions before preparing files or calling the provider', async () => {
  const { model, fetch } = setup();
  await expect(
    decide({
      model,
      state: [
        {
          type: 'file',
          mediaType: 'image/png',
          data: new URL('https://example.com/image.png'),
        },
      ],
      questions: { box: { type: 'box', instructions: 'Find the product' } },
    }),
  ).rejects.toBeInstanceOf(Experimental_DecisionUnsupportedQuestionTypeError);
  expect(fetch).not.toHaveBeenCalled();
});

it('uses Core retries for rate limits and preserves the final result', async () => {
  const { model, fetch } = setup();
  fetch.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        error: {
          code: null,
          type: 'too_many_requests',
          message: 'Rate limited',
        },
      }),
      {
        status: 429,
        headers: { 'content-type': 'application/json', 'retry-after': '0' },
      },
    ),
  );
  const result = await decide({ model, state: 'Ticket', questions });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(result.answers.refund.probability).toBe(answers.refund.noul);
});
