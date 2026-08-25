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
          type: 'tool-getWeather',
          toolCallId: 'approved-call',
          state: 'approval-responded',
          input: { city: 'Tokyo' },
          approval: {
            id: 'approved-approval',
            approved: true,
          },
        },
        {
          type: 'tool-deleteCalendarEvent',
          toolCallId: 'denied-call',
          state: 'output-denied',
          input: { eventId: 'event-1' },
          approval: {
            id: 'denied-approval',
            approved: false,
            reason: 'The user denied this tool call.',
          },
        },
      ],
    },
  ];

  const shouldContinue = lastAssistantMessageIsCompleteWithApprovalResponses({
    messages,
  });

  console.log(
    JSON.stringify(
      {
        expected: true,
        observed: shouldContinue,
        terminalToolStates: ['approval-responded', 'output-denied'],
      },
      null,
      2,
    ),
  );

  if (!shouldContinue) {
    throw new Error(
      'Issue #13670 reproduced: automatic continuation remained blocked after all tool approvals reached terminal states, including output-denied.',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
