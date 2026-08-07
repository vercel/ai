import type { SpeechModelV4, SharedV4Warning } from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonResponseHandler,
  parseProviderOptions,
  postJsonToApi,
  serializeModelOptions,
  WORKFLOW_SERIALIZE,
  WORKFLOW_DESERIALIZE,
} from '@ai-sdk/provider-utils';
import type { SpeechifyConfig } from './speechify-config';
import { speechifyFailedResponseHandler } from './speechify-error';
import { speechifySpeechModelOptionsSchema } from './speechify-speech-model-options';
import {
  type SpeechifySpeechAudioFormat,
  type SpeechifySpeechRequest,
  speechifySpeechResponseSchema,
} from './speechify-api-types';
import {
  type SpeechifySpeechModelId,
  type SpeechifySpeechVoiceId,
  SIMBA_3_2_VOICES,
} from './speechify-speech-options';

const DEFAULT_VOICE_ID: SpeechifySpeechVoiceId = 'geffen_32';

const SIMPLE_AUDIO_FORMATS: readonly SpeechifySpeechAudioFormat[] = [
  'mp3',
  'wav',
  'ogg',
  'aac',
  'pcm',
];

function isSimpleAudioFormat(
  value: string,
): value is SpeechifySpeechAudioFormat {
  return (SIMPLE_AUDIO_FORMATS as readonly string[]).includes(value);
}

// Speechify codec output formats, e.g. `mp3_24000_128`, `pcm_16000`, `ulaw_8000`.
const CODEC_OUTPUT_FORMAT_REGEX = /^(mp3|pcm|ogg|aac|ulaw|wav)_\d+(_\d+)?$/;

const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, char => XML_ESCAPES[char]);
}

interface SpeechifySpeechModelConfig extends SpeechifyConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

export class SpeechifySpeechModel implements SpeechModelV4 {
  readonly specificationVersion = 'v4';

  get provider(): string {
    return this.config.provider;
  }

  static [WORKFLOW_SERIALIZE](model: SpeechifySpeechModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: SpeechifySpeechModelId;
    config: SpeechifySpeechModelConfig;
  }) {
    return new SpeechifySpeechModel(options.modelId, options.config);
  }

  constructor(
    readonly modelId: SpeechifySpeechModelId,
    private readonly config: SpeechifySpeechModelConfig,
  ) {}

  private async getArgs({
    text,
    voice = DEFAULT_VOICE_ID,
    outputFormat,
    instructions,
    speed,
    language,
    providerOptions,
  }: Parameters<SpeechModelV4['doGenerate']>[0]) {
    const warnings: SharedV4Warning[] = [];

    // Warn when a simba-3.2 curated voice is used with a non-simba-3.2 model
    if (
      (SIMBA_3_2_VOICES as readonly string[]).includes(voice) &&
      this.modelId !== 'simba-3.2'
    ) {
      warnings.push({
        type: 'unsupported',
        feature: 'voice',
        details: `The voice "${voice}" is a simba-3.2 curated voice and may not be available on the ${this.modelId} model. Use a voice from the model's supported voice set.`,
      });
    }

    const speechifyOptions = await parseProviderOptions({
      provider: 'speechify',
      providerOptions,
      schema: speechifySpeechModelOptionsSchema,
    });

    const isSsmlInput =
      speechifyOptions?.ssml === true || text.trimStart().startsWith('<speak');

    let input = text;
    if (speed != null) {
      if (isSsmlInput) {
        warnings.push({
          type: 'unsupported',
          feature: 'speed',
          details:
            'The speed setting is ignored because the input is SSML. Use an SSML <prosody rate="..."> tag to control rate.',
        });
      } else {
        input = `<speak><prosody rate="${Math.round(speed * 100)}%">${escapeXml(text)}</prosody></speak>`;
      }
    }

    const requestBody: SpeechifySpeechRequest = {
      input,
      voice_id: voice,
      model: this.modelId,
    };

    if (language != null) {
      requestBody.language = language;
    }

    if (speechifyOptions?.outputFormat != null) {
      requestBody.output_format = speechifyOptions.outputFormat;
    } else if (outputFormat != null) {
      if (CODEC_OUTPUT_FORMAT_REGEX.test(outputFormat)) {
        requestBody.output_format = outputFormat;
      } else if (isSimpleAudioFormat(outputFormat)) {
        requestBody.audio_format = outputFormat;
      } else {
        warnings.push({
          type: 'unsupported',
          feature: 'outputFormat',
          details: `Unsupported output format: ${outputFormat}. Using the provider default instead.`,
        });
      }
    }

    if (
      speechifyOptions?.loudnessNormalization != null ||
      speechifyOptions?.textNormalization != null
    ) {
      requestBody.options = {};
      if (speechifyOptions.loudnessNormalization != null) {
        requestBody.options.loudness_normalization =
          speechifyOptions.loudnessNormalization;
      }
      if (speechifyOptions.textNormalization != null) {
        requestBody.options.text_normalization =
          speechifyOptions.textNormalization;
      }
    }

    if (instructions != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'instructions',
        details:
          'Speechify speech models do not support instructions. The instructions parameter was ignored.',
      });
    }

    return {
      requestBody,
      warnings,
    };
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
      url: this.config.url({
        path: '/v1/audio/speech',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers?.(), options.headers),
      body: requestBody,
      failedResponseHandler: speechifyFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        speechifySpeechResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    return {
      audio: response.audio_data,
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
        speechify: {
          audioFormat: response.audio_format ?? null,
          billableCharactersCount: response.billable_characters_count ?? null,
          speechMarks: (response.speech_marks ?? null) as never,
        },
      },
    };
  }
}
