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
