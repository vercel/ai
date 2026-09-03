import type { InferToolOutput } from '@ai-sdk/provider-utils';
import { describe, expect, expectTypeOf, test } from 'vitest';
import {
  type HarnessV1QuestionsToolOutput,
  type harnessV1QuestionsTool,
  harnessV1QuestionsToolInputSchema,
  harnessV1QuestionsToolOutputSchema,
} from './harness-v1-questions-tool';

describe('askUserQuestions schemas', () => {
  test('exposes the question response as its tool output type', () => {
    expectTypeOf<
      InferToolOutput<typeof harnessV1QuestionsTool>
    >().toEqualTypeOf<HarnessV1QuestionsToolOutput>();
  });

  test('accepts the canonical question input', () => {
    expect(
      harnessV1QuestionsToolInputSchema.parse({
        allowPartialAnswers: true,
        questions: [
          {
            id: 'framework',
            question: 'Which framework?',
            header: 'Framework',
            options: [
              {
                id: 'react',
                label: 'React',
                description: 'Use React.',
                preview: '<App />',
              },
            ],
            allowMultiple: false,
            allowFreeForm: { secret: true },
          },
        ],
      }),
    ).toEqual({
      allowPartialAnswers: true,
      questions: [
        {
          id: 'framework',
          question: 'Which framework?',
          header: 'Framework',
          options: [
            {
              id: 'react',
              label: 'React',
              description: 'Use React.',
              preview: '<App />',
            },
          ],
          allowMultiple: false,
          allowFreeForm: { secret: true },
        },
      ],
    });
  });

  test('requires the partial answer capability', () => {
    expect(() =>
      harnessV1QuestionsToolInputSchema.parse({
        questions: [{ id: 'framework', question: 'Which framework?' }],
      }),
    ).toThrow();
  });

  test.each([
    {
      action: 'answered',
      answers: { framework: { optionIds: ['react'], freeform: 'notes' } },
    },
    {
      action: 'partially-answered',
      answers: { framework: { optionIds: [] } },
    },
    { action: 'declined' },
    { action: 'cancelled' },
  ])('accepts $action output', output => {
    expect(harnessV1QuestionsToolOutputSchema.parse(output)).toEqual(output);
  });
});
