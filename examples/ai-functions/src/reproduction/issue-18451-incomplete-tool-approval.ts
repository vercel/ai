import {
  convertToModelMessages,
  generateText,
  MissingToolResultsError,
  tool,
  type ModelMessage,
  type UIMessage,
} from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod/v4';

const tools = {
  git_sync: tool({
    description: 'Demo tool requiring approval',
    inputSchema: z.object({ message: z.string() }),
    needsApproval: true,
    execute: async () => 'ok',
  }),
};

function makeMessages(
  state: string | undefined,
  extra: Record<string, unknown> = {},
): UIMessage[] {
  return [
    {
      id: 'u1',
      role: 'user',
      parts: [{ type: 'text', text: 'sync my changes' }],
    },
    {
      id: 'a1',
      role: 'assistant',
      parts: [
        { type: 'step-start' },
        {
          type: 'tool-git_sync',
          toolCallId: 'toolu_1',
          state,
          input: { message: 'commit' },
          ...extra,
        } as any,
      ],
    },
    {
      id: 'u2',
      role: 'user',
      parts: [{ type: 'text', text: 'hello?' }],
    },
  ];
}

function hasIssueReportedOrphan(messages: ModelMessage[]): boolean {
  return (
    messages.some(
      message =>
        message.role === 'assistant' &&
        Array.isArray(message.content) &&
        message.content.some(part => part.type === 'tool-call'),
    ) && !messages.some(message => message.role === 'tool')
  );
}

function isMissingToolResultsError(error: unknown): boolean {
  if (MissingToolResultsError.isInstance(error)) {
    return true;
  }

  return (
    error instanceof Error &&
    'cause' in error &&
    isMissingToolResultsError(error.cause)
  );
}

async function nextGenerateThrowsMissingToolResults(
  messages: ModelMessage[],
): Promise<boolean> {
  try {
    await generateText({
      model: new MockLanguageModelV4({
        doGenerate: {
          content: [{ type: 'text', text: 'conversation remains usable' }],
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: {
            inputTokens: {
              total: 1,
              noCache: 1,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: 1,
              text: 1,
              reasoning: undefined,
            },
          },
          warnings: [],
        },
      }),
      messages,
      tools,
    });
    return false;
  } catch (error) {
    return isMissingToolResultsError(error);
  }
}

async function main() {
  const cases = [
    [
      'approval-requested',
      makeMessages('approval-requested', {
        approval: { id: 'appr_1' },
      }),
    ],
    [
      'approval-responded',
      makeMessages('approval-responded', {
        approval: { id: 'appr_1', approved: true },
      }),
    ],
    ['missing state', makeMessages(undefined)],
    ['control: input-available', makeMessages('input-available')],
  ] as const;

  const converted = new Map<string, ModelMessage[]>();

  for (const [name, messages] of cases) {
    const modelMessages = await convertToModelMessages(messages, {
      tools,
      ignoreIncompleteToolCalls: true,
    });
    converted.set(name, modelMessages);

    console.log(
      `${name}: orphan tool-call without tool-result: ${
        hasIssueReportedOrphan(modelMessages) ? 'YES' : 'no'
      }`,
    );
  }

  const approvalRequestedThrows = await nextGenerateThrowsMissingToolResults(
    converted.get('approval-requested')!,
  );
  const missingStateThrows = await nextGenerateThrowsMissingToolResults(
    converted.get('missing state')!,
  );

  console.log(
    `approval-requested next generateText MissingToolResultsError: ${
      approvalRequestedThrows ? 'YES' : 'no'
    }`,
  );
  console.log(
    `missing state next generateText MissingToolResultsError: ${
      missingStateThrows ? 'YES' : 'no'
    }`,
  );

  const reproduced =
    hasIssueReportedOrphan(converted.get('approval-requested')!) &&
    !hasIssueReportedOrphan(converted.get('approval-responded')!) &&
    hasIssueReportedOrphan(converted.get('missing state')!) &&
    !hasIssueReportedOrphan(converted.get('control: input-available')!) &&
    approvalRequestedThrows &&
    missingStateThrows;

  if (reproduced) {
    console.error(
      'ISSUE_18451_REPRODUCED: ignoreIncompleteToolCalls leaves approval-requested and missing-state tool calls that make generateText throw AI_MissingToolResultsError',
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    'ISSUE_18451_NOT_REPRODUCED: the reported conversion and next-generation failure did not both occur',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
