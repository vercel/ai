import {
  InvalidArgumentError,
  UnsupportedFunctionalityError,
  type Experimental_SpeechModelV4StreamOptions as SpeechModelV4StreamOptions,
  type Experimental_SpeechModelV4StreamResult as SpeechModelV4StreamResult,
  type Experimental_StreamingSpeechModelV4 as StreamingSpeechModelV4,
  type SpeechModelV4,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createBinaryResponseHandler,
  parseProviderOptions,
  postJsonToApi,
  serializeModelOptions,
  toWebSocketUrl,
  WORKFLOW_SERIALIZE,
  WORKFLOW_DESERIALIZE,
} from '@ai-sdk/provider-utils';
import type { ElevenLabsConfig } from './elevenlabs-config';
import { elevenlabsFailedResponseHandler } from './elevenlabs-error';
import {
  elevenLabsSpeechModelOptionsSchema,
  type ElevenLabsSpeechModelOptions,
} from './elevenlabs-speech-model-options';
import {
  createDialogueProtocol,
  createElevenLabsSpeechStream,
  createMultiContextProtocol,
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

export class ElevenLabsSpeechModel implements StreamingSpeechModelV4 {
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

  private async getArgs({
    text,
    voice = '21m00Tcm4TlvDq8ikWAM',
    outputFormat = 'mp3_44100_128',
    instructions,
    language,
    speed,
    providerOptions,
  }: Parameters<SpeechModelV4['doGenerate']>[0]) {
    const warnings: SharedV4Warning[] = [];

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
      requestBody,
      queryParams,
      warnings,
      voiceId: voice as ElevenLabsSpeechVoiceId,
    };
  }

  async doGenerate(
    options: Parameters<SpeechModelV4['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<SpeechModelV4['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { requestBody, queryParams, warnings, voiceId } =
      await this.getArgs(options);

    const {
      value: audio,
      responseHeaders,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: (() => {
        const baseUrl = this.config.url({
          path: `/v1/text-to-speech/${voiceId}`,
          modelId: this.modelId,
        });
        const queryString = new URLSearchParams(queryParams).toString();
        return queryString ? `${baseUrl}?${queryString}` : baseUrl;
      })(),
      headers: combineHeaders(this.config.headers?.(), options.headers),
      body: requestBody,
      failedResponseHandler: elevenlabsFailedResponseHandler,
      successfulResponseHandler: createBinaryResponseHandler(),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    return {
      audio,
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
    if (dialogue != null && streaming?.contextId != null) {
      throw new InvalidArgumentError({
        argument: 'providerOptions',
        message:
          'providerOptions.elevenlabs.dialogue cannot be combined with streaming.contextId',
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
    const outputFormat = toElevenLabsOutputFormat(
      options.outputFormat ?? defaultOutputFormat,
    );
    const voiceId = options.voice ?? defaultVoiceId;
    const voicePath = `/v1/text-to-speech/${encodeURIComponent(voiceId)}`;
    const path =
      dialogue != null
        ? '/v1/text-to-dialogue/stream-input'
        : streaming?.contextId != null
          ? `${voicePath}/multi-stream-input`
          : `${voicePath}/stream-input`;
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
      if (options.voice != null) {
        warnings.push({
          type: 'unsupported',
          feature: 'voice',
          details:
            'ElevenLabs streaming dialogue uses providerOptions.elevenlabs.dialogue.voices; voice was ignored.',
        });
      }
      protocol = createDialogueProtocol({
        initMessage: getDialogueInitMessage(dialogue, elevenLabsOptions),
        voices: dialogue.voices,
        // The v3 family accepts a single message per session.
        incremental: this.modelId.startsWith('eleven_v4'),
      });
    } else {
      const initMessage = getStreamInitMessage(options, elevenLabsOptions);
      protocol =
        streaming?.contextId != null
          ? createMultiContextProtocol(initMessage, streaming.contextId)
          : createSingleContextProtocol(initMessage);
    }

    return {
      request: {
        body: { url: url.toString(), initMessage: protocol.initMessage },
      },
      response: { timestamp: currentDate, modelId: this.modelId },
      stream: createElevenLabsSpeechStream({
        abortSignal: options.abortSignal,
        audioFormat: getElevenLabsAudioFormat(outputFormat),
        headers: combineHeaders(this.config.headers?.(), options.headers),
        includeRawChunks: options.includeRawChunks,
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
  for (const option of [
    'applyLanguageTextNormalization',
    'nextRequestIds',
    'nextText',
    'previousRequestIds',
    'previousText',
  ] as const) {
    if (elevenLabsOptions?.[option] != null) {
      warnings.push({
        type: 'unsupported',
        feature: `providerOptions.elevenlabs.${option}`,
        details: `ElevenLabs streaming speech does not support ${option}.`,
      });
    }
  }
  return warnings;
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
  };
  return formatMap[outputFormat] || outputFormat;
}
