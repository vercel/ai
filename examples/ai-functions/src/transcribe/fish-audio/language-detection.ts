import {
  fishAudio,
  type FishAudioTranscriptionModelOptions,
} from '@ai-sdk/fish-audio';
import { generateSpeech, transcribe } from 'ai';
import { run } from '../../lib/run';

// Round-trips Japanese speech through synthesis and transcription to show how
// Fish Audio reports the detected language.
//
// A public Japanese voice from the Fish Audio library. Run `list-voices.ts` in
// the generate-speech/fish-audio folder to browse others.
const JAPANESE_VOICE = '0089dce5fefb4c6ba9b9f2f0debe1ddc';

run(async () => {
  const speech = await generateSpeech({
    model: fishAudio.speech('s2.1-pro'),
    text: 'こんにちは。今日はいい天気ですね。これは音声認識のテストです。',
    voice: JAPANESE_VOICE,
  });

  const detected = await transcribe({
    model: fishAudio.transcription(),
    audio: speech.audio.uint8Array,
  });

  console.log('Text:', detected.text);
  // ISO-639-1 code of the detected language, e.g. `ja`.
  console.log('Language:', detected.language);
  // The human-readable name, e.g. `Japanese`, is exposed as provider metadata.
  console.log('Provider Metadata:', detected.providerMetadata);

  // The `language` provider option is only a hint. Fish Audio detects the
  // language regardless, so requesting `en` for Japanese audio still reports
  // `ja` and still transcribes Japanese.
  const hinted = await transcribe({
    model: fishAudio.transcription(),
    audio: speech.audio.uint8Array,
    providerOptions: {
      fishAudio: {
        language: 'en',
      } satisfies FishAudioTranscriptionModelOptions,
    },
  });

  console.log('\nWith `language: "en"` requested:');
  console.log('Language:', hinted.language);
  console.log('Text:', hinted.text);
});
