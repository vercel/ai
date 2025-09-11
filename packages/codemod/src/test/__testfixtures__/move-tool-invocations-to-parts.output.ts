// @ts-nocheck
import { streamText } from 'ai';

async function example() {
  const messages = [];
  
  // example 1: pushing tool message
  /* FIXME(@ai-sdk-upgrade-v5): Tool invocations should now be handled as parts in the message stream, not pushed as separate messages. Review the streaming documentation for the new pattern. */
  messages.push({ role: 'tool', content: toolResponses });
  
  // example 2: tool message variable
  /* FIXME(@ai-sdk-upgrade-v5): Tool role messages are now handled as parts. Update to use the new streaming pattern. */
  const toolMessage = { role: 'tool', content: 'Tool response' };
  
  // example 3: assistant message with toolInvocations
  /* FIXME(@ai-sdk-upgrade-v5): toolInvocations in assistant messages are now streamed as parts. Update to handle tool-call parts in the stream. */
  const assistantMessage = {
    role: 'assistant',
    content: 'I will help you',
    toolInvocations: [
      { toolName: 'weather', args: { location: 'NYC' } }
    ]
  };
  
  // example 4: logging tool invocations
  console.log('Tool invocations:', assistantMessage.toolInvocations);
  
  // example 5: complex case
  /* FIXME(@ai-sdk-upgrade-v5): toolInvocations in assistant messages are now streamed as parts. Update to handle tool-call parts in the stream. */
  messages.push({
    role: 'assistant',
    content: result.text,
    toolInvocations: result.toolCalls
  });
}