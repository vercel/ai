import { google } from '@ai-sdk/google';
import { generateText, uploadFile } from 'ai';
import fs from 'node:fs';
import { run } from '../../lib/run';

run(async () => {
  const { providerReference, providerMetadata } = await uploadFile({
    files: google.files(),
    data: fs.readFileSync('./data/comic-cat.png'),
  });

  console.log('Provider reference:', providerReference);
  console.log('Provider metadata:', providerMetadata);

  const result = await generateText({
    model: google('gemini-2.5-flash'),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Describe what you see in this image.',
          },
          {
            type: 'image',
            image: providerReference,
            mediaType: String(
              providerMetadata?.google?.mimeType || 'image/png',
            ),
          },
        ],
      },
    ],
  });

  console.log(result.text);
});
