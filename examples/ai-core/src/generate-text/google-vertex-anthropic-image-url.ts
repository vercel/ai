import 'dotenv/config';
import { vertexAnthropic } from '@ai-sdk/google-vertex/anthropic';
import { generateText } from 'ai';

async function main() {
  const result = await generateText({
    model: vertexAnthropic('claude-3-5-sonnet-v2@20241022'),
    maxTokens: 512,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe the image in detail.' },
          {
            type: 'image',
            image:
              'https://github.com/vercel/ai/blob/main/examples/ai-core/data/comic-cat.png?raw=true',
          },
        ],
      },
    ],
  });

  console.log(result.text);
}

main().catch(console.error);
