import {
  createElevenLabs,
  type ElevenLabsProviderSettings,
} from '@ai-sdk/elevenlabs';
import { experimental_streamSpeech as streamSpeech } from 'ai';
import { WebSocket } from 'ws';
import { run } from '../../lib/run';

const elevenLabs = createElevenLabs({
  webSocket: WebSocket as unknown as ElevenLabsProviderSettings['webSocket'],
});

// Uses the multi-context WebSocket with a caller-chosen context id, which
// is echoed on each audio part's providerMetadata.
run(async () => {
  const result = streamSpeech({
    model: elevenLabs.speech('eleven_flash_v2_5'),
    text: 'This audio belongs to a single named context. ',
    providerOptions: { elevenlabs: { streaming: { contextId: 'turn-1' } } },
  });

  for await (const part of result.fullStream) {
    if (part.type === 'audio') {
      console.log(
        'audio chunk:',
        part.audio.byteLength,
        'bytes',
        part.providerMetadata?.elevenlabs,
      );
    }
  }
  console.log('usage:', await result.usage);
});
