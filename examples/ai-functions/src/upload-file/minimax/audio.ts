import { minimax } from '@ai-sdk/minimax';
import { uploadFile } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const audioData = new Uint8Array([1, 2, 3, 4, 5]);

  const { providerReference, providerMetadata } = await uploadFile({
    api: minimax.files(),
    data: audioData,
    filename: 'voice-sample.mp3',
    mediaType: 'audio/mpeg',
    providerOptions: {
      minimax: {
        purpose: 'voice_clone',
      },
    },
  });

  console.log('Voice clone file uploaded:');
  console.log('  Provider reference:', providerReference);
  console.log('  File ID:', providerReference.minimax);
  console.log('  Provider metadata:', providerMetadata);
});
