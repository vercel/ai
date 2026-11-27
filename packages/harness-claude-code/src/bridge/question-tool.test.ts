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

  test('maps canonical selected option ids and free-form note to Claude answer and annotations', () => {
    expect(
      toClaudeCodeQuestionResult({
        nativeInput,
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
        ...nativeInput,
        answers: { 'Which features?': 'Auth' },
        annotations: {
          'Which features?': { notes: 'only for the admin page' },
        },
      },
    });
  });

  test('maps free-form answer without selected options to Claude answer string', () => {
    expect(
      toClaudeCodeQuestionResult({
        nativeInput,
        output: {
          action: 'answered',
          answers: {
            'question-1': {
              optionIds: [],
              freeform: 'custom feature',
            },
          },
        },
      }),
    ).toEqual({
      behavior: 'allow',
      updatedInput: {
        ...nativeInput,
        answers: { 'Which features?': 'custom feature' },
      },
    });
  });

  test('maps canonical decline to native permission denial', () => {
    expect(
      toClaudeCodeQuestionResult({
        nativeInput,
        output: { action: 'declined' },
      }),
    ).toEqual({
      behavior: 'deny',
      message: 'The user declined the questions.',
    });
  });
});
