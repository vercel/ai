import { describe, expect, test } from 'vitest';
import {
  toHarnessQuestionsInput,
  toOpenCodeQuestionResponse,
  type OpenCodeQuestionRequest,
} from './question-tool';

const nativeRequest: OpenCodeQuestionRequest = {
  id: 'request-1',
  sessionID: 'session-1',
  questions: [
    {
      question: 'Which features?',
      header: 'Features',
      options: [
        { label: 'Auth', description: 'Authentication' },
        { label: 'Billing', description: 'Payments' },
      ],
      multiple: true,
      custom: true,
    },
    {
      question: 'Deploy now?',
      header: 'Deploy',
      options: [{ label: 'Yes', description: 'Deploy immediately' }],
    },
  ],
  tool: { messageID: 'message-1', callID: 'call-1' },
};

describe('OpenCode question translation', () => {
  test('preserves a native multi-question request as one canonical input', () => {
    expect(toHarnessQuestionsInput(nativeRequest)).toEqual({
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
        {
          id: 'question-2',
          question: 'Deploy now?',
          header: 'Deploy',
          options: [
            {
              id: 'option-1',
              label: 'Yes',
              description: 'Deploy immediately',
            },
          ],
        },
      ],
    });
  });

  test('maps partial canonical answers into ordered native answer arrays', () => {
    expect(
      toOpenCodeQuestionResponse({
        nativeRequest,
        output: {
          action: 'partially-answered',
          answers: {
            'question-1': {
              optionIds: ['option-2'],
              freeform: 'Analytics',
            },
          },
        },
      }),
    ).toEqual({
      action: 'reply',
      answers: [['Billing', 'Analytics'], []],
    });
  });

  test('maps decline and cancellation to native rejection', () => {
    expect(
      toOpenCodeQuestionResponse({
        nativeRequest,
        output: { action: 'cancelled' },
      }),
    ).toEqual({ action: 'reject' });
  });
});
