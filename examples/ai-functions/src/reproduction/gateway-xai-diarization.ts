import { gateway } from '@ai-sdk/gateway';
import { readFile } from 'node:fs/promises';

function containsSpeaker(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsSpeaker);
  }

  if (value == null || typeof value !== 'object') {
    return false;
  }

  return Object.entries(value).some(
    ([key, nestedValue]) => key === 'speaker' || containsSpeaker(nestedValue),
  );
}

async function main() {
  const audio = (await readFile('data/galileo.mp3')).subarray(0, 50_000);
  const result = await gateway
    .transcriptionModel('spacexai/grok-stt')
    .doGenerate({
      audio,
      mediaType: 'audio/mpeg',
      providerOptions: { xai: { diarize: true } },
    });

  const hasSpeaker =
    containsSpeaker(result.segments) ||
    containsSpeaker(result.providerMetadata) ||
    containsSpeaker(result.response.body);
  const warningText = JSON.stringify(result.warnings);
  const hasDiarizationWarning =
    /diariz|speaker/i.test(warningText) &&
    /unsupported|not support|ignored/i.test(warningText);

  if (!hasSpeaker && !hasDiarizationWarning) {
    console.error(
      'ISSUE #22044: AI Gateway returned no xAI speaker diarization and no unsupported warning',
    );
    console.error(
      JSON.stringify(
        {
          segments: result.segments.slice(0, 3),
          warnings: result.warnings,
          providerMetadata: result.providerMetadata,
          responseBodyKeys:
            result.response.body != null &&
            typeof result.response.body === 'object'
              ? Object.keys(result.response.body)
              : [],
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
