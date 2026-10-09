import type { LanguageModelV3Prompt } from '@ai-sdk/provider';
import { streamText, tool, type ModelMessage } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod';

const usage = {
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
};

type ScenarioOptions = {
  approved: boolean;
  trailingRole?: 'user' | 'system';
  includeExistingResult?: boolean;
  includeLaterAssistant?: boolean;
};

type ScenarioResult = {
  executeCount: number;
  providerCallCount: number;
  providerPrompt: LanguageModelV3Prompt | undefined;
  streamErrorName: string | undefined;
  toolResultOutputType: string | undefined;
};

function getToolResultOutputType(
  prompt: LanguageModelV3Prompt | undefined,
): string | undefined {
  for (const message of prompt ?? []) {
    if (message.role !== 'tool') {
      continue;
    }

    for (const part of message.content) {
      if (part.type === 'tool-result' && part.toolCallId === 'call-1') {
        return part.output.type;
      }
    }
  }

  return undefined;
}

async function runScenario({
  approved,
  trailingRole,
  includeExistingResult = false,
  includeLaterAssistant = false,
}: ScenarioOptions): Promise<ScenarioResult> {
  let executeCount = 0;
  let streamError: unknown;

  const model = new MockLanguageModelV3({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: 'text-start', id: 'text-1' },
        {
          type: 'text-delta',
          id: 'text-1',
          delta: 'Model continued.',
        },
        { type: 'text-end', id: 'text-1' },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage,
        },
      ]),
    }),
  });

  const toolMessageContent: Extract<ModelMessage, { role: 'tool' }>['content'] =
    [
      {
        type: 'tool-approval-response',
        approvalId: 'approval-1',
        approved,
      },
    ];

  if (includeExistingResult) {
    toolMessageContent.push({
      type: 'tool-result',
      toolCallId: 'call-1',
      toolName: 'performAction',
      output: { type: 'text', value: 'action completed' },
    });
  }

  const messages: ModelMessage[] = [
    { role: 'user', content: 'Perform the approved action.' },
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'performAction',
          input: { value: 'approved side effect' },
        },
        {
          type: 'tool-approval-request',
          approvalId: 'approval-1',
          toolCallId: 'call-1',
        },
      ],
    },
    {
      role: 'tool',
      content: toolMessageContent,
    },
  ];

  if (includeLaterAssistant) {
    messages.push({
      role: 'assistant',
      content: 'A later assistant response superseded the approval turn.',
    });
  }

  if (trailingRole != null) {
    messages.push({
      role: trailingRole,
      content: 'Supplemental context added before resuming.',
    });
  }

  const result = streamText({
    model,
    messages,
    allowSystemInMessages: true,
    tools: {
      performAction: tool({
        inputSchema: z.object({ value: z.string() }),
        needsApproval: true,
        execute: async () => {
          executeCount++;
          return 'action completed';
        },
      }),
    },
    onError: ({ error }) => {
      streamError = error;
    },
  });

  await result.consumeStream();

  const providerPrompt = model.doStreamCalls[0]?.prompt;

  return {
    executeCount,
    providerCallCount: model.doStreamCalls.length,
    providerPrompt,
    streamErrorName:
      streamError instanceof Error ? streamError.name : undefined,
    toolResultOutputType: getToolResultOutputType(providerPrompt),
  };
}

function wasRejectedBeforeProvider(result: ScenarioResult): boolean {
  return (
    result.providerCallCount === 0 &&
    result.streamErrorName === 'AI_MissingToolResultsError'
  );
}

function approvedApprovalWasHandled(result: ScenarioResult): boolean {
  return (
    (result.executeCount === 1 &&
      result.providerCallCount === 1 &&
      result.toolResultOutputType === 'text') ||
    wasRejectedBeforeProvider(result)
  );
}

function deniedApprovalWasHandled(result: ScenarioResult): boolean {
  return (
    (result.executeCount === 0 &&
      result.providerCallCount === 1 &&
      result.toolResultOutputType === 'execution-denied') ||
    wasRejectedBeforeProvider(result)
  );
}

async function main() {
  const scenarios = {
    immediateApproved: await runScenario({ approved: true }),
    approvedThenUser: await runScenario({
      approved: true,
      trailingRole: 'user',
    }),
    approvedThenSystem: await runScenario({
      approved: true,
      trailingRole: 'system',
    }),
    deniedThenUser: await runScenario({
      approved: false,
      trailingRole: 'user',
    }),
    deniedThenSystem: await runScenario({
      approved: false,
      trailingRole: 'system',
    }),
    completedThenUser: await runScenario({
      approved: true,
      trailingRole: 'user',
      includeExistingResult: true,
    }),
    olderApprovalAfterLaterAssistant: await runScenario({
      approved: true,
      trailingRole: 'user',
      includeLaterAssistant: true,
    }),
  };

  console.log(JSON.stringify(scenarios, null, 2));

  if (
    scenarios.immediateApproved.executeCount !== 1 ||
    scenarios.immediateApproved.toolResultOutputType !== 'text'
  ) {
    throw new Error(
      'Invalid control: an immediate approved local tool was not executed exactly once with a tool result.',
    );
  }

  if (
    scenarios.completedThenUser.executeCount !== 0 ||
    scenarios.completedThenUser.toolResultOutputType !== 'text'
  ) {
    throw new Error(
      'Invalid control: an approval with an existing tool result was not preserved without re-execution.',
    );
  }

  if (!approvedApprovalWasHandled(scenarios.approvedThenUser)) {
    throw new Error(
      `ISSUE_17033_REPRODUCED: approved local tool executed ${scenarios.approvedThenUser.executeCount} times after trailing user context (expected exactly once or rejection before provider invocation); provider was called ${scenarios.approvedThenUser.providerCallCount} time(s) with tool result type ${String(scenarios.approvedThenUser.toolResultOutputType)}.`,
    );
  }

  if (!approvedApprovalWasHandled(scenarios.approvedThenSystem)) {
    throw new Error(
      'ISSUE_17033_REPRODUCED: trailing system context silently skipped an approved local tool.',
    );
  }

  if (!deniedApprovalWasHandled(scenarios.deniedThenUser)) {
    throw new Error(
      'ISSUE_17033_REPRODUCED: trailing user context silently skipped the normal denial result.',
    );
  }

  if (!deniedApprovalWasHandled(scenarios.deniedThenSystem)) {
    throw new Error(
      'ISSUE_17033_REPRODUCED: trailing system context silently skipped the normal denial result.',
    );
  }

  if (
    scenarios.olderApprovalAfterLaterAssistant.executeCount !== 0 ||
    !wasRejectedBeforeProvider(scenarios.olderApprovalAfterLaterAssistant)
  ) {
    throw new Error(
      'ISSUE_17033_REPRODUCED: an older unresolved approval was allowed through prompt validation after a later assistant response.',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
