import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createPi } from '@ai-sdk/harness-pi';
import { createJustBashSandbox } from '@ai-sdk/sandbox-just-bash';
import type { TextStreamPart, ToolApprovalRequestOutput, ToolSet } from 'ai';

const failureSignal =
  'ISSUE_19156_REPRODUCED: approved builtin bash completed, but continueStream.fullStream emitted no tool-result or tool-error';

async function drain(
  stream: AsyncIterable<TextStreamPart<ToolSet>>,
): Promise<TextStreamPart<ToolSet>[]> {
  const parts: TextStreamPart<ToolSet>[] = [];
  for await (const part of stream) {
    parts.push(part);
  }
  return parts;
}

async function main(): Promise<void> {
  const piToolResultMessages: Array<{
    toolCallId: string;
    isError: boolean;
    content: unknown;
  }> = [];

  const agent = new HarnessAgent({
    harness: createPi({
      auth: 'anthropic',
      extensionFactories: [
        pi => {
          pi.on('message_end', event => {
            if (event.message.role === 'toolResult') {
              piToolResultMessages.push({
                toolCallId: event.message.toolCallId,
                isError: event.message.isError,
                content: event.message.content,
              });
            }
          });
        },
      ],
    }),
    sandbox: createJustBashSandbox({ cwd: '/work' }),
    permissionMode: 'allow-edits',
    activeTools: ['bash'],
  });

  const session = await agent.createSession();
  try {
    const initial = await agent.stream({
      session,
      prompt:
        'Use the bash tool exactly once to run `printf issue-19156`. Do not use any other tool.',
    });
    const initialParts = await drain(initial.fullStream);
    const approval = initialParts.find(
      (part): part is ToolApprovalRequestOutput<ToolSet> =>
        part.type === 'tool-approval-request' &&
        part.toolCall.toolName === 'bash',
    );

    if (approval == null) {
      throw new Error('Expected Pi to request approval for builtin bash.');
    }

    const continued = await agent.continueStream({
      session,
      toolApprovalContinuations: [
        {
          approvalResponse: {
            type: 'tool-approval-response',
            approvalId: approval.approvalId,
            approved: true,
          },
          toolCall: approval.toolCall,
        },
      ],
    });
    const continuedParts = await drain(continued.fullStream);

    const piResult = piToolResultMessages.find(
      message => message.toolCallId === approval.toolCall.toolCallId,
    );
    if (piResult == null) {
      throw new Error(
        'Pi did not emit message_end with role toolResult for the approved bash call.',
      );
    }
    const piResultText = (
      Array.isArray(piResult.content) ? piResult.content : []
    )
      .filter(
        (part): part is { type: 'text'; text: string } =>
          typeof part === 'object' &&
          part != null &&
          'type' in part &&
          part.type === 'text' &&
          'text' in part &&
          typeof part.text === 'string',
      )
      .map(part => part.text)
      .join('');
    if (piResult.isError || !piResultText.includes('issue-19156')) {
      throw new Error(
        'The approved bash command did not complete successfully with the expected output.',
      );
    }

    const emittedOutcomes = continuedParts.filter(
      part =>
        (part.type === 'tool-result' || part.type === 'tool-error') &&
        part.toolCallId === approval.toolCall.toolCallId,
    );

    console.log(
      JSON.stringify(
        {
          approvedToolCallId: approval.toolCall.toolCallId,
          piToolResult: piResult,
          continuedPartTypes: continuedParts.map(part => part.type),
          continuedOutcomes: emittedOutcomes,
        },
        null,
        2,
      ),
    );

    if (emittedOutcomes.length === 0) {
      console.error(failureSignal);
      process.exitCode = 1;
    } else if (emittedOutcomes.length !== 1) {
      throw new Error(
        `Expected exactly one continued tool outcome, received ${emittedOutcomes.length}.`,
      );
    }
  } finally {
    await session.destroy();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
