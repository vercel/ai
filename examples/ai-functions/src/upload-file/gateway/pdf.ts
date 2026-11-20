import { gateway, type GatewayFilesOptions } from '@ai-sdk/gateway';
import { experimental_decide, uploadFile } from 'ai';
import fs from 'node:fs';
import { run } from '../../lib/run';

run(async () => {
  const files = gateway.files();

  const { providerReference, mediaType, byteSize, expiresAt, warnings } =
    await uploadFile({
      api: files,
      data: fs.readFileSync('./data/ai.pdf'),
      filename: 'ai.pdf',
      providerOptions: {
        gateway: { expiresAfter: 24 * 60 * 60 } satisfies GatewayFilesOptions,
      },
    });

  console.log('Provider reference:', providerReference);
  console.log('Media type:', mediaType);
  console.log('Size:', byteSize);
  console.log('Expires at:', expiresAt);
  console.log('Warnings:', warnings);

  try {
    const metadata = await files.getFileMetadata?.({ file: providerReference });
    console.log('Metadata:', metadata);

    const result = await experimental_decide({
      model: 'google/gemini-decision-1',
      state: [
        {
          type: 'file',
          mediaType: mediaType ?? 'application/pdf',
          data: providerReference,
        },
      ],
      questions: {
        topic: {
          type: 'choice',
          instructions: 'What is this document mainly about?',
          criteria: {
            technology: 'Software, AI or computing',
            finance: 'Money, markets or accounting',
            other: null,
          },
        },
        isTechnical: {
          type: 'boolean',
          instructions: 'Is the document written for a technical audience?',
        },
      },
    });

    console.log('Answers:', result.answers);
    console.log('Usage:', result.usage);
  } finally {
    const deleted = await files.deleteFile?.({ file: providerReference });
    console.log('Deleted:', deleted?.deleted);
  }
});
