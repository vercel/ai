import {
  mistral,
  type MistralSpeechModelOptions,
  type MistralTranscriptionModelOptions,
} from '@ai-sdk/mistral';
import { generateSpeech, transcribe } from 'ai';
import { run } from '../lib/run';
import { saveAudioFile } from '../lib/save-audio';

run(async () => {
  const speech = await generateSpeech({
    model: mistral.speech('voxtral-mini-tts-3-0'),
    text: '[emotion=happy] Hello from the AI SDK! I like tomato soup.',
    voice: 'gb_jane_neutral',
    providerOptions: {
      mistral: {
        expressiveness: 1.5,
        phonemeHints: { tomato: ['t', 'ə', 'm', 'ɑ', 't', 'oʊ'] },
      } satisfies MistralSpeechModelOptions,
    },
  });
  console.log('Speech:', {
    bytes: speech.audio.uint8Array.length,
    warnings: speech.warnings,
  });
  await saveAudioFile(speech.audio);

  for (const modelId of [
    'voxtral-mini-transcribe-3-0',
    'voxtral-small-transcribe-3-0',
  ]) {
    for (const languageOptions of [
      { returnLanguage: true },
      { language: 'en' },
    ]) {
      const result = await transcribe({
        model: mistral.transcription(modelId),
        audio: speech.audio.uint8Array,
        providerOptions: {
          mistral: {
            ...languageOptions,
            timestampGranularities: ['segment'],
            diarize: true,
            contextBias: [
              'AI SDK',
              'A greeting, followed by a sentence about tomato soup.',
            ],
          } satisfies MistralTranscriptionModelOptions,
        },
      });
      console.log(modelId, languageOptions, {
        text: result.text,
        language: result.language,
        duration: result.durationInSeconds,
        segments: result.segments,
        providerMetadata: result.providerMetadata,
        warnings: result.warnings,
      });
    }
  }
});
