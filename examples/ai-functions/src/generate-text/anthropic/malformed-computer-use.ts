import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  // Replay a malformed computer call and its existing validation error.
  // The provider must keep both entries so Claude can recover from the error.
  const result = await generateText({
    model: anthropic('claude-opus-5-5'),
    tools: {
      computer: anthropic.tools.computerToolset_20260801({}),
    },
    messages: [
      { role: 'user', content: 'Move the mouse to position [1, 2].' },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'computer-call-1',
            toolName: 'computer',
            // A computer call needs an action such as "mouse_move".
            input: { action: null, coordinate: [1, 2] },
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            // Match the error result to the malformed call above.
            toolCallId: 'computer-call-1',
            toolName: 'computer',
            output: {
              type: 'error-text',
              value:
                'Invalid input for tool computer: action must be a valid computer operation.',
            },
          },
        ],
      },
    ],
  });

  // Claude can acknowledge the error or request a corrected computer operation.
  print('Content:', result.content);
});
