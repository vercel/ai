import { deepSeek, type DeepSeekFilesOptions } from '@ai-sdk/deepseek';
import { uploadFile } from 'ai';
import fs from 'node:fs';
import { run } from '../../lib/run';

run(async () => {
  const result = await uploadFile({
    api: deepSeek.files(),
    data: fs.readFileSync('./data/comic-cat.png'),
    filename: 'comic-cat.png',
    providerOptions: {
      deepseek: {
        expiresAfter: 3600,
      } satisfies DeepSeekFilesOptions,
    },
  });

  console.log('Provider reference:', result.providerReference);
  console.log('Filename:', result.filename);
  console.log(
    'Validated response metadata:',
    result.providerMetadata?.deepseek,
  );
});
