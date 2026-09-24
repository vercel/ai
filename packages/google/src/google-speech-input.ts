/**
 * Inspects speech input without replacing provider option validation. This is
 * also used by intermediaries that need the transcript or voice kind before
 * invoking a model. Model support for structured turns is validated separately.
 */
export function getGoogleSpeechInput({
  text,
  voice,
  providerOptions,
}: {
  text: string;
  voice?: string;
  providerOptions?: Record<string, unknown>;
}): { text: string; usesCustomVoice: boolean } {
  const google = providerOptions?.google;
  const options =
    google != null && typeof google === 'object' ? google : undefined;
  const turns = options && 'turns' in options ? options.turns : undefined;
  const turnTexts: string[] = [];
  if (Array.isArray(turns) && turns.length > 0) {
    for (const turn of turns as unknown[]) {
      if (
        turn == null ||
        typeof turn !== 'object' ||
        !('text' in turn) ||
        typeof turn.text !== 'string'
      ) {
        break;
      }
      turnTexts.push(turn.text);
    }
    if (turnTexts.length === turns.length) {
      text = turnTexts.join('');
    }
  }

  const config =
    options && 'multiSpeakerVoiceConfig' in options
      ? options.multiSpeakerVoiceConfig
      : undefined;
  const speakers =
    config != null &&
    typeof config === 'object' &&
    'speakerVoiceConfigs' in config &&
    Array.isArray(config.speakerVoiceConfigs)
      ? (config.speakerVoiceConfigs as unknown[])
      : [];

  return {
    text,
    usesCustomVoice:
      voice?.startsWith('voice_') === true ||
      voice?.startsWith('voicekey_') === true ||
      speakers.some(
        speaker =>
          speaker != null &&
          typeof speaker === 'object' &&
          'voiceConfig' in speaker &&
          speaker.voiceConfig != null &&
          typeof speaker.voiceConfig === 'object' &&
          'voice' in speaker.voiceConfig,
      ),
  };
}
