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

  assert.deepStrictEqual(
    result.providerMetadata.elevenlabs?.words,
    [
      {
        text: 'hi',
        type: 'word',
        start: 0,
        end: 0.4,
        speaker_id: 'speaker_1',
      },
      {
        text: ' ',
        type: 'spacing',
        start: 0.4,
        end: 0.5,
      },
      {
        text: '(laughter)',
        type: 'audio_event',
        start: 0.5,
        end: 1.2,
        speaker_id: 'speaker_1',
      },
    ],
    'ISSUE_22051_REPRODUCED: ElevenLabs word type and speaker_id metadata is missing',
  );
}

main();
