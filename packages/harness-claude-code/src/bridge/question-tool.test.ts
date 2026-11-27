import type { AskUserQuestionInput } from '@anthropic-ai/claude-agent-sdk/sdk-tools.js';
import { describe, expect, test } from 'vitest';
import {
  toClaudeCodeQuestionResult,
  toHarnessQuestionsInput,
} from './question-tool';

const nativeInput: AskUserQuestionInput = {
  questions: [
    {
      question: 'Which features?',
      header: 'Features',
      options: [
        { label: 'Auth', description: 'Authentication', preview: 'auth.ts' },
        { label: 'Billing', description: 'Payments' },
      ],
      multiSelect: true,
    },
  ],
};

describe('Claude Code question translation', () => {
  test('maps a native multi-select question to the canonical contract', () => {
    expect(toHarnessQuestionsInput(nativeInput)).toEqual({
      allowPartialAnswers: true,
      questions: [
        {
          id: 'question-1',
          question: 'Which features?',
          header: 'Features',
          options: [
            {
              id: 'option-1',
              label: 'Auth',
              description: 'Authentication',
              preview: 'auth.ts',
            },
            {
              id: 'option-2',
              label: 'Billing',
              description: 'Payments',
            },
          ],
          allowMultiple: true,
          allowFreeForm: true,
        },
      ],
    });
  });

  test('maps canonical selected option ids back to Claude answer strings', () => {
    expect(
      toClaudeCodeQuestionResult({
        nativeInput,
        output: {
          action: 'answered',
          answers: {
            'question-1': { optionIds: ['option-1', 'option-2'] },
          },
        },
      }),
    ).toEqual({
      behavior: 'allow',
      updatedInput: {
        ...nativeInput,
        answers: { 'Which features?': 'Auth, Billing' },
      },
    });
  });

  test.each([
    {
      multiSelect: false,
      optionIds: ['option-1'],
      freeform: 'only for the admin page',
      expectedAnswer: 'Auth',
      expectedNotes: 'only for the admin page',
    },
    {
      multiSelect: true,
      optionIds: ['option-1', 'option-2'],
      freeform: 'only for the admin page',
      expectedAnswer: 'Auth, Billing',
      expectedNotes: 'only for the admin page',
    },
    {
      multiSelect: true,
      optionIds: ['option-1', 'option-2'],
      freeform: '',
      expectedAnswer: 'Auth, Billing',
      expectedNotes: '',
    },
    {
      multiSelect: false,
      optionIds: ['option-2'],
      freeform: undefined,
      expectedAnswer: 'Billing',
    },
    {
      multiSelect: false,
      optionIds: [],
      freeform: 'only for the admin page',
      expectedAnswer: 'only for the admin page',
    },
    {
      multiSelect: false,
      optionIds: [],
      freeform: '',
      expectedAnswer: '',
    },
    {
      multiSelect: false,
      optionIds: [],
      freeform: undefined,
      expectedAnswer: '',
    },
    {
      multiSelect: true,
      optionIds: ['unknown', 'option-0', 'option-3'],
      freeform: 'only for the admin page',
      expectedAnswer: 'only for the admin page',
    },
  ])(
    'maps selections and notes: multiSelect=$multiSelect optionIds=$optionIds freeform=$freeform',
    scenario => {
      const questionInput: AskUserQuestionInput = {
        questions: [
          {
            ...nativeInput.questions[0],
            multiSelect: scenario.multiSelect,
          },
        ],
      };

      expect(
        toClaudeCodeQuestionResult({
          nativeInput: questionInput,
          output: {
            action: 'answered',
            answers: {
              'question-1': {
                optionIds: scenario.optionIds,
                freeform: scenario.freeform,
              },
            },
          },
        }),
      ).toEqual({
        behavior: 'allow',
        updatedInput: {
          ...questionInput,
          answers: { 'Which features?': scenario.expectedAnswer },
          ...(scenario.expectedNotes !== undefined
            ? {
                annotations: {
                  'Which features?': { notes: scenario.expectedNotes },
                },
              }
            : {}),
        },
      });
    },
  );

  test('keeps answers and notes keyed by question text and omits unanswered questions', () => {
    const questionInput: AskUserQuestionInput = {
      questions: [
        nativeInput.questions[0],
        { ...nativeInput.questions[0], question: 'Which admin features?' },
        { ...nativeInput.questions[0], question: 'Which other features?' },
      ],
    };

    expect(
      toClaudeCodeQuestionResult({
        nativeInput: questionInput,
        output: {
          action: 'answered',
          answers: {
            'question-1': {
              optionIds: ['option-1'],
              freeform: 'for everyone',
            },
            'question-2': {
              optionIds: ['option-2'],
              freeform: 'only for the admin page',
            },
          },
        },
      }),
    ).toEqual({
      behavior: 'allow',
      updatedInput: {
        ...questionInput,
        answers: {
          'Which features?': 'Auth',
          'Which admin features?': 'Billing',
        },
        annotations: {
          'Which features?': { notes: 'for everyone' },
          'Which admin features?': { notes: 'only for the admin page' },
        },
      },
    });
  });

  test('preserves native annotations when adding notes', () => {
    const questionInput: AskUserQuestionInput = {
      ...nativeInput,
      annotations: {
        'Which features?': { preview: 'auth.ts', notes: 'old note' },
        'Another question?': { notes: 'another note' },
      },
    };

    expect(
      toClaudeCodeQuestionResult({
        nativeInput: questionInput,
        output: {
          action: 'answered',
          answers: {
            'question-1': {
              optionIds: ['option-1'],
              freeform: 'only for the admin page',
            },
          },
        },
      }),
    ).toEqual({
      behavior: 'allow',
      updatedInput: {
        ...questionInput,
        answers: { 'Which features?': 'Auth' },
        annotations: {
          'Which features?': {
            preview: 'auth.ts',
            notes: 'only for the admin page',
          },
          'Another question?': { notes: 'another note' },
        },
      },
    });
    expect(questionInput.annotations?.['Which features?']?.notes).toBe(
      'old note',
    );
  });

  test.each(['declined', 'cancelled'] as const)(
    'maps canonical %s to native permission denial',
    action => {
      expect(
        toClaudeCodeQuestionResult({
          nativeInput,
          output: { action },
        }),
      ).toEqual({
        behavior: 'deny',
        message: `The user ${action} the questions.`,
      });
    },
  );
});
