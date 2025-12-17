import { openai, compact } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { run } from '../lib/run';

run(async () => {
  // Step 1: Create a conversation with some context
  const turn1 = await generateText({
    model: openai.responses('gpt-4.1-mini'),
    prompt: 'My name is Alex and I work on AI systems. Remember this.',
    providerOptions: { openai: { store: true } },
  });
  console.log('Turn 1:', turn1.text.slice(0, 100) + '...\n');

  // Step 2: Compact the conversation
  const compactResult = await compact({
    model: 'gpt-4.1-mini',
    previousResponseId: turn1.response.id,
  });

  console.log('Compaction result:');
  console.log('  Input tokens:', compactResult.usage.inputTokens);
  console.log('  Output tokens:', compactResult.usage.outputTokens);
  console.log('  Output items:', compactResult.output.length);
  console.log('\nCompacted output (to be used in next request):');
  console.log(JSON.stringify(compactResult.output, null, 2));

  // TODO: Need guidance on how to convert compactResult.output to CoreMessage[]
  // so it can be passed to the next generateText call via the messages parameter.
  //
  // The compacted output contains:
  // - User messages (preserved verbatim)
  // - A single encrypted "compaction" item replacing all assistant messages, tool calls, and reasoning
  //
  // Currently there's no way to pass this back into the SDK without a provider-specific extension.
});
