import { minimax } from '@ai-sdk/minimax';
import { uploadFile } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const fileData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

  const {
    providerReference,
    mediaType,
    filename,
    createdAt,
    byteSize,
    providerMetadata,
  } = await uploadFile({
    api: minimax.files(),
    data: fileData,
    filename: 'sample-audio.mp3',
    mediaType: 'audio/mpeg',
  });

  console.log('File upload result:');
  console.log('  Provider reference:', providerReference);
  console.log('  Media type:', mediaType);
  console.log('  Filename:', filename);
  console.log('  Created at:', createdAt);
  console.log('  Byte size:', byteSize);
  console.log('  Provider metadata:', providerMetadata);
});
