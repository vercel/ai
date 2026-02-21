import { alibaba } from '@ai-sdk/alibaba';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: alibaba('qwen-vl-max'),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'What color is this image? Answer in one word.',
          },
          {
            type: 'image',
            image: 'https://placehold.co/10x10/red/red.png',
          },
        ],
      },
    ],
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log('\n\nUsage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);
