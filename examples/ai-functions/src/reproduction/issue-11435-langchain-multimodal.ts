import assert from 'node:assert/strict';
import { convertModelMessages } from '../../../../packages/langchain/dist/index.mjs';
import type { ModelMessage } from 'ai';

async function main() {
  const messages: ModelMessage[] = [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Describe the attachments.' },
        {
          type: 'image',
          image: new URL('https://example.com/image.png'),
        },
        {
          type: 'file',
          data: new URL('https://example.com/report.pdf'),
          mediaType: 'application/pdf',
          filename: 'report.pdf',
        },
      ],
    },
  ];

  const [convertedMessage] = convertModelMessages(messages);

  assert.deepStrictEqual(
    convertedMessage.content,
    [
      { type: 'text', text: 'Describe the attachments.' },
      {
        type: 'image_url',
        image_url: { url: 'https://example.com/image.png' },
      },
      {
        type: 'file',
        url: 'https://example.com/report.pdf',
        mimeType: 'application/pdf',
        filename: 'report.pdf',
      },
    ],
    'Issue #11435 reproduced: image or file content was dropped during LangChain conversion.',
  );

  console.log(
    JSON.stringify({
      messageType: convertedMessage.getType(),
      content: convertedMessage.content,
    }),
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
