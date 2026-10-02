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

  console.log('Voice clone upload:');
  console.log('  Provider reference:', providerReference);
  console.log('  Provider metadata:', providerMetadata);

  const { providerReference: ref2, providerMetadata: meta2 } = await uploadFile(
    {
      api: minimax.files(),
      data: audioData,
      filename: 'prompt-audio.mp3',
      mediaType: 'audio/mpeg',
      providerOptions: {
        minimax: {
          purpose: 'prompt_audio',
        },
      },
    },
  );

  console.log('Prompt audio upload:');
  console.log('  Provider reference:', ref2);
  console.log('  Provider metadata:', meta2);

  const { providerReference: ref3, providerMetadata: meta3 } = await uploadFile(
    {
      api: minimax.files(),
      data: audioData,
      filename: 'async-input.mp3',
      mediaType: 'audio/mpeg',
    },
  );

  console.log('Async input upload (default purpose):');
  console.log('  Provider reference:', ref3);
  console.log('  Provider metadata:', meta3);
});
