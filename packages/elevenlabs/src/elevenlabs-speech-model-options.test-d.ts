import type {
  SharedV4ProviderOptions,
  SpeechModelV4CallOptions,
} from '@ai-sdk/provider';
import { describe, expectTypeOf, it } from 'vitest';
import type { ElevenLabsSpeechModelOptions } from '.';

describe('ElevenLabsSpeechModelOptions type', () => {
  it('should be assignable to provider options when explicitly annotated', () => {
    const options: ElevenLabsSpeechModelOptions = {
      voiceSettings: { stability: 0.5 },
    };
    const providerOptions: SharedV4ProviderOptions = { elevenlabs: options };
    const callOptions: SpeechModelV4CallOptions = {
      text: 'Hello',
      providerOptions: { elevenlabs: options },
    };

    expectTypeOf(providerOptions).toMatchTypeOf<SharedV4ProviderOptions>();
    expectTypeOf(callOptions).toMatchTypeOf<SpeechModelV4CallOptions>();
  });

  it('should type music_v2 composition plan chunks', () => {
    const options: ElevenLabsSpeechModelOptions = {
      compositionPlan: {
        chunks: [
          {
            text: '[Intro]',
            duration_ms: 4000,
            positive_styles: ['ambient'],
            context_adherence: 'medium',
          },
          { song_id: 'song-1', range: { start_ms: 0, end_ms: 3000 } },
        ],
      },
    };
    const providerOptions: SharedV4ProviderOptions = { elevenlabs: options };

    expectTypeOf(providerOptions).toMatchTypeOf<SharedV4ProviderOptions>();
  });

  it('should type music_v1 composition plan sections', () => {
    const options: ElevenLabsSpeechModelOptions = {
      compositionPlan: {
        positive_global_styles: ['rock'],
        negative_global_styles: [],
        sections: [
          {
            section_name: 'Verse',
            positive_local_styles: [],
            negative_local_styles: [],
            duration_ms: 3000,
            lines: ['Hello'],
          },
        ],
      },
    };

    options;
  });

  it('should reject a composition plan chunk without a duration', () => {
    const options: ElevenLabsSpeechModelOptions = {
      compositionPlan: {
        // @ts-expect-error - generation chunks need duration_ms
        chunks: [{ text: '[Intro]', positive_styles: [] }],
      },
    };

    options;
  });
});
