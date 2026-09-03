import type { SharedV4Warning, SpeechModelV4 } from '@ai-sdk/provider';
import {
  combineHeaders,
  createBinaryResponseHandler,
  parseProviderOptions,
  postJsonToApi,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import type { FishAudioConfig } from './fish-audio-config';
import { fishAudioFailedResponseHandler } from './fish-audio-error';
import type {
  FishAudioSpeechAPITypes,
  FishAudioSpeechFormat,
  FishAudioProsodyControl,
} from './fish-audio-speech-api-types';
import { fishAudioSpeechModelOptionsSchema } from './fish-audio-speech-model-options';
import type { FishAudioSpeechModelId } from './fish-audio-speech-options';

interface FishAudioSpeechModelConfig extends FishAudioConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

const SUPPORTED_FORMATS: FishAudioSpeechFormat[] = [
  'wav',
  'pcm',
  'mp3',
  'opus',
];

const DEFAULT_FORMAT: FishAudioSpeechFormat = 'mp3';

// Fish Audio accepts `prosody.speed` between 0.5 and 2.0.
const MIN_SPEED = 0.5;
const MAX_SPEED = 2;

function resolveFormat({
  outputFormat,
  warnings,
}: {
  outputFormat: string | undefined;
  warnings: SharedV4Warning[];
}): FishAudioSpeechFormat {
  if (outputFormat == null) {
    return DEFAULT_FORMAT;
  }

  const normalized = outputFormat.toLowerCase();
  const matched = SUPPORTED_FORMATS.find(format => format === normalized);

  if (matched == null) {
    warnings.push({
      type: 'unsupported',
      feature: 'outputFormat',
      details: `Fish Audio does not support the output format "${outputFormat}". Falling back to ${DEFAULT_FORMAT}. Supported formats are ${SUPPORTED_FORMATS.join(', ')}.`,
    });
    return DEFAULT_FORMAT;
  }

  return matched;
}

export class FishAudioSpeechModel implements SpeechModelV4 {
  readonly specificationVersion = 'v4';

  get provider(): string {
    return this.config.provider;
  }

  static [WORKFLOW_SERIALIZE](model: FishAudioSpeechModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: FishAudioSpeechModelId;
    config: FishAudioSpeechModelConfig;
  }) {
    return new FishAudioSpeechModel(options.modelId, options.config);
  }

  constructor(
    readonly modelId: FishAudioSpeechModelId,
    private readonly config: FishAudioSpeechModelConfig,
  ) {}

  private async getArgs({
    text,
    voice,
    outputFormat,
    instructions,
    language,
    speed,
    providerOptions,
  }: Parameters<SpeechModelV4['doGenerate']>[0]) {
    const warnings: SharedV4Warning[] = [];

    const fishAudioOptions = await parseProviderOptions({
      provider: 'fishAudio',
      providerOptions,
      schema: fishAudioSpeechModelOptionsSchema,
    });

    const format = resolveFormat({ outputFormat, warnings });

    const requestBody: FishAudioSpeechAPITypes = {
      text,
      format,
    };

    // `providerOptions.fishAudio.referenceId` wins over the generic `voice` so
    // that multi-speaker arrays are expressible.
    const referenceId = fishAudioOptions?.referenceId ?? voice;
    if (referenceId != null) {
      requestBody.reference_id = referenceId;
    }

    const prosody: FishAudioProsodyControl = {};

    if (speed != null) {
      if (speed >= MIN_SPEED && speed <= MAX_SPEED) {
        prosody.speed = speed;
      } else {
        warnings.push({
          type: 'unsupported',
          feature: 'speed',
          details: `Fish Audio speed must be between ${MIN_SPEED} and ${MAX_SPEED}. The speed option was ignored.`,
        });
      }
    }

    if (fishAudioOptions?.volume != null) {
      prosody.volume = fishAudioOptions.volume;
    }

    if (fishAudioOptions?.normalizeLoudness != null) {
      // Fish Audio accepts `normalize_loudness` on s1 but ignores it, so warn
      // rather than let it silently do nothing. Only s1 is known to ignore it;
      // unrecognized model IDs are left alone.
      if (this.modelId === 's1') {
        warnings.push({
          type: 'unsupported',
          feature: 'providerOptions.fishAudio.normalizeLoudness',
          details:
            'Fish Audio ignores normalizeLoudness on s1. It is supported by the S2 family (s2-pro, s2.1-pro).',
        });
      } else {
        prosody.normalize_loudness = fishAudioOptions.normalizeLoudness;
      }
    }

    if (Object.keys(prosody).length > 0) {
      requestBody.prosody = prosody;
    }

    if (language != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'language',
        details:
          'Fish Audio infers the language from the input text and the selected voice, and has no language parameter. The language option was ignored.',
      });
    }

    if (instructions != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'instructions',
        details:
          'Fish Audio does not support instructions. The instructions option was ignored.',
      });
    }

    if (fishAudioOptions != null) {
      if (fishAudioOptions.sampleRate != null) {
        requestBody.sample_rate = fishAudioOptions.sampleRate;
      }

      if (fishAudioOptions.mp3Bitrate != null) {
        if (format === 'mp3') {
          requestBody.mp3_bitrate = fishAudioOptions.mp3Bitrate;
        } else {
          warnings.push({
            type: 'unsupported',
            feature: 'providerOptions.fishAudio.mp3Bitrate',
            details: `mp3Bitrate only applies to mp3 output. The option was ignored for ${format} output.`,
          });
        }
      }

      if (fishAudioOptions.opusBitrate != null) {
        if (format === 'opus') {
          requestBody.opus_bitrate = fishAudioOptions.opusBitrate;
        } else {
          warnings.push({
            type: 'unsupported',
            feature: 'providerOptions.fishAudio.opusBitrate',
            details: `opusBitrate only applies to opus output. The option was ignored for ${format} output.`,
          });
        }
      }

      if (fishAudioOptions.latency != null) {
        requestBody.latency = fishAudioOptions.latency;
      }

      if (fishAudioOptions.temperature != null) {
        requestBody.temperature = fishAudioOptions.temperature;
      }

      if (fishAudioOptions.topP != null) {
        requestBody.top_p = fishAudioOptions.topP;
      }

      if (fishAudioOptions.chunkLength != null) {
        requestBody.chunk_length = fishAudioOptions.chunkLength;
      }

      if (fishAudioOptions.minChunkLength != null) {
        requestBody.min_chunk_length = fishAudioOptions.minChunkLength;
      }

      if (fishAudioOptions.normalize != null) {
        requestBody.normalize = fishAudioOptions.normalize;
      }

      if (fishAudioOptions.maxNewTokens != null) {
        requestBody.max_new_tokens = fishAudioOptions.maxNewTokens;
      }

      if (fishAudioOptions.repetitionPenalty != null) {
        requestBody.repetition_penalty = fishAudioOptions.repetitionPenalty;
      }

      if (fishAudioOptions.conditionOnPreviousChunks != null) {
        requestBody.condition_on_previous_chunks =
          fishAudioOptions.conditionOnPreviousChunks;
      }

      if (fishAudioOptions.earlyStopThreshold != null) {
        requestBody.early_stop_threshold = fishAudioOptions.earlyStopThreshold;
      }

      if (fishAudioOptions.features != null) {
        requestBody.features = fishAudioOptions.features;
      }
    }

    return { requestBody, warnings };
  }

  async doGenerate(
    options: Parameters<SpeechModelV4['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<SpeechModelV4['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { requestBody, warnings } = await this.getArgs(options);

    const {
      value: audio,
      responseHeaders,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: this.config.url({ path: '/v1/tts', modelId: this.modelId }),
      // Fish Audio selects the TTS model with a `model` HTTP header rather
      // than a request body field.
      headers: combineHeaders(
        this.config.headers?.(),
        { model: this.modelId },
        options.headers,
      ),
      body: requestBody,
      failedResponseHandler: fishAudioFailedResponseHandler,
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
}
