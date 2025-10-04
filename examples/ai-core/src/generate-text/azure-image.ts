import { azure } from '@ai-sdk/azure';
import { generateText } from 'ai';
import 'dotenv/config';
import fs from 'node:fs';

async function main() {
  const imageData = fs.readFileSync('data/comic-cat.png');
  const imageBase64_string = imageData.toString('base64');

  const { text, usage } = await generateText({
    model: azure('gpt-4.1-mini'), // use your own deployment
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe the image in detail.' },
          {
            type: 'image',
            // Internally, MIME type is automatically detected:
            image: imageBase64_string,
            providerOptions: {
              // When using the Azure OpenAI provider, the imageDetail option can be configured under the `openai` key:
              openai: {
                imageDetail: 'low',
              },
            },
          },
        ],
      },
    ],
  });

  console.log(text);
  console.log();
  console.log('Usage:', usage);
}

main().catch(console.error);
