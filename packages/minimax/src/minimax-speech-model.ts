import {
  AISDKError,
  type SharedV4Warning,
  type SpeechModelV4,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  parseProviderOptions,
  postJsonToApi,
  resolve,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  type FetchFunction,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import {
  minimaxSpeechModelOptionsSchema,
  type MiniMaxSpeechModelOptions,
} from './minimax-speech-model-options';
import type { MiniMaxSpeechModelId } from './minimax-speech-settings';

interface MiniMaxSpeechModelConfig {
  provider: string;
  baseURL: string;
  headers: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
}

type MiniMaxAudioFormat = 'mp3' | 'wav' | 'flac' | 'pcm';

export class MiniMaxSpeechModel implements SpeechModelV4 {
  readonly specificationVersion = 'v4';

  get provider(): string {
    return this.config.provider;
  }

  static [WORKFLOW_SERIALIZE](model: MiniMaxSpeechModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: MiniMaxSpeechModelId;
    config: MiniMaxSpeechModelConfig;
  }) {
    return new MiniMaxSpeechModel(options.modelId, options.config);
  }

  constructor(
    readonly modelId: MiniMaxSpeechModelId,
    private readonly config: MiniMaxSpeechModelConfig,
  ) {}

  private async getArgs({
    text,
    voice,
    outputFormat = 'mp3',
    instructions,
    speed,
    language,
    providerOptions,
  }: Parameters<SpeechModelV4['doGenerate']>[0]) {
    const warnings: SharedV4Warning[] = [];

    const minimaxOptions = (await parseProviderOptions({
      provider: 'minimax',
      providerOptions,
      schema: minimaxSpeechModelOptionsSchema,
    })) as MiniMaxSpeechModelOptions | undefined;

    let audioFormat: MiniMaxAudioFormat = 'mp3';
    if (['mp3', 'wav', 'flac', 'pcm'].includes(outputFormat)) {
      audioFormat = outputFormat as MiniMaxAudioFormat;
    } else {
      warnings.push({
        type: 'unsupported',
        feature: 'outputFormat',
        details: `Unsupported output format: ${outputFormat}. Using mp3 instead.`,
      });
    }

    if (instructions != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'instructions',
        details:
          'MiniMax speech models do not support the `instructions` option. It was ignored.',
      });
    }

    if (language != null && minimaxOptions?.languageBoost == null) {
      warnings.push({
        type: 'unsupported',
        feature: 'language',
        details:
          'MiniMax requires a provider-specific language name. Use providerOptions.minimax.languageBoost.',
      });
    }

    if (
      voice == null &&
      (speed != null || minimaxOptions?.voiceSetting != null)
    ) {
      warnings.push({
        type: 'unsupported',
        feature: 'voice',
        details:
          'MiniMax requires a voice when voice settings are provided. The voice settings were ignored.',
      });
    }

    const voiceSetting =
      voice == null
        ? undefined
        : {
            voice_id: voice,
            speed,
            vol: minimaxOptions?.voiceSetting?.volume,
            pitch: minimaxOptions?.voiceSetting?.pitch,
            emotion: minimaxOptions?.voiceSetting?.emotion,
          };

    const audioSetting = {
      sample_rate: minimaxOptions?.audioSetting?.sampleRate,
      bitrate: minimaxOptions?.audioSetting?.bitrate,
      format: audioFormat,
      channel: minimaxOptions?.audioSetting?.channel,
    };

    const voiceModify = minimaxOptions?.voiceModify;
    const requestBody = {
      model: this.modelId,
      text,
      stream: false,
      output_format: 'hex',
      ...(voiceSetting == null ? {} : { voice_setting: voiceSetting }),
      audio_setting: audioSetting,
      language_boost: minimaxOptions?.languageBoost,
      pronunciation_dict:
        minimaxOptions?.pronunciationDictionary == null
          ? undefined
          : { tone: minimaxOptions.pronunciationDictionary.tone },
      voice_modify:
        voiceModify == null
          ? undefined
          : {
              pitch: voiceModify.pitch,
              intensity: voiceModify.intensity,
              timbre: voiceModify.timbre,
              sound_effects: voiceModify.soundEffect,
            },
      subtitle_enable: minimaxOptions?.subtitleEnable,
    };

    return { requestBody, warnings };
  }

  async doGenerate(
    options: Parameters<SpeechModelV4['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<SpeechModelV4['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { requestBody, warnings } = await this.getArgs(options);

    const {
      value: response,
      responseHeaders,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: `${this.config.baseURL}/v1/t2a_v2`,
      headers: combineHeaders(
        await resolve(this.config.headers),
        options.headers,
      ),
      body: requestBody,
      failedResponseHandler: minimaxSpeechFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        minimaxSpeechResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    if (
      response.base_resp?.status_code != null &&
      response.base_resp.status_code !== 0
    ) {
      throw new AISDKError({
        name: 'MINIMAX_SPEECH_GENERATION_FAILED',
        message:
          response.base_resp.status_msg ??
          `MiniMax speech generation failed with status ${response.base_resp.status_code}.`,
      });
    }

    const audioHex = response.data?.audio;
    if (audioHex == null) {
      throw new AISDKError({
        name: 'MINIMAX_SPEECH_RESPONSE_MISSING_AUDIO',
        message: 'MiniMax speech generation returned no audio data.',
      });
    }

    return {
      audio: decodeHexAudio(audioHex),
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

function decodeHexAudio(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) {
    throw new AISDKError({
      name: 'MINIMAX_SPEECH_RESPONSE_INVALID_AUDIO',
      message: 'MiniMax speech generation returned invalid hex audio data.',
    });
  }

  const audio = new Uint8Array(hex.length / 2);
  for (let index = 0; index < hex.length; index += 2) {
    audio[index / 2] = Number.parseInt(hex.slice(index, index + 2), 16);
  }
  return audio;
}

const minimaxSpeechResponseSchema = z.object({
  data: z
    .object({
      audio: z.string().nullish(),
      status: z.number().nullish(),
    })
    .nullish(),
  base_resp: z
    .object({
      status_code: z.number().nullish(),
      status_msg: z.string().nullish(),
    })
    .nullish(),
});

const minimaxSpeechErrorSchema = z.object({
  error: z
    .object({
      message: z.string().nullish(),
    })
    .nullish(),
  base_resp: z
    .object({
      status_code: z.number().nullish(),
      status_msg: z.string().nullish(),
    })
    .nullish(),
});

const minimaxSpeechFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: minimaxSpeechErrorSchema,
  errorToMessage: data =>
    data.error?.message ??
    data.base_resp?.status_msg ??
    'MiniMax speech generation error',
});
