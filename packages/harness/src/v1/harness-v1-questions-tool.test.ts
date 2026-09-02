import { describe, expect, test } from 'vitest';
import {
  harnessV1QuestionsToolInputSchema,
  harnessV1QuestionsToolOutputSchema,
} from './harness-v1-questions-tool';

describe('askUserQuestions schemas', () => {
  test('accepts the canonical question input', () => {
    expect(
      harnessV1QuestionsToolInputSchema.parse({
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
