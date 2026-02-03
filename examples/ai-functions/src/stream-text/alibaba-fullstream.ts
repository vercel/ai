import { alibaba } from '@ai-sdk/alibaba';
import { streamText } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const result = streamText({
    model: alibaba('qwen-plus'),
    prompt: 'Write a haiku about programming.',
  });

  // Log all stream events for debugging
  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'start':
        console.log('Stream initialized');
        break;

      case 'start-step':
        console.log('Step started');
        break;

      case 'text-start':
        console.log('Text generation started (id:', part.id + ')');
        break;

      case 'text-delta':
        process.stdout.write(part.text);
        break;

      case 'text-end':
        console.log('\nText generation ended (id:', part.id + ')');
        break;

      case 'reasoning-start':
        console.log('Reasoning started (id:', part.id + ')');
        break;

      case 'reasoning-delta':
        // Reasoning content (not shown in this example)
        break;

      case 'reasoning-end':
        console.log('Reasoning ended (id:', part.id + ')');
        break;

      case 'tool-call':
        console.log('Tool call:', {
          id: part.toolCallId,
          name: part.toolName,
          input: part.input,
        });
        break;

      case 'tool-result':
        console.log('Tool result:', {
          id: part.toolCallId,
          output: part.output,
        });
        break;

      case 'finish-step':
        console.log('Step finished');
        break;

      case 'finish':
        console.log('\nStream finished');
        break;

      case 'error':
        console.error('Error:', part.error);
        break;

      default:
        console.log('Unknown event type:', (part as any).type);
    }
  }

  console.log('\n--- Final State ---');
  console.log('Text:', await result.text);
  console.log('Usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
});
