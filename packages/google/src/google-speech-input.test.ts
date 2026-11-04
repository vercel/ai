import { describe, expect, it } from 'vitest';
import { getGoogleSpeechInput } from './google-speech-input';

describe('getGoogleSpeechInput', () => {
  it('extracts only transcript text, preserving Unicode and inline tags', () => {
    expect(
      getGoogleSpeechInput({
        text: 'Ignored top-level text',
        providerOptions: {
          google: {
            turns: [
              {
                text: 'Hello <sigh>',
                speechMetadata: { speaker: 'Alice', style: 'whispering' },
              },
              { text: '世界 👋', speechMetadata: { speaker: 'Bob' } },
            ],
          },
        },
      }),
    ).toEqual({ text: 'Hello <sigh>世界 👋', usesCustomVoice: false });
  });

  it('preserves an empty structured transcript instead of using top-level text', () => {
    expect(
      getGoogleSpeechInput({
        text: 'Ignored',
        providerOptions: { google: { turns: [{ text: '' }] } },
      }).text,
    ).toBe('');
  });

  it.each([
    undefined,
    {},
    { google: null },
    { google: 'invalid' },
    { google: { turns: [] } },
    { google: { turns: 'Hello' } },
    { google: { turns: [null] } },
    { google: { turns: [{ text: 123 }] } },
    { google: { turns: [{ text: 'Partial' }, {}] } },
    { openai: { turns: [{ text: 'Other provider' }] } },
  ])('leaves malformed options to provider validation: %j', providerOptions => {
    expect(getGoogleSpeechInput({ text: 'Hello', providerOptions })).toEqual({
      text: 'Hello',
      usesCustomVoice: false,
    });
  });

  it.each(['voice_test', 'voicekey_test'])(
    'identifies a top-level custom voice: %s',
    voice => {
      expect(
        getGoogleSpeechInput({ text: 'Hello', voice }).usesCustomVoice,
      ).toBe(true);
    },
  );

  it.each(['voice_test', 'voicekey_test', 'unprefixed-id', '', null])(
    'identifies explicit custom voice fields regardless of their value: %j',
    voice => {
      expect(
        getGoogleSpeechInput({
          text: 'Hello',
          providerOptions: {
            google: {
              multiSpeakerVoiceConfig: {
                speakerVoiceConfigs: [
                  { speaker: 'Alice', voiceConfig: { voice } },
                ],
              },
            },
          },
        }).usesCustomVoice,
      ).toBe(true);
    },
  );

  it('recognizes custom voices even when multi-speaker configuration overrides voice', () => {
    expect(
      getGoogleSpeechInput({
        text: 'Hello',
        voice: 'voice_test',
        providerOptions: {
          google: {
            multiSpeakerVoiceConfig: {
              speakerVoiceConfigs: [
                {
                  speaker: 'Alice',
                  voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
                },
              ],
            },
          },
        },
      }).usesCustomVoice,
    ).toBe(true);
  });

  it.each([
    undefined,
    null,
    'invalid',
    { speakerVoiceConfigs: null },
    { speakerVoiceConfigs: [null, {}, { voiceConfig: null }] },
    {
      speakerVoiceConfigs: [
        {
          speaker: 'Alice',
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
        },
      ],
    },
  ])('does not infer custom voices from unrelated fields: %j', config => {
    expect(
      getGoogleSpeechInput({
        text: 'Hello',
        voice: 'Kore',
        providerOptions: { google: { multiSpeakerVoiceConfig: config } },
      }).usesCustomVoice,
    ).toBe(false);
  });
});
