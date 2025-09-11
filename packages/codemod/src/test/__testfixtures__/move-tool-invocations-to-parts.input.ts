// @ts-nocheck
import { streamText } from 'ai';

async function example() {
  const messages = [];
  
  // example 1: pushing tool message
  messages.push({ role: 'tool', content: toolResponses });
  
  // example 2: tool message variable
  const toolMessage = { role: 'tool', content: 'Tool response' };
  
  // example 3: assistant message with toolInvocations
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
  messages.push({
    role: 'assistant',
    content: result.text,
    toolInvocations: result.toolCalls
  });
}