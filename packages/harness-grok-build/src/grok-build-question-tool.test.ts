import type { ToolResultPart } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import { grokBuildAskUserQuestions } from './grok-build-question-tool';

const nativeRequest = {
  sessionId: 'session-1',
  toolCallId: 'call-1',
  mode: 'default',
  questions: [
    {
      question: 'Which framework?',
      options: [
        { label: 'React', description: 'React framework' },
        { label: 'Vue', description: 'Vue framework' },
      ],
      multi_select: false,
    },
  ],
} as const;

describe('grokBuildAskUserQuestions', () => {
  it('translates the native request', () => {
    expect(
      grokBuildAskUserQuestions.fromNativeRequest({
        nativeRequest,
      }),
    ).toMatchInlineSnapshot(`
      {
        "input": "{"allowPartialAnswers":true,"questions":[{"id":"question-1","question":"Which framework?","options":[{"id":"option-1","label":"React","description":"React framework"},{"id":"option-2","label":"Vue","description":"Vue framework"}],"allowMultiple":false,"allowFreeForm":true}]}",
        "nativeName": "ask_user_question",
        "providerExecuted": false,
        "toolCallId": "call-1",
        "toolName": "askUserQuestions",
        "type": "tool-call",
      }
    `);
  });

  it('translates selected and freeform answers', () => {
    const toolResult = {
      type: 'tool-result',
      toolCallId: 'call-1',
      toolName: 'askUserQuestions',
      output: {
        type: 'json',
        value: {
          action: 'answered',
          answers: {
            'question-1': {
              optionIds: ['option-1'],
              freeform: 'Svelte',
            },
          },
        },
      },
    } satisfies ToolResultPart;
    expect(
      grokBuildAskUserQuestions.toNativeResponse({
        nativeRequest,
        toolResult,
      }),
    ).toMatchInlineSnapshot(`
      {
        "annotations": {
          "Which framework?": {
            "notes": "Svelte",
          },
        },
        "answers": {
          "Which framework?": [
            "React",
            "Other",
          ],
        },
        "outcome": "accepted",
      }
    `);
  });
});
