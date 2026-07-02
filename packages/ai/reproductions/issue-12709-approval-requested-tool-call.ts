import { convertToModelMessages } from '../src/ui/convert-to-model-messages';

async function main() {
  const uiMessages = [
    {
      role: 'user' as const,
      parts: [{ type: 'text' as const, text: 'Book lunch.' }],
    },
    {
      role: 'assistant' as const,
      parts: [
        {
          type: 'text' as const,
          text: 'I need approval before scheduling lunch.',
          state: 'done' as const,
        },
        {
          type: 'tool-scheduleLunch',
          state: 'approval-requested' as const,
          toolCallId: 'call_issue_12709',
          input: { time: '12:00' },
        },
      ],
    },
    {
      role: 'user' as const,
      parts: [
        {
          type: 'text' as const,
          text: 'Actually, make it 12:30 instead.',
        },
      ],
    },
  ];

  const modelMessages = await convertToModelMessages(uiMessages, {
    // This is what DirectChatTransport uses when converting UI messages for
    // another model request. approval-requested is also incomplete and should
    // be stripped here, just like input-streaming/input-available.
    ignoreIncompleteToolCalls: true,
  });

  console.log(JSON.stringify(modelMessages, null, 2));

  const leakedToolCall = modelMessages.some(
    message =>
      message.role === 'assistant' &&
      Array.isArray(message.content) &&
      message.content.some(
        part =>
          part.type === 'tool-call' &&
          part.toolCallId === 'call_issue_12709',
      ),
  );

  const matchingToolResult = modelMessages.some(
    message =>
      message.role === 'tool' &&
      Array.isArray(message.content) &&
      message.content.some(
        part =>
          part.type === 'tool-result' &&
          part.toolCallId === 'call_issue_12709',
      ),
  );

  if (leakedToolCall && !matchingToolResult) {
    throw new Error(
      [
        'Reproduced issue #12709:',
        'convertToModelMessages(..., { ignoreIncompleteToolCalls: true })',
        'kept an approval-requested tool call without a matching tool result.',
        'Submitting this history as the next request causes tool-result/function-call pairing errors.',
      ].join(' '),
    );
  }

  console.log(
    'Could not reproduce: approval-requested tool call was filtered or paired with a result.',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
