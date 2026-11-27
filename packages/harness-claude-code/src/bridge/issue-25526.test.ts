import { readFileSync } from 'node:fs';
import type { HarnessV1QuestionsToolOutput } from '@ai-sdk/harness';
import type { AskUserQuestionInput } from '@anthropic-ai/claude-agent-sdk/sdk-tools.js';
import { describe, expect, test } from 'vitest';
import { toClaudeCodeQuestionResult } from './question-tool';

const fixture = JSON.parse(
  readFileSync(
    new URL('./__fixtures__/issue-25526.json', import.meta.url),
    'utf8',
  ),
) as {
  nativeInput: AskUserQuestionInput;
  harnessOutput: HarnessV1QuestionsToolOutput;
};

describe('issue #25526: preserve the complete answer delivered to Claude', () => {
  test.each([
    {
      multiSelect: false,
      optionIds: ['option-1'],
      freeform: 'only for the admin page',
    },
    {
      multiSelect: true,
      optionIds: ['option-1', 'option-2'],
      freeform: 'only for the admin page',
    },
    { multiSelect: true, optionIds: ['option-1', 'option-2'], freeform: '' },
    {
      multiSelect: true,
      optionIds: ['option-1', 'option-2'],
      freeform: undefined,
    },
    { multiSelect: false, optionIds: [], freeform: 'only for the admin page' },
  ])(
    'multiSelect=$multiSelect optionIds=$optionIds freeform=$freeform',
    scenario => {
      const nativeInput: AskUserQuestionInput = {
        ...fixture.nativeInput,
        questions: [
          {
            ...fixture.nativeInput.questions[0],
            multiSelect: scenario.multiSelect,
          },
        ],
      };
      const result = toClaudeCodeQuestionResult({
        nativeInput,
        output: {
          action: 'answered',
          answers: {
            'question-1': {
              optionIds: scenario.optionIds,
              freeform: scenario.freeform,
            },
          },
        },
      });
      expect(result.behavior).toBe('allow');
      if (result.behavior !== 'allow')
        throw new Error('Expected an answered question to be allowed');
      const question = nativeInput.questions[0];
      const received = result.updatedInput.answers[question.question];
      if (scenario.optionIds.length === 0) {
        expect(received).toBe(scenario.freeform);
        return;
      }
      for (const optionId of scenario.optionIds) {
        const label =
          question.options[Number(optionId.slice('option-'.length)) - 1].label;
        expect(
          received,
          'ISSUE_25526: selected option labels are missing from the answer delivered to Claude',
        ).toContain(label);
      }
      if (scenario.freeform !== undefined) {
        expect(
          result.updatedInput.annotations?.[question.question]?.notes,
        ).toBe(scenario.freeform);
      }
    },
  );

  test('replays the live two-option answer with its note', () => {
    const result = toClaudeCodeQuestionResult({
      nativeInput: fixture.nativeInput,
      output: fixture.harnessOutput,
    });
    expect(result).toMatchObject({
      behavior: 'allow',
      updatedInput: {
        answers: {
          'Which features?': expect.stringContaining('Auth'),
        },
        annotations: {
          'Which features?': { notes: 'only for the admin page' },
        },
      },
    });
    if (result.behavior === 'allow') {
      expect(result.updatedInput.answers['Which features?']).toContain(
        'Billing',
      );
    }
  });
});
