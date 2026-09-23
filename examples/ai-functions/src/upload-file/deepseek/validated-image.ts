import { deepSeek } from '@ai-sdk/deepseek';
import { InvalidArgumentError, uploadFile } from 'ai';
import { readFile } from 'node:fs/promises';
import { run } from '../../lib/run';

run(async () => {
  const files = deepSeek.files();

  try {
    await uploadFile({
      api: files,
      data: new TextEncoder().encode('unsupported file'),
      mediaType: 'text/plain',
      filename: 'notes.txt',
    });
  } catch (error) {
    if (!InvalidArgumentError.isInstance(error)) {
      throw error;
    }

    console.log('Rejected locally:', error.message);
  }

  const result = await uploadFile({
    api: files,
    data: await readFile('./data/comic-cat.png'),
    mediaType: 'image/png',
    filename: 'comic-cat.png',
  });

  console.log('Provider reference:', result.providerReference);
  console.log('Filename:', result.filename);
  console.log('Media type:', result.mediaType);
});
