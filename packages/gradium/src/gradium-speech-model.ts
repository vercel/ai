import {
  APICallError,
  type SpeechModelV4,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createBinaryResponseHandler,
  extractResponseHeaders,
  parseProviderOptions,
  postJsonToApi,
  type ResponseHandler,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import {
  GRADIUM_TTS_OUTPUT_FORMATS,
  type GradiumTTSJsonConfig,
  type GradiumTTSMessage,
  type GradiumTTSOutputFormat,
  type GradiumTTSRequestBody,
} from './gradium-api-types';
import type { GradiumConfig } from './gradium-config';
import { gradiumFailedResponseHandler } from './gradium-error';
import type { GradiumSpeechModelId } from './gradium-speech-options';
import { gradiumSpeechModelOptionsSchema } from './gradium-speech-model-options';

// Default voice from Gradium's library — used when neither the AI SDK
// top-level `voice` nor `providerOptions.gradium.voiceId` is supplied.
const DEFAULT_VOICE_ID = 'YTpq7expH9539ERJ';

type GradiumTTSJsonResponse = {
  audio: Uint8Array;
  body: string;
  messages: GradiumTTSMessage[];
  text: Array<{ text: string; startSecond?: number; endSecond?: number }>;
};

/**
 * Map the AI SDK's free-form `outputFormat` to one of Gradium's
 * canonical formats. Gradium also accepts telephony / explicit-rate PCM
 * formats — those are exposed via `providerOptions.gradium.outputFormat`.
 */
function mapOutputFormat(requested: string | undefined): {
  format: GradiumTTSOutputFormat;
  warnings: SharedV4Warning[];
} {
  if (!requested) return { format: 'wav', warnings: [] };
  const lowered = requested.toLowerCase();

  if ((GRADIUM_TTS_OUTPUT_FORMATS as readonly string[]).includes(lowered)) {
    return { format: lowered as GradiumTTSOutputFormat, warnings: [] };
  }

  if (lowered === 'mp3' || lowered === 'flac' || lowered === 'aac') {
    return {
      format: 'wav',
      warnings: [
        {
          type: 'unsupported',
          feature: 'outputFormat',
          details: `Gradium does not natively support ${lowered}; falling back to wav. Re-encode client-side if needed.`,
        },
      ],
    };
  }

  return { format: 'wav', warnings: [] };
}

function mapSpeedToPaddingBonus(speed: number): number {
  // AI SDK speed uses 1 as neutral and larger values as faster. Gradium's
  // padding bonus uses 0 as neutral and negative values as less spacing.
  return Math.max(-4, Math.min(4, 1 - speed));
}

function hasStructuredJsonConfigOptions(options: {
  cfgCoef?: number | null;
  paddingBonus?: number | null;
  temperature?: number | null;
  rewriteRules?: string | null;
  pronunciationDictionary?: string | null;
}): boolean {
  return (
    options.cfgCoef != null ||
    options.paddingBonus != null ||
    options.temperature != null ||
    options.rewriteRules != null ||
    options.pronunciationDictionary != null
  );
}

function fromBase64(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function parseJsonMessages(body: string): GradiumTTSMessage[] {
  const trimmed = body.trim();
  if (trimmed.length === 0) return [];

  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      throw new Error('Gradium returned JSON, but not a message array.');
    }
    return parsed as GradiumTTSMessage[];
  }

  return trimmed
    .split(/\r?\n/)
    .filter(line => line.length > 0)
    .map(line => {
      try {
        return JSON.parse(line) as GradiumTTSMessage;
      } catch {
        throw new Error(
          `Gradium returned a malformed TTS JSON message: ${line.slice(0, 200)}`,
        );
      }
    });
}

function createGradiumTTSJsonResponseHandler(): ResponseHandler<GradiumTTSJsonResponse> {
  return async ({ response, url, requestBodyValues }) => {
    const responseHeaders = extractResponseHeaders(response);
    const body = await response.text();

    try {
      const messages = parseJsonMessages(body);
      const audioChunks = messages
        .filter(
          (message): message is Extract<GradiumTTSMessage, { type: 'audio' }> =>
            message.type === 'audio' && typeof message.audio === 'string',
        )
        .map(message => fromBase64(message.audio));
      const text = messages
        .filter(
          (message): message is Extract<GradiumTTSMessage, { type: 'text' }> =>
            message.type === 'text' && typeof message.text === 'string',
        )
        .map(message => ({
          text: message.text,
          startSecond: message.start_s,
          endSecond: message.stop_s,
        }));

      const error = messages.find(
        (message): message is Extract<GradiumTTSMessage, { type: 'error' }> =>
          message.type === 'error' && typeof message.message === 'string',
      );
      if (error) {
        throw new APICallError({
          message: error.message,
          url,
          requestBodyValues,
          statusCode: response.status,
          responseHeaders,
          responseBody: body,
          isRetryable: false,
          data: error,
        });
      }

      return {
        responseHeaders,
        value: {
          audio: concatBytes(audioChunks),
          body,
          messages,
          text,
        },
      };
    } catch (error) {
      if (APICallError.isInstance(error)) throw error;
      throw new APICallError({
        message:
          error instanceof Error
            ? error.message
            : 'Failed to parse Gradium TTS JSON response',
        url,
        requestBodyValues,
        statusCode: response.status,
        responseHeaders,
        responseBody: body,
        cause: error,
      });
    }
  };
}

export class GradiumSpeechModel implements SpeechModelV4 {
  readonly specificationVersion = 'v4';
  readonly modelId: GradiumSpeechModelId;

  private readonly config: GradiumConfig;

  static [WORKFLOW_SERIALIZE](model: GradiumSpeechModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: GradiumSpeechModelId;
    config: GradiumConfig;
  }) {
    return new GradiumSpeechModel(options.modelId, options.config);
  }

  constructor(modelId: GradiumSpeechModelId, config: GradiumConfig) {
    this.modelId = modelId;
    this.config = config;
  }

  get provider(): string {
    return this.config.provider;
  }

  /**
   * Build the Gradium TTS POST body from the unified AI SDK
   * `doGenerate` arguments plus any `providerOptions.gradium.*` overrides.
   */
  private async getArgs({
    text,
    voice,
    outputFormat,
    speed,
    language,
    instructions,
    providerOptions,
  }: Parameters<SpeechModelV4['doGenerate']>[0]) {
    const warnings: SharedV4Warning[] = [];

    const gradiumOpts =
      (await parseProviderOptions({
        provider: 'gradium',
        providerOptions,
        schema: gradiumSpeechModelOptionsSchema,
      })) ?? {};

    let format: GradiumTTSOutputFormat;
    if (gradiumOpts.outputFormat) {
      // Explicit Gradium-side override beats the AI SDK top-level format.
      format = gradiumOpts.outputFormat;
    } else {
      const mapped = mapOutputFormat(outputFormat);
      format = mapped.format;
      warnings.push(...mapped.warnings);
    }

    if (instructions) {
      warnings.push({
        type: 'unsupported',
        feature: 'instructions',
        details:
          'Gradium does not currently support free-form instructions. Use a different voice_id or providerOptions.gradium.rewriteRules instead.',
      });
    }

    // Synthesise json_config from typed options when caller didn't pass
    // a raw jsonConfig string. If both are supplied, raw wins and we warn.
    let jsonConfig: string | undefined = gradiumOpts.jsonConfig ?? undefined;
    if (jsonConfig == null) {
      const cfg: GradiumTTSJsonConfig = {};
      if (gradiumOpts.cfgCoef != null) cfg.cfg_coef = gradiumOpts.cfgCoef;
      if (gradiumOpts.temperature != null) cfg.temp = gradiumOpts.temperature;
      if (gradiumOpts.paddingBonus != null) {
        cfg.padding_bonus = gradiumOpts.paddingBonus;
        if (speed != null) {
          warnings.push({
            type: 'other',
            message:
              'providerOptions.gradium.paddingBonus was provided; top-level `speed` was ignored to avoid conflicts.',
          });
        }
      } else if (speed != null) {
        cfg.padding_bonus = mapSpeedToPaddingBonus(speed);
      }
      if (gradiumOpts.rewriteRules) {
        cfg.rewrite_rules = gradiumOpts.rewriteRules;
      } else if (language) {
        cfg.rewrite_rules = language;
      }
      if (gradiumOpts.pronunciationDictionary) {
        cfg.pronunciation_dictionary = gradiumOpts.pronunciationDictionary;
      }
      if (Object.keys(cfg).length > 0) jsonConfig = JSON.stringify(cfg);
    } else if (
      speed != null ||
      language != null ||
      hasStructuredJsonConfigOptions(gradiumOpts)
    ) {
      warnings.push({
        type: 'other',
        message:
          'providerOptions.gradium.jsonConfig was provided; top-level `speed`, `language`, and structured Gradium options were ignored to avoid conflicts.',
      });
    }

    const body: GradiumTTSRequestBody = {
      text,
      voice_id: gradiumOpts.voiceId ?? voice ?? DEFAULT_VOICE_ID,
      output_format: format,
      only_audio: gradiumOpts.onlyAudio ?? true,
    };

    if (this.modelId !== 'default') body.model_name = this.modelId;
    if (jsonConfig) body.json_config = jsonConfig;

    return { body, warnings, format };
  }

  async doGenerate(
    options: Parameters<SpeechModelV4['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<SpeechModelV4['doGenerate']>>> {
    const { body, warnings, format } = await this.getArgs(options);

    const url = this.config.url({
      path: '/post/speech/tts',
      modelId: this.modelId,
    });

    const responseHandler: ResponseHandler<
      Uint8Array | GradiumTTSJsonResponse
    > =
      body.only_audio === false
        ? createGradiumTTSJsonResponseHandler()
        : createBinaryResponseHandler();

    const { value, responseHeaders, rawValue } = await postJsonToApi({
      url,
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      failedResponseHandler: gradiumFailedResponseHandler,
      successfulResponseHandler: responseHandler,
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const audio = value instanceof Uint8Array ? value : value.audio;

    return {
      audio,
      warnings,
      request: { body: JSON.stringify(rawValue ?? body) },
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: responseHeaders,
        body: value instanceof Uint8Array ? audio : value.body,
      },
      providerMetadata: {
        gradium: {
          outputFormat: format,
          ...(value instanceof Uint8Array
            ? {}
            : {
                messageCount: value.messages.length,
                text: value.text,
              }),
        },
      },
    };
  }
}
