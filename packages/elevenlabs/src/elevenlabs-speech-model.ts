import {
  InvalidArgumentError,
  UnsupportedFunctionalityError,
  type Experimental_SpeechModelV4StreamOptions as SpeechModelV4StreamOptions,
  type Experimental_SpeechModelV4StreamResult as SpeechModelV4StreamResult,
  type Experimental_StreamingSpeechModelV4 as StreamingSpeechModelV4,
  type SpeechModelV4,
  type SharedV4AudioFormat,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  createBinaryResponseHandler,
  createJsonResponseHandler,
  lazySchema,
  zodSchema,
  type InferSchema,
  parseProviderOptions,
  postJsonToApi,
  serializeModelOptions,
  toWebSocketUrl,
  WORKFLOW_SERIALIZE,
  WORKFLOW_DESERIALIZE,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { ElevenLabsConfig } from './elevenlabs-config';
import { elevenlabsFailedResponseHandler } from './elevenlabs-error';
import {
  createMusicTimestampsResponseHandler,
  type ElevenLabsMusicTimestampsResponse,
} from './elevenlabs-music-response';
import {
  elevenLabsSpeechModelOptionsSchema,
  type ElevenLabsSpeechModelOptions,
} from './elevenlabs-speech-model-options';
import {
  createDialogueProtocol,
  createElevenLabsSpeechStream,
  createSingleContextProtocol,
  getElevenLabsAudioFormat,
  type ElevenLabsStreamProtocol,
} from './elevenlabs-speech-stream';
import type { ElevenLabsSpeechAPITypes } from './elevenlabs-speech-api-types';
import type {
  ElevenLabsSpeechModelId,
  ElevenLabsSpeechVoiceId,
} from './elevenlabs-speech-options';

interface ElevenLabsSpeechModelConfig extends ElevenLabsConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

const defaultVoiceId = '21m00Tcm4TlvDq8ikWAM';
const defaultOutputFormat = 'mp3_44100_128';

// The TTS WebSockets do not serve the v3/v4 families; Text-to-Dialogue does.
function isDialogueModelId(modelId: string): boolean {
  return modelId.startsWith('eleven_v3') || modelId.startsWith('eleven_v4');
}

function isMusicModelId(modelId: string): boolean {
  return modelId.startsWith('music_');
}

function isSoundEffectsModelId(modelId: string): boolean {
  return modelId.startsWith('eleven_text_to_sound');
}

// Options that only the text-to-speech and dialogue endpoints read.
const textToSpeechOnlyOptions = [
  'applyLanguageTextNormalization',
  'applyTextNormalization',
  'dialogue',
  'inputs',
  'languageCode',
  'nextRequestIds',
  'nextText',
  'previousRequestIds',
  'previousText',
  'pronunciationDictionaryLocators',
  'streaming',
  'voiceSettings',
] as const;
const musicOnlyOptions = [
  'compositionPlan',
  'forceInstrumental',
  'musicLengthMs',
] as const;
const soundEffectsOnlyOptions = [
  'durationSeconds',
  'loop',
  'promptInfluence',
] as const;

export class ElevenLabsSpeechModel
  implements SpeechModelV4, StreamingSpeechModelV4
{
  readonly specificationVersion = 'v4';

  get provider(): string {
    return this.config.provider;
  }

  static [WORKFLOW_SERIALIZE](model: ElevenLabsSpeechModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: ElevenLabsSpeechModelId;
    config: ElevenLabsSpeechModelConfig;
  }) {
    return new ElevenLabsSpeechModel(options.modelId, options.config);
  }

  constructor(
    readonly modelId: ElevenLabsSpeechModelId,
    private readonly config: ElevenLabsSpeechModelConfig,
  ) {}

  private async getArgs(options: Parameters<SpeechModelV4['doGenerate']>[0]) {
    const {
      text,
      voice = '21m00Tcm4TlvDq8ikWAM',
      outputFormat = 'mp3_44100_128',
      instructions,
      language,
      speed,
      providerOptions,
    } = options;
    const warnings: SharedV4Warning[] = [];

    // Parse provider options
    const elevenLabsOptions = await parseProviderOptions({
      provider: 'elevenlabs',
      providerOptions,
      schema: elevenLabsSpeechModelOptionsSchema,
    });
    for (const option of ['streaming', 'dialogue'] as const) {
      if (elevenLabsOptions?.[option] != null) {
        warnings.push({
          type: 'unsupported',
          feature: `providerOptions.elevenlabs.${option}`,
          details: `${option === 'streaming' ? 'Streaming' : 'Dialogue'} options apply only to streaming speech (experimental_streamSpeech) and were ignored.`,
        });
      }
    }
    for (const option of [...musicOnlyOptions, ...soundEffectsOnlyOptions]) {
      if (elevenLabsOptions?.[option] != null) {
        warnings.push({
          type: 'unsupported',
          feature: `providerOptions.elevenlabs.${option}`,
          details: `ElevenLabs speech models do not support ${option}; it was ignored.`,
        });
      }
    }
    if (elevenLabsOptions?.inputs != null || this.modelId === 'eleven_v4') {
      return this.getDialogueArgs(
        options,
        elevenLabsOptions ?? {},
        elevenLabsOptions?.inputs ?? [{ text, voiceId: voice }],
        warnings,
      );
    }
    // Create request body
    const requestBody: ElevenLabsSpeechAPITypes = {
      text,
      model_id: this.modelId,
    };

    // Prepare query parameters
    const queryParams: Record<string, string> = {};

    // Map outputFormat to ElevenLabs format (as query param)
    if (outputFormat) {
      queryParams.output_format = toElevenLabsOutputFormat(outputFormat);
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

    return {
      path: `/v1/text-to-speech/${encodeURIComponent(voice as ElevenLabsSpeechVoiceId)}`,
      withTimestamps: elevenLabsOptions?.withTimestamps === true,
      requestBody,
      queryParams,
      warnings,
    };
  }

  /**
   * Text to Dialogue from explicit inputs, or a single text/voice input for v4.
   */
  private getDialogueArgs(
    {
      text,
      voice,
      outputFormat = defaultOutputFormat,
      instructions,
      language,
      speed,
    }: Parameters<SpeechModelV4['doGenerate']>[0],
    elevenLabsOptions: ElevenLabsSpeechModelOptions,
    inputs: NonNullable<ElevenLabsSpeechModelOptions['inputs']>,
    warnings: SharedV4Warning[],
  ) {
    if (!isDialogueModelId(this.modelId)) {
      throw new UnsupportedFunctionalityError({
        functionality: `dialogue with ${this.modelId}`,
        message: `ElevenLabs dialogue requires an eleven_v3 or eleven_v4 model; ${this.modelId} is not one.`,
      });
    }

    if (text.length > 0 && elevenLabsOptions.inputs != null) {
      warnings.push({
        type: 'other',
        message:
          'ElevenLabs dialogue uses providerOptions.elevenlabs.inputs; the text prompt was ignored.',
      });
    }
    const voiceSettings = elevenLabsOptions.voiceSettings;
    const ignoredOptions = {
      instructions,
      speed,
      voice: elevenLabsOptions.inputs != null ? voice : undefined,
      'providerOptions.elevenlabs.applyLanguageTextNormalization':
        elevenLabsOptions.applyLanguageTextNormalization,
      'providerOptions.elevenlabs.voiceSettings.style': voiceSettings?.style,
      'providerOptions.elevenlabs.voiceSettings.useSpeakerBoost':
        voiceSettings?.useSpeakerBoost,
    };
    const ignored = Object.entries(ignoredOptions)
      .filter(([, value]) => value != null)
      .map(([feature]) => feature);
    for (const feature of ignored) {
      warnings.push({
        type: 'unsupported',
        feature,
        details: `ElevenLabs dialogue does not support ${feature}; it was ignored.`,
      });
    }

    const queryParams: Record<string, string> = {
      output_format: toElevenLabsOutputFormat(outputFormat),
    };
    if (elevenLabsOptions.enableLogging != null) {
      queryParams.enable_logging = String(elevenLabsOptions.enableLogging);
    }

    const settings = {
      ...(voiceSettings?.stability != null && {
        stability: voiceSettings.stability,
      }),
      // Text-to-Dialogue names this setting `similarity`.
      ...(voiceSettings?.similarityBoost != null && {
        similarity: voiceSettings.similarityBoost,
      }),
    };
    const languageCode = language ?? elevenLabsOptions.languageCode;
    const locators = elevenLabsOptions.pronunciationDictionaryLocators;

    const requestBody = {
      inputs: inputs.map(input => ({
        text: input.text,
        voice_id: input.voiceId,
      })),
      model_id: this.modelId,
      ...(languageCode != null && { language_code: languageCode }),
      ...(Object.keys(settings).length > 0 && { settings }),
      ...(elevenLabsOptions.previousText != null && {
        previous_text: elevenLabsOptions.previousText,
      }),
      ...(elevenLabsOptions.nextText != null && {
        future_text: elevenLabsOptions.nextText,
      }),
      ...(locators != null && {
        pronunciation_dictionary_locators: locators.map(locator => ({
          pronunciation_dictionary_id: locator.pronunciationDictionaryId,
          ...(locator.versionId && { version_id: locator.versionId }),
        })),
      }),
      ...(elevenLabsOptions.seed != null && { seed: elevenLabsOptions.seed }),
      ...(elevenLabsOptions.applyTextNormalization != null && {
        apply_text_normalization: elevenLabsOptions.applyTextNormalization,
      }),
      ...(elevenLabsOptions.previousRequestIds != null && {
        previous_request_ids: elevenLabsOptions.previousRequestIds,
      }),
      ...(elevenLabsOptions.nextRequestIds != null && {
        next_request_ids: elevenLabsOptions.nextRequestIds,
      }),
    };

    return {
      path: '/v1/text-to-dialogue',
      withTimestamps: elevenLabsOptions.withTimestamps === true,
      requestBody,
      queryParams,
      warnings,
    };
  }

  /**
   * Music (`/v1/music`) and sound effects (`/v1/sound-generation`) take a
   * text prompt and return audio, so they share the speech model interface.
   */
  private async getAudioGenerationArgs({
    text,
    voice,
    outputFormat = defaultOutputFormat,
    instructions,
    language,
    speed,
    providerOptions,
  }: Parameters<SpeechModelV4['doGenerate']>[0]) {
    const warnings: SharedV4Warning[] = [];
    const isMusic = isMusicModelId(this.modelId);
    const label = isMusic ? 'music' : 'sound effects';
    const elevenLabsOptions = await parseProviderOptions({
      provider: 'elevenlabs',
      providerOptions,
      schema: elevenLabsSpeechModelOptionsSchema,
    });

    const ignoredCallOptions = { instructions, language, speed, voice };
    for (const [feature, value] of Object.entries(ignoredCallOptions)) {
      if (value != null) {
        warnings.push({
          type: 'unsupported',
          feature,
          details: `ElevenLabs ${label} models do not support ${feature}; it was ignored.`,
        });
      }
    }
    const ignoredProviderOptions = [
      ...textToSpeechOnlyOptions,
      ...(isMusic ? soundEffectsOnlyOptions : musicOnlyOptions),
      ...(isMusic ? [] : (['seed', 'withTimestamps'] as const)),
    ];
    for (const option of ignoredProviderOptions) {
      if (elevenLabsOptions?.[option] != null) {
        warnings.push({
          type: 'unsupported',
          feature: `providerOptions.elevenlabs.${option}`,
          details: `ElevenLabs ${label} models do not support ${option}; it was ignored.`,
        });
      }
    }

    const queryParams: Record<string, string> = {
      output_format: toElevenLabsOutputFormat(outputFormat),
    };
    if (elevenLabsOptions?.enableLogging != null) {
      queryParams.enable_logging = String(elevenLabsOptions.enableLogging);
    }

    let requestBody: Record<string, unknown>;
    let requestedDurationMs: number | undefined;
    if (isMusic) {
      const compositionPlan = elevenLabsOptions?.compositionPlan;
      if (compositionPlan != null) {
        // The API rejects prompt-only options alongside a composition plan.
        for (const option of ['forceInstrumental', 'musicLengthMs'] as const) {
          if (elevenLabsOptions?.[option] != null) {
            throw new InvalidArgumentError({
              argument: `providerOptions.elevenlabs.${option}`,
              message: `ElevenLabs music ${option} cannot be combined with compositionPlan.`,
            });
          }
        }
        if (text.length > 0) {
          warnings.push({
            type: 'other',
            message:
              'ElevenLabs music uses providerOptions.elevenlabs.compositionPlan; the text prompt was ignored.',
          });
        }
        requestedDurationMs = getCompositionPlanDurationMs(compositionPlan);
      } else {
        requestedDurationMs = elevenLabsOptions?.musicLengthMs;
      }
      requestBody = {
        ...(compositionPlan != null
          ? { composition_plan: compositionPlan }
          : { prompt: text }),
        model_id: this.modelId,
        ...(elevenLabsOptions?.musicLengthMs != null && {
          music_length_ms: elevenLabsOptions.musicLengthMs,
        }),
        ...(elevenLabsOptions?.forceInstrumental != null && {
          force_instrumental: elevenLabsOptions.forceInstrumental,
        }),
        ...(elevenLabsOptions?.seed != null && {
          seed: elevenLabsOptions.seed,
        }),
        ...(elevenLabsOptions?.withTimestamps === true && {
          with_timestamps: true,
        }),
      };
    } else {
      const durationSeconds = elevenLabsOptions?.durationSeconds;
      requestedDurationMs =
        durationSeconds != null ? durationSeconds * 1000 : undefined;
      requestBody = {
        text,
        model_id: this.modelId,
        ...(durationSeconds != null && { duration_seconds: durationSeconds }),
        ...(elevenLabsOptions?.promptInfluence != null && {
          prompt_influence: elevenLabsOptions.promptInfluence,
        }),
        ...(elevenLabsOptions?.loop != null && {
          loop: elevenLabsOptions.loop,
        }),
      };
    }

    return {
      path: isMusic
        ? elevenLabsOptions?.withTimestamps === true
          ? '/v1/music/detailed'
          : '/v1/music'
        : '/v1/sound-generation',
      requestBody,
      queryParams,
      requestedDurationMs,
      warnings,
      withTimestamps: false,
    };
  }

  async doGenerate(
    options: Parameters<SpeechModelV4['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<SpeechModelV4['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const {
      path,
      requestBody,
      queryParams,
      requestedDurationMs,
      warnings,
      withTimestamps,
    } =
      isMusicModelId(this.modelId) || isSoundEffectsModelId(this.modelId)
        ? await this.getAudioGenerationArgs(options)
        : { ...(await this.getArgs(options)), requestedDurationMs: undefined };

    const {
      value,
      responseHeaders,
      rawValue: rawResponse,
    } = await postJsonToApi<
      | Uint8Array
      | ElevenLabsSpeechTimestampsResponse
      | ElevenLabsMusicTimestampsResponse
    >({
      url: (() => {
        const baseUrl = this.config.url({
          path: `${path}${withTimestamps ? '/with-timestamps' : ''}`,
          modelId: this.modelId,
        });
        const queryString = new URLSearchParams(queryParams).toString();
        return queryString ? `${baseUrl}?${queryString}` : baseUrl;
      })(),
      headers: combineHeaders(this.config.headers?.(), options.headers),
      body: requestBody,
      failedResponseHandler: elevenlabsFailedResponseHandler,
      successfulResponseHandler:
        path === '/v1/music/detailed'
          ? createMusicTimestampsResponseHandler()
          : withTimestamps
            ? createJsonResponseHandler(
                elevenLabsSpeechTimestampsResponseSchema,
              )
            : createBinaryResponseHandler(),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const envelope =
      !(value instanceof Uint8Array) && 'audio_base64' in value
        ? value
        : undefined;
    const musicEnvelope =
      !(value instanceof Uint8Array) && 'audio' in value ? value : undefined;

    return {
      audio:
        value instanceof Uint8Array
          ? value
          : 'audio' in value
            ? value.audio
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
      providerMetadata: {
        elevenlabs: {
          ...(queryParams.output_format != null && {
            outputFormat: queryParams.output_format,
          }),
          ...(requestedDurationMs != null && { requestedDurationMs }),
          ...(musicEnvelope?.wordTimestamps != null && {
            wordTimestamps: musicEnvelope.wordTimestamps,
          }),
          ...(envelope?.alignment != null && {
            alignment: toAlignmentMetadata(envelope.alignment),
          }),
          ...(envelope?.normalized_alignment != null && {
            normalizedAlignment: toAlignmentMetadata(
              envelope.normalized_alignment,
            ),
          }),
          ...(envelope?.voice_segments != null && {
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
    };
  }

  async doStream(
    options: SpeechModelV4StreamOptions,
  ): Promise<SpeechModelV4StreamResult> {
    try {
      return await this.startStream(options);
    } catch (error) {
      // The provider owns the text stream once doStream is called.
      await options.text.cancel(error).catch(() => {});
      throw error;
    }
  }

  private async startStream(
    options: SpeechModelV4StreamOptions,
  ): Promise<SpeechModelV4StreamResult> {
    if (isMusicModelId(this.modelId) || isSoundEffectsModelId(this.modelId)) {
      throw new UnsupportedFunctionalityError({
        functionality: `streaming speech with ${this.modelId}`,
        message: `ElevenLabs ${this.modelId} does not support streaming; use generateSpeech instead.`,
      });
    }
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const elevenLabsOptions = await parseProviderOptions({
      provider: 'elevenlabs',
      providerOptions: options.providerOptions,
      schema: elevenLabsSpeechModelOptionsSchema,
    });
    const dialogue = elevenLabsOptions?.dialogue;
    const streaming = elevenLabsOptions?.streaming;

    if (dialogue != null && !isDialogueModelId(this.modelId)) {
      throw new UnsupportedFunctionalityError({
        functionality: `streaming dialogue with ${this.modelId}`,
        message: `ElevenLabs streaming dialogue requires an eleven_v3 or eleven_v4 model; ${this.modelId} is not one.`,
      });
    }
    if (dialogue == null && isDialogueModelId(this.modelId)) {
      throw new UnsupportedFunctionalityError({
        functionality: `streaming speech with ${this.modelId}`,
        message: `The ElevenLabs text-to-speech WebSocket does not serve ${this.modelId}. Set providerOptions.elevenlabs.dialogue to stream it as dialogue.`,
      });
    }
    if (
      dialogue != null &&
      this.modelId === 'eleven_v3_conversational' &&
      dialogue.voices.length !== 1
    ) {
      throw new InvalidArgumentError({
        argument: 'providerOptions.elevenlabs.dialogue.voices',
        message: `eleven_v3_conversational supports exactly one dialogue voice; received ${dialogue.voices.length}.`,
      });
    }
    // The WebSocket API rejects locators without a version, unlike HTTP.
    const unversionedLocator =
      elevenLabsOptions?.pronunciationDictionaryLocators?.find(
        locator => !locator.versionId,
      );
    if (unversionedLocator != null) {
      throw new InvalidArgumentError({
        argument: 'providerOptions.elevenlabs.pronunciationDictionaryLocators',
        message: `Streaming speech requires a versionId for pronunciation dictionary "${unversionedLocator.pronunciationDictionaryId}".`,
      });
    }
    const warnings = getStreamWarnings(options, elevenLabsOptions);
    const outputFormat =
      elevenLabsOptions?.streaming?.outputFormat ??
      toElevenLabsStreamOutputFormat(options.outputFormat);
    const voiceId = options.voice ?? defaultVoiceId;
    const path =
      dialogue != null
        ? '/v1/text-to-dialogue/stream-input'
        : `/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream-input`;
    const url = toWebSocketUrl(
      this.config.url({ path, modelId: this.modelId }),
    );

    const queryParams = {
      model_id: this.modelId,
      output_format: outputFormat,
      language_code: options.language ?? elevenLabsOptions?.languageCode,
      enable_logging: elevenLabsOptions?.enableLogging,
      // Text-to-Dialogue has a fixed inactivity timeout and no auto/SSML mode.
      inactivity_timeout:
        dialogue == null ? streaming?.inactivityTimeout : null,
      sync_alignment: streaming?.syncAlignment,
      auto_mode: dialogue == null ? streaming?.autoMode : null,
      apply_text_normalization: elevenLabsOptions?.applyTextNormalization,
      seed: elevenLabsOptions?.seed,
      enable_ssml_parsing:
        dialogue == null ? streaming?.enableSsmlParsing : null,
    };
    for (const [key, value] of Object.entries(queryParams)) {
      if (value != null) {
        url.searchParams.set(key, String(value));
      }
    }

    let protocol: ElevenLabsStreamProtocol;
    if (dialogue != null) {
      if (options.voice != null && !dialogue.voices.includes(options.voice)) {
        throw new InvalidArgumentError({
          argument: 'voice',
          message: `ElevenLabs streaming dialogue voice "${options.voice}" is not listed in providerOptions.elevenlabs.dialogue.voices.`,
        });
      }
      protocol = createDialogueProtocol({
        initMessage: getDialogueInitMessage(dialogue, elevenLabsOptions),
        voices: dialogue.voices,
        defaultVoice: options.voice ?? dialogue.voices[0],
        // The v3 family accepts a single message per session.
        incremental: this.modelId.startsWith('eleven_v4'),
      });
    } else {
      protocol = createSingleContextProtocol({
        initMessage: getStreamInitMessage(options, elevenLabsOptions),
        voice: voiceId,
      });
    }

    // The API key goes in the init message (not a header) so native
    // WebSockets work; it is kept out of the reported request body.
    const { 'xi-api-key': apiKey, ...headers } = combineHeaders(
      this.config.headers?.(),
      options.headers,
    );

    return {
      request: {
        body: { url: url.toString(), initMessage: protocol.initMessage },
      },
      response: { timestamp: currentDate, modelId: this.modelId },
      stream: createElevenLabsSpeechStream({
        abortSignal: options.abortSignal,
        apiKey,
        audioFormat: getElevenLabsAudioFormat(outputFormat),
        headers,
        includeRawChunks: options.includeRawChunks,
        // Text-to-Dialogue has a fixed 20 s inactivity timeout, so it always
        // keeps alive; TTS honors an explicit inactivityTimeout instead.
        keepalive: dialogue != null || streaming?.inactivityTimeout == null,
        protocol,
        text: options.text,
        url,
        warnings,
        webSocket: this.config.webSocket,
      }),
    };
  }
}

function getDialogueInitMessage(
  dialogue: NonNullable<ElevenLabsSpeechModelOptions['dialogue']>,
  elevenLabsOptions: ElevenLabsSpeechModelOptions | undefined,
): Record<string, unknown> {
  const locators = elevenLabsOptions?.pronunciationDictionaryLocators;
  return {
    ...(dialogue.voiceSettings?.stability != null && {
      voice_settings: { stability: dialogue.voiceSettings.stability },
    }),
    ...(locators != null && {
      pronunciation_dictionary_locators: locators.map(locator => ({
        pronunciation_dictionary_id: locator.pronunciationDictionaryId,
        version_id: locator.versionId,
      })),
    }),
  };
}

function getStreamInitMessage(
  options: SpeechModelV4StreamOptions,
  elevenLabsOptions: ElevenLabsSpeechModelOptions | undefined,
): Record<string, unknown> {
  const voiceSettings = elevenLabsOptions?.voiceSettings;
  const voiceSettingsMessage = {
    ...(voiceSettings?.stability != null && {
      stability: voiceSettings.stability,
    }),
    ...(voiceSettings?.similarityBoost != null && {
      similarity_boost: voiceSettings.similarityBoost,
    }),
    ...(voiceSettings?.style != null && { style: voiceSettings.style }),
    ...(voiceSettings?.useSpeakerBoost != null && {
      use_speaker_boost: voiceSettings.useSpeakerBoost,
    }),
    ...(options.speed != null && { speed: options.speed }),
  };
  const chunkLengthSchedule = elevenLabsOptions?.streaming?.chunkLengthSchedule;
  const locators = elevenLabsOptions?.pronunciationDictionaryLocators;

  return {
    // The protocol requires a single space as the first message text.
    text: ' ',
    ...(Object.keys(voiceSettingsMessage).length > 0 && {
      voice_settings: voiceSettingsMessage,
    }),
    ...(chunkLengthSchedule != null && {
      generation_config: { chunk_length_schedule: chunkLengthSchedule },
    }),
    ...(locators != null && {
      pronunciation_dictionary_locators: locators.map(locator => ({
        pronunciation_dictionary_id: locator.pronunciationDictionaryId,
        version_id: locator.versionId,
      })),
    }),
  };
}

function getStreamWarnings(
  options: SpeechModelV4StreamOptions,
  elevenLabsOptions: ElevenLabsSpeechModelOptions | undefined,
): SharedV4Warning[] {
  const warnings: SharedV4Warning[] = [];
  if (options.instructions) {
    warnings.push({
      type: 'unsupported',
      feature: 'instructions',
      details:
        'ElevenLabs speech models do not support instructions. Instructions parameter was ignored.',
    });
  }
  // HTTP-only options: neither WebSocket protocol carries them.
  for (const option of [
    'applyLanguageTextNormalization',
    'withTimestamps',
    'inputs',
    'nextRequestIds',
    'nextText',
    'previousRequestIds',
    'previousText',
    ...musicOnlyOptions,
    ...soundEffectsOnlyOptions,
  ] as const) {
    if (elevenLabsOptions?.[option] != null) {
      warnings.push({
        type: 'unsupported',
        feature: `providerOptions.elevenlabs.${option}`,
        details: `ElevenLabs streaming speech does not support ${option}.`,
      });
    }
  }
  if (elevenLabsOptions?.dialogue != null) {
    // Text-to-Dialogue takes only dialogue.voiceSettings.stability, and has a
    // fixed inactivity timeout and no chunking, auto, or SSML modes.
    const ignored = [
      ...(options.speed != null ? ['speed'] : []),
      ...(elevenLabsOptions.voiceSettings != null
        ? ['providerOptions.elevenlabs.voiceSettings']
        : []),
      ...(
        [
          'autoMode',
          'chunkLengthSchedule',
          'enableSsmlParsing',
          'inactivityTimeout',
        ] as const
      )
        .filter(option => elevenLabsOptions.streaming?.[option] != null)
        .map(option => `providerOptions.elevenlabs.streaming.${option}`),
    ];
    for (const feature of ignored) {
      warnings.push({
        type: 'unsupported',
        feature,
        details: `ElevenLabs streaming dialogue does not support ${feature}; it was ignored.`,
      });
    }
  }
  return warnings;
}

/**
 * Maps a portable output format to an ElevenLabs `output_format`. Exact
 * native formats (e.g. other MP3 bitrates) use
 * `providerOptions.elevenlabs.streaming.outputFormat`.
 */
export function toElevenLabsStreamOutputFormat(
  format: SharedV4AudioFormat | undefined,
): string {
  if (format == null) return defaultOutputFormat;
  const { rate } = format;
  // MIME types are case-insensitive and may carry parameters.
  const type = format.type.split(';')[0].trim().toLowerCase();
  switch (type) {
    case 'audio/mpeg':
    case 'audio/mp3':
      if (rate == null || rate === 44100) return 'mp3_44100_128';
      if (rate === 22050) return 'mp3_22050_32';
      break;
    case 'audio/pcm':
    case 'audio/l16': {
      const pcmRate = rate ?? 24000;
      if ([8000, 16000, 22050, 24000, 44100, 48000].includes(pcmRate)) {
        return `pcm_${pcmRate}`;
      }
      break;
    }
    case 'audio/pcmu':
    case 'audio/basic':
      if (rate == null || rate === 8000) return 'ulaw_8000';
      break;
    case 'audio/pcma':
      if (rate == null || rate === 8000) return 'alaw_8000';
      break;
    case 'audio/opus':
    case 'audio/ogg':
      if (rate == null || rate === 48000) return 'opus_48000_64';
      break;
  }
  throw new InvalidArgumentError({
    argument: 'outputFormat',
    message: `ElevenLabs streaming speech does not support the output format ${JSON.stringify(format)}. Use providerOptions.elevenlabs.streaming.outputFormat for a native ElevenLabs format.`,
  });
}

function toElevenLabsOutputFormat(outputFormat: string): string {
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
  return formatMap[outputFormat] || outputFormat;
}

/**
 * Total length of a music composition plan: `sections` (music_v1) or
 * `chunks` (music_v2+). Undefined when the plan has no parts.
 */
function getCompositionPlanDurationMs(
  plan: NonNullable<ElevenLabsSpeechModelOptions['compositionPlan']>,
): number | undefined {
  const partDurationsMs =
    'sections' in plan
      ? plan.sections.map(section => section.duration_ms)
      : plan.chunks.map(chunk =>
          // Audio reference chunks reuse a time range of an earlier song.
          'duration_ms' in chunk
            ? chunk.duration_ms
            : chunk.range.end_ms - chunk.range.start_ms,
        );
  if (
    partDurationsMs.length === 0 ||
    partDurationsMs.some(durationMs => durationMs <= 0)
  ) {
    return undefined;
  }
  return partDurationsMs.reduce((sum, durationMs) => sum + durationMs, 0);
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
