import {
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from 'ai';

async function main() {
  const messages: UIMessage[] = [
    {
      id: 'assistant-1',
      role: 'assistant',
      parts: [
        { type: 'step-start' },
        {
          type: 'dynamic-tool',
          toolName: 'providerTool',
          toolCallId: 'provider-call',
          state: 'approval-responded',
          input: {},
          approval: {
            id: 'provider-approval',
            approved: true,
          },
          providerExecuted: true,
        },
        {
          type: 'tool-localTool',
          toolCallId: 'local-call',
          state: 'output-denied',
          input: {},
          approval: {
            id: 'local-approval',
            approved: false,
          },
        },
      ],
    },
  ];

  const shouldContinue = lastAssistantMessageIsCompleteWithApprovalResponses({
    messages,
  });

  if (!shouldContinue) {
    console.error(
      'ISSUE #13670 REPRODUCED: automatic continuation stayed blocked after a tool approval reached output-denied',
    );
    process.exitCode = 1;
    return;
  }

  console.log('Automatic continuation accepted the denied terminal outcome.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
