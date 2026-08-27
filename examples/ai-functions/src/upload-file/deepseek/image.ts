import { deepSeek, type DeepSeekFilesOptions } from '@ai-sdk/deepseek';
import { generateText, uploadFile } from 'ai';
import fs from 'node:fs';
import { run } from '../../lib/run';

run(async () => {
  const { providerReference, mediaType, filename, providerMetadata } =
    await uploadFile({
      api: deepSeek.files(),
      data: fs.readFileSync('./data/comic-cat.png'),
      filename: 'comic-cat.png',
      providerOptions: {
        deepseek: {
          expiresAfter: 3600,
        } satisfies DeepSeekFilesOptions,
      },
    });

  console.log('Provider reference:', providerReference);
  console.log('Media type:', mediaType);
  console.log('Filename:', filename);
  console.log('Provider metadata:', providerMetadata);

  const result = await generateText({
    model: deepSeek('deepseek-v4-flash-vision-exp'),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'What animal is depicted in this image? Answer with one word.',
          },
          {
            type: 'file',
            mediaType: mediaType ?? 'image/png',
            data: providerReference,
          },
        ],
      },
    ],
  });

  console.log(result.text);
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
});
