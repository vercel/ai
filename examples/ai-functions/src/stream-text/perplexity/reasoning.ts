import { perplexity } from '@ai-sdk/perplexity';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: perplexity('fast'),
    prompt: 'What is the latest stable TypeScript version? Answer briefly.',
    include: {
      rawChunks: true,
    },
  });

  // Agent API reasoning events that carry a status thought, e.g.
  // "Searching the web..." on response.reasoning.search_queries.
  const rawThoughts: string[] = [];
  let reasoning = '';

  for await (const part of result.stream) {
    switch (part.type) {
      case 'raw': {
        const event = part.rawValue as { type?: string; thought?: string };
        if (event.type?.startsWith('response.reasoning.') && event.thought) {
          rawThoughts.push(event.thought);
        }
        break;
      }
      case 'reasoning-start': {
        console.log('\n[reasoning-start]');
        break;
      }
      case 'reasoning-delta': {
        reasoning += part.text;
        process.stdout.write(part.text);
        break;
      }
      case 'reasoning-end': {
        console.log('\n[reasoning-end]\n');
        break;
      }
      case 'text-delta': {
        process.stdout.write(part.text);
        break;
      }
    }
  }

  console.log();
  console.log('Raw reasoning thoughts:', rawThoughts);
  console.log('Reasoning text:', JSON.stringify(reasoning));
  console.log(
    'Reasoning text (result):',
    JSON.stringify(await result.reasoningText),
  );
  console.log('Sources:', (await result.sources).length);

  const missing = rawThoughts.filter(thought => !reasoning.includes(thought));
  if (missing.length > 0) {
    throw new Error(
      `Agent API reasoning thoughts were not streamed as reasoning: ${JSON.stringify(missing)}`,
    );
  }
});
