import { createElevenLabs } from '@ai-sdk/elevenlabs';
import assert from 'node:assert/strict';
import { experimental_transcribe as transcribe } from 'ai';

const reply = {
  language_code: 'eng',
  language_probability: 1,
  text: 'hi (laughter)',
  words: [
    {
      text: 'hi',
      type: 'word',
      start: 0,
      end: 0.4,
      speaker_id: 'speaker_1',
      logprob: 0,
    },
    { text: ' ', type: 'spacing', start: 0.4, end: 0.5, logprob: 0 },
    {
      text: '(laughter)',
      type: 'audio_event',
      start: 0.5,
      end: 1.2,
      speaker_id: 'speaker_1',
      logprob: 0,
    },
  ],
};

async function main() {
  const elevenlabs = createElevenLabs({
    apiKey: 'test-api-key',
    fetch: async () => Response.json(reply),
  });

  const result = await transcribe({
    model: elevenlabs.transcription('scribe_v2'),
    audio: new Uint8Array([1, 2, 3]),
    providerOptions: { elevenlabs: { diarize: true } },
  });

  const metadata = result.providerMetadata.elevenlabs as
    | {
        words?: Array<{
          text: string;
          type: 'word' | 'spacing' | 'audio_event';
          speaker_id?: string | null;
        }>;
      }
    | undefined;

  assert.ok(
    Array.isArray(metadata?.words),
    'ISSUE #22051 reproduced: result.providerMetadata.elevenlabs.words is missing',
  );
  assert.deepEqual(
    metadata.words.map(({ text, type, speaker_id }) => ({
      text,
      type,
      speaker_id,
    })),
    reply.words.map(({ text, type, speaker_id }) => ({
      text,
      type,
      speaker_id,
    })),
    'ElevenLabs word type and speaker_id must be preserved in provider metadata',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
