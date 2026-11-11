import type { SharedV4Warning } from '@ai-sdk/provider';

// Deepgram embeds voice and language in the model ID
// (`<family>-<voice>-<language>`, e.g. `aura-2-thalia-en`). Bare family IDs
// compose the upstream model ID from the voice and language call options.
const VOICE_FAMILY_IDS = new Set<string>(['aura', 'aura-2', 'flux']);

/**
 * Flux TTS voices (`flux-<voice>-<language>`) are served only by `/v2/speak`;
 * Aura voices only by `/v1/speak`.
 */
export function isDeepgramFluxSpeechModelId(modelId: string): boolean {
  return modelId === 'flux' || modelId.startsWith('flux-');
}

/**
 * Composes the upstream model ID from voice/language when a bare voice family
 * ID is used; full voice IDs (e.g. `aura-2-thalia-en`) pass through.
 */
export function composeDeepgramSpeechModelId({
  modelId,
  voice,
  language,
  warnings,
}: {
  modelId: string;
  voice: string | undefined;
  language: string | undefined;
  warnings: SharedV4Warning[];
}): string {
  if (!VOICE_FAMILY_IDS.has(modelId)) {
    return modelId;
  }

  const trimmedVoice = voice?.trim();
  if (!trimmedVoice) {
    throw new Error(
      `Deepgram speech model "${modelId}" requires a \`voice\` to be set (e.g. voice: '${isDeepgramFluxSpeechModelId(modelId) ? 'haley' : 'thalia'}').`,
    );
  }
  if (language === 'auto') {
    warnings.push({
      type: 'compatibility',
      feature: 'language',
      details: `Deepgram TTS models do not support automatic language detection. Language "en" was used instead.`,
    });
  }
  return `${modelId}-${trimmedVoice}-${language && language !== 'auto' ? language : 'en'}`;
}

/**
 * Full voice model IDs embed the voice in the model ID, so a voice call
 * option cannot compose.
 */
export function getIgnoredVoiceWarning({
  modelId,
  upstreamModelId,
  voice,
}: {
  modelId: string;
  upstreamModelId: string;
  voice: string | undefined;
}): SharedV4Warning | undefined {
  return upstreamModelId === modelId && voice && voice !== modelId
    ? {
        type: 'unsupported',
        feature: 'voice',
        details: `Deepgram TTS models embed the voice in the model ID. The voice parameter "${voice}" was ignored. Use the model ID to select a voice (e.g., "aura-2-helena-en").`,
      }
    : undefined;
}

/**
 * Full voice model IDs are already language-specific; the language was
 * consumed when composing from a voice family ID.
 */
export function getIgnoredLanguageWarning({
  modelId,
  upstreamModelId,
  language,
}: {
  modelId: string;
  upstreamModelId: string;
  language: string | undefined;
}): SharedV4Warning | undefined {
  return upstreamModelId === modelId && language
    ? {
        type: 'unsupported',
        feature: 'language',
        details: `Deepgram TTS models are language-specific via the model ID. Language parameter "${language}" was ignored. Select a model with the appropriate language suffix (e.g., "-en" for English).`,
      }
    : undefined;
}
