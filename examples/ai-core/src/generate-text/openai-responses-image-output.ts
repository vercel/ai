import { openai, OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { APICallError, generateText, ModelMessage } from 'ai';
import 'dotenv/config';
import { presentImages } from '../lib/present-image';

async function main() {
  const messages: ModelMessage[] = [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Generate an image of a cat.',
        },
      ],
    },
  ];

  const result = await generateText({
    model: openai('gpt-5'),
    messages,
    tools: {
      image_generation: openai.tools.imageGeneration({
        outputFormat: 'webp',
        quality: 'low',
        size: '1024x1024',
      }),
    },
    providerOptions: {
      // openai: {
      //   store: false,
      //   include: ['reasoning.encrypted_content'],
      // } as OpenAIResponsesProviderOptions,
    },
  });

  for (const file of result.files) {
    if (file.mediaType.startsWith('image/')) {
      await presentImages([file]);
    }
  }

  const result2 = await generateText({
    model: openai('gpt-5'),
    messages: [
      ...messages,
      ...result.response.messages,
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Make it black and white.',
          },
        ],
      },
    ],
    tools: {
      image_generation: openai.tools.imageGeneration({
        outputFormat: 'webp',
        quality: 'low',
        size: '1024x1024',
      }),
    },
    providerOptions: {
      // openai: {
      //   store: false,
      //   include: ['reasoning.encrypted_content'],
      // } as OpenAIResponsesProviderOptions,
    },
  });

  for (const file of result2.files) {
    if (file.mediaType.startsWith('image/')) {
      await presentImages([file]);
    }
  }
}

main().catch(error => {
  if (APICallError.isInstance(error)) {
    console.log(JSON.stringify(error.requestBodyValues, null, 2));
  }
  console.error(error);
  process.exit(1);
});
