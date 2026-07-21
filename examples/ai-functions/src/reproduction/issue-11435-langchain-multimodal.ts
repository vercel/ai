import assert from 'node:assert/strict';
import { convertModelMessages } from '@ai-sdk/langchain';
import type { ModelMessage } from 'ai';

async function main() {
  const messages: ModelMessage[] = [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Inspect these attachments.' },
        {
          type: 'image',
          image: new URL('https://example.com/image.png'),
          mediaType: 'image/png',
        },
        {
          type: 'file',
          data: new URL('https://example.com/document.pdf'),
          mediaType: 'application/pdf',
          filename: 'document.pdf',
        },
      ],
    },
  ];

  const [message] = convertModelMessages(messages);

  assert.deepEqual(
    message.content,
    [
      { type: 'text', text: 'Inspect these attachments.' },
      {
        type: 'image_url',
        image_url: { url: 'https://example.com/image.png' },
      },
      {
        type: 'file',
        url: 'https://example.com/document.pdf',
        mimeType: 'application/pdf',
        filename: 'document.pdf',
      },
    ],
    'Issue #11435 reproduced: image or file content was dropped during LangChain conversion.',
  );

  console.log(
    'Issue #11435 not reproduced: image and file content were preserved.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
