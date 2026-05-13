import { openai } from '@ai-sdk/openai';
import { experimental_generateSpeech as generateSpeech } from 'ai';
import { run } from '../../lib/run';

const models = ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts'] as const;

run(async () => {
  for (const modelId of models) {
    console.log(`\n=== OpenAI speech usage probe: ${modelId} ===`);

    const result = await generateSpeech({
      model: openai.speech(modelId),
      text: 'Hello from the AI SDK speech usage probe.',
      voice: 'alloy',
      outputFormat: 'mp3',
    });

    console.log(
      JSON.stringify(
        {
          modelId,
          audioMediaType: result.audio.mediaType,
          audioByteLength: result.audio.uint8Array.byteLength,
          warnings: result.warnings,
          responses: result.responses,
          providerMetadata: result.providerMetadata,
        },
        null,
        2,
      ),
    );
  }
});
