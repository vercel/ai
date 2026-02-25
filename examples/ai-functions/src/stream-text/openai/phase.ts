import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: openai('gpt-5.3-codex'),
    prompt: 'What is the capital of France?',
  });

  for await (const chunk of result.fullStream) {
    switch (chunk.type) {
      case 'text-start': {
        const phase = chunk.providerMetadata?.openai?.phase;
        console.log(`\n\x1b[1mTEXT START\x1b[0m [phase: ${phase ?? 'none'}]`);
        break;
      }
      case 'text-delta':
        process.stdout.write(chunk.text);
        break;
      case 'text-end': {
        const phase = chunk.providerMetadata?.openai?.phase;
        console.log(`\n\x1b[1mTEXT END\x1b[0m [phase: ${phase ?? 'none'}]`);
        break;
      }
      case 'reasoning-start':
        console.log('\n\x1b[34mREASONING\x1b[0m');
        break;
      case 'reasoning-delta':
        process.stdout.write(chunk.text);
        break;
      case 'reasoning-end':
        console.log();
        break;
    }
  }

  console.log('\nUsage:', await result.usage);
});
