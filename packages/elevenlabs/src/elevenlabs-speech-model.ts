import type { SpeechModelV3, SharedV3Warning } from '@ai-sdk/provider';
import {
  lazySchema,
  zodSchema,
  type InferSchema,
  combineHeaders,
  convertBase64ToUint8Array,
  createBinaryResponseHandler,
  createJsonResponseHandler,
  parseProviderOptions,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { ElevenLabsConfig } from './elevenlabs-config';
import { elevenlabsFailedResponseHandler } from './elevenlabs-error';
import type { ElevenLabsSpeechAPITypes } from './elevenlabs-speech-api-types';
import type {
  ElevenLabsSpeechModelId,
  ElevenLabsSpeechVoiceId,
} from './elevenlabs-speech-options';

// Schema for camelCase input from users
const elevenLabsSpeechModelOptionsSchema = lazySchema(() =>
  zodSchema(
    z.object({
      /** Return character-level alignment with the generated audio. */
      withTimestamps: z.boolean().optional(),
      languageCode: z.string().optional(),
      voiceSettings: z
        .object({
          stability: z.number().min(0).max(1).optional(),
          similarityBoost: z.number().min(0).max(1).optional(),
          style: z.number().min(0).max(1).optional(),
          useSpeakerBoost: z.boolean().optional(),
        })
        .optional(),
      pronunciationDictionaryLocators: z
        .array(
          z.object({
            pronunciationDictionaryId: z.string(),
            versionId: z.string().optional(),
          }),
        )
        .max(3)
        .optional(),
      seed: z.number().min(0).max(4294967295).optional(),
      previousText: z.string().optional(),
      nextText: z.string().optional(),
      previousRequestIds: z.array(z.string()).max(3).optional(),
      nextRequestIds: z.array(z.string()).max(3).optional(),
      applyTextNormalization: z.enum(['auto', 'on', 'off']).optional(),
      applyLanguageTextNormalization: z.boolean().optional(),
      enableLogging: z.boolean().optional(),
    }),
  ),
);

export type ElevenLabsSpeechModelOptions = InferSchema<
  typeof elevenLabsSpeechModelOptionsSchema
>;

interface ElevenLabsSpeechModelConfig extends ElevenLabsConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

export class ElevenLabsSpeechModel implements SpeechModelV3 {
  readonly specificationVersion = 'v3';

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: ElevenLabsSpeechModelId,
    private readonly config: ElevenLabsSpeechModelConfig,
  ) {}

  private async getArgs({
    text,
    voice = '21m00Tcm4TlvDq8ikWAM',
    outputFormat = 'mp3_44100_128',
    instructions,
    language,
    speed,
    providerOptions,
  }: Parameters<SpeechModelV3['doGenerate']>[0]) {
    const warnings: SharedV3Warning[] = [];

    // Parse provider options
    const elevenLabsOptions = await parseProviderOptions({
      provider: 'elevenlabs',
      providerOptions,
      schema: elevenLabsSpeechModelOptionsSchema,
    });

    // Create request body
    const requestBody: ElevenLabsSpeechAPITypes = {
      text,
      model_id: this.modelId,
    };

    // Prepare query parameters
    const queryParams: Record<string, string> = {};

    // Map outputFormat to ElevenLabs format (as query param)
    if (outputFormat) {
      const formatMap: Record<string, string> = {
        mp3: 'mp3_44100_128',
        mp3_32: 'mp3_44100_32',
        mp3_64: 'mp3_44100_64',
        mp3_96: 'mp3_44100_96',
        mp3_128: 'mp3_44100_128',
        mp3_192: 'mp3_44100_192',
        pcm: 'pcm_44100',
        pcm_16000: 'pcm_16000',
        pcm_22050: 'pcm_22050',
        pcm_24000: 'pcm_24000',
        pcm_44100: 'pcm_44100',
        ulaw: 'ulaw_8000',
        wav: 'wav_44100',
      };

      const mappedFormat = formatMap[outputFormat] || outputFormat;
      queryParams.output_format = mappedFormat;
    }

    // Add language code if provided
    if (language) {
      requestBody.language_code = language;
    }

    const voiceSettings: typeof requestBody.voice_settings = {};

    if (speed != null) {
      voiceSettings.speed = speed;
    }

    // Add provider-specific options - map from camelCase to snake_case
    if (elevenLabsOptions) {
      if (elevenLabsOptions.voiceSettings) {
        // Map camelCase voice settings to snake_case for API
        if (elevenLabsOptions.voiceSettings.stability != null) {
          voiceSettings.stability = elevenLabsOptions.voiceSettings.stability;
        }
        if (elevenLabsOptions.voiceSettings.similarityBoost != null) {
          voiceSettings.similarity_boost =
            elevenLabsOptions.voiceSettings.similarityBoost;
        }
        if (elevenLabsOptions.voiceSettings.style != null) {
          voiceSettings.style = elevenLabsOptions.voiceSettings.style;
        }
        if (elevenLabsOptions.voiceSettings.useSpeakerBoost != null) {
          voiceSettings.use_speaker_boost =
            elevenLabsOptions.voiceSettings.useSpeakerBoost;
        }
      }
      // Add language code from provider options if not already set
      if (elevenLabsOptions.languageCode && !requestBody.language_code) {
        requestBody.language_code = elevenLabsOptions.languageCode;
      }

      // Map pronunciation dictionary locators
      if (elevenLabsOptions.pronunciationDictionaryLocators) {
        requestBody.pronunciation_dictionary_locators =
          elevenLabsOptions.pronunciationDictionaryLocators.map(locator => ({
            pronunciation_dictionary_id: locator.pronunciationDictionaryId,
            ...(locator.versionId && { version_id: locator.versionId }),
          }));
      }

      if (elevenLabsOptions.seed != null) {
        requestBody.seed = elevenLabsOptions.seed;
      }
      if (elevenLabsOptions.previousText) {
        requestBody.previous_text = elevenLabsOptions.previousText;
      }
      if (elevenLabsOptions.nextText) {
        requestBody.next_text = elevenLabsOptions.nextText;
      }

      // Add previous and next request IDs
      if (elevenLabsOptions.previousRequestIds) {
        requestBody.previous_request_ids = elevenLabsOptions.previousRequestIds;
      }
      if (elevenLabsOptions.nextRequestIds) {
        requestBody.next_request_ids = elevenLabsOptions.nextRequestIds;
      }

      // Add text normalization options
      if (elevenLabsOptions.applyTextNormalization) {
        requestBody.apply_text_normalization =
          elevenLabsOptions.applyTextNormalization;
      }
      if (elevenLabsOptions.applyLanguageTextNormalization != null) {
        requestBody.apply_language_text_normalization =
          elevenLabsOptions.applyLanguageTextNormalization;
      }

      // enable_logging is a query parameter
      if (elevenLabsOptions.enableLogging != null) {
        queryParams.enable_logging = String(elevenLabsOptions.enableLogging);
      }
    }

    // Only add voice_settings if there are settings to add
    if (Object.keys(voiceSettings).length > 0) {
      requestBody.voice_settings = voiceSettings;
    }

    if (instructions) {
      warnings.push({
        type: 'unsupported',
        feature: 'instructions',
        details: `ElevenLabs speech models do not support instructions. Instructions parameter was ignored.`,
      });
    }

    const withTimestamps = elevenLabsOptions?.withTimestamps === true;

    // Eleven v4 is served by Text to Dialogue, even for a single voice.
    if (this.modelId === 'eleven_v4') {
      const unsupportedOptions = {
        speed,
        'providerOptions.elevenlabs.voiceSettings.style': voiceSettings.style,
        'providerOptions.elevenlabs.voiceSettings.useSpeakerBoost':
          voiceSettings.use_speaker_boost,
        'providerOptions.elevenlabs.applyLanguageTextNormalization':
          requestBody.apply_language_text_normalization,
      };
      for (const [feature, value] of Object.entries(unsupportedOptions)) {
        if (value != null) {
          warnings.push({
            type: 'unsupported',
            feature,
            details: `ElevenLabs Text to Dialogue does not support ${feature}. It was ignored.`,
          });
        }
      }

      const settings = {
        ...(voiceSettings.stability != null && {
          stability: voiceSettings.stability,
        }),
        ...(voiceSettings.similarity_boost != null && {
          similarity: voiceSettings.similarity_boost,
        }),
      };
      const dialogueBody = {
        inputs: [{ text, voice_id: voice }],
        model_id: this.modelId,
        language_code: requestBody.language_code,
        ...(Object.keys(settings).length > 0 && { settings }),
        pronunciation_dictionary_locators:
          requestBody.pronunciation_dictionary_locators,
        seed: requestBody.seed,
        previous_text: requestBody.previous_text,
        future_text: requestBody.next_text,
        previous_request_ids: requestBody.previous_request_ids,
        next_request_ids: requestBody.next_request_ids,
        apply_text_normalization: requestBody.apply_text_normalization,
      };

      return {
        requestBody: dialogueBody,
        queryParams,
        warnings,
        path: `/v1/text-to-dialogue${withTimestamps ? '/with-timestamps' : ''}`,
        withTimestamps,
      };
    }

    return {
      requestBody,
      queryParams,
      warnings,
      path: `/v1/text-to-speech/${encodeURIComponent(voice as ElevenLabsSpeechVoiceId)}${withTimestamps ? '/with-timestamps' : ''}`,
      withTimestamps,
    };
  }

  async doGenerate(
    options: Parameters<SpeechModelV3['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<SpeechModelV3['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { requestBody, queryParams, warnings, path, withTimestamps } =
      await this.getArgs(options);

    const {
      value,
      responseHeaders,
      rawValue: rawResponse,
    } = await postJsonToApi<Uint8Array | ElevenLabsSpeechTimestampsResponse>({
      url: (() => {
        const baseUrl = this.config.url({
          path,
          modelId: this.modelId,
        });
        const queryString = new URLSearchParams(queryParams).toString();
        return queryString ? `${baseUrl}?${queryString}` : baseUrl;
      })(),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: requestBody,
      failedResponseHandler: elevenlabsFailedResponseHandler,
      successfulResponseHandler: withTimestamps
        ? createJsonResponseHandler(elevenLabsSpeechTimestampsResponseSchema)
        : createBinaryResponseHandler(),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const envelope = value instanceof Uint8Array ? undefined : value;

    return {
      audio:
        value instanceof Uint8Array
          ? value
          : convertBase64ToUint8Array(value.audio_base64),
      warnings,
      request: {
        body: JSON.stringify(requestBody),
      },
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
        body: rawResponse,
      },
      ...(envelope != null && {
        providerMetadata: {
          elevenlabs: {
            ...(envelope.alignment != null && {
              alignment: toAlignmentMetadata(envelope.alignment),
            }),
            ...(envelope.normalized_alignment != null && {
              normalizedAlignment: toAlignmentMetadata(
                envelope.normalized_alignment,
              ),
            }),
            ...(envelope.voice_segments != null && {
              voiceSegments: envelope.voice_segments.map(segment => ({
                voiceId: segment.voice_id,
                startTimeSeconds: segment.start_time_seconds,
                endTimeSeconds: segment.end_time_seconds,
                characterStartIndex: segment.character_start_index,
                characterEndIndex: segment.character_end_index,
                dialogueInputIndex: segment.dialogue_input_index,
              })),
            }),
          },
        },
      }),
    };
  }
}

const alignmentSchema = () =>
  z.object({
    characters: z.array(z.string()),
    character_start_times_seconds: z.array(z.number()),
    character_end_times_seconds: z.array(z.number()),
  });

const elevenLabsSpeechTimestampsResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      audio_base64: z.string(),
      alignment: alignmentSchema().nullish(),
      normalized_alignment: alignmentSchema().nullish(),
      voice_segments: z
        .array(
          z.object({
            voice_id: z.string(),
            start_time_seconds: z.number(),
            end_time_seconds: z.number(),
            character_start_index: z.number(),
            character_end_index: z.number(),
            dialogue_input_index: z.number(),
          }),
        )
        .nullish(),
    }),
  ),
);

type ElevenLabsSpeechTimestampsResponse = InferSchema<
  typeof elevenLabsSpeechTimestampsResponseSchema
>;

function toAlignmentMetadata(
  alignment: NonNullable<ElevenLabsSpeechTimestampsResponse['alignment']>,
) {
  return {
    characters: alignment.characters,
    characterStartTimesSeconds: alignment.character_start_times_seconds,
    characterEndTimesSeconds: alignment.character_end_times_seconds,
  };
}
