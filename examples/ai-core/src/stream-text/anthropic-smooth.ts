import { anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  let buffer = '';

  const result = streamText({
    model: anthropic('claude-3-5-sonnet-20240620'),
    prompt: 'Invent a new holiday and describe its traditions.',
    experimental_transformStream: new TransformStream({
      async transform(chunk, controller) {
        if (chunk.type === 'finish') {
          if (buffer.length > 0) {
            controller.enqueue({ type: 'text-delta', textDelta: buffer });
            buffer = '';
          }

          controller.enqueue(chunk);
          return;
        }

        if (chunk.type !== 'text-delta') {
          controller.enqueue(chunk);
          return;
        }

        buffer += chunk.textDelta;

        // Stream out complete words when whitespace is found
        let isFirst = true;
        while (buffer.match(/\s/)) {
          if (!isFirst) {
            await new Promise(resolve => setTimeout(resolve, 40));
          }
          isFirst = false;

          const whitespaceIndex = buffer.search(/\s/);
          const word = buffer.slice(0, whitespaceIndex + 1);
          controller.enqueue({ type: 'text-delta', textDelta: word });
          buffer = buffer.slice(whitespaceIndex + 1);
        }
      },
    }),
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);
