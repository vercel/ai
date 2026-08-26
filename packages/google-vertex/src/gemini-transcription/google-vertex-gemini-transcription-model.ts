import {
  InvalidArgumentError,
  type JSONObject,
  type SharedV3Warning,
  type TranscriptionModelV3,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertToBase64,
  createJsonResponseHandler,
  parseProviderOptions,
  postJsonToApi,
  resolve,
  type FetchFunction,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { googleVertexFailedResponseHandler } from '../google-vertex-error';
import {
  googleVertexGeminiTranscriptionModelOptions,
  type GoogleVertexGeminiTranscriptionModelId,
  type GoogleVertexTranscriptionModelGeminiOptions,
} from './google-vertex-gemini-transcription-model-options';

/**
 * Live transcription (`*-live` model variants) requires streaming support,
 * which is only available in AI SDK v7 (transcription specification v4).
 */
function isLiveTranscriptionModelId(modelId: string): boolean {
  return modelId.includes('-live');
}

interface GoogleVertexGeminiTranscriptionModelConfig {
  provider: string;
  /** Regional base URL ending in `/publishers/google`. */
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
}

/**
 * Gemini transcription on Vertex AI (e.g. `gemini-3.5-transcribe`) via
 * `generateContent` with `generationConfig.audioTranscriptionConfig`.
 */
export class GoogleVertexGeminiTranscriptionModel implements TranscriptionModelV3 {
  readonly specificationVersion = 'v3';

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: GoogleVertexGeminiTranscriptionModelId,
    private readonly config: GoogleVertexGeminiTranscriptionModelConfig,
  ) {}

  private async parseOptions(
    providerOptions: Record<string, unknown> | undefined,
  ): Promise<GoogleVertexTranscriptionModelGeminiOptions | undefined> {
    // The Vertex provider exposes options under `googleVertex`/`vertex`;
    // accept `google` as a cross-namespace fallback (e.g. via the AI Gateway).
    for (const provider of ['googleVertex', 'vertex', 'google'] as const) {
      const parsed = await parseProviderOptions({
        provider,
        providerOptions,
        schema: googleVertexGeminiTranscriptionModelOptions,
      });
      if (parsed != null) return parsed;
    }
    return undefined;
  }

  async doGenerate(
    options: Parameters<TranscriptionModelV3['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<TranscriptionModelV3['doGenerate']>>> {
    if (isLiveTranscriptionModelId(this.modelId)) {
      throw new InvalidArgumentError({
        argument: 'modelId',
        message:
          `Model '${this.modelId}' only supports streaming transcription, ` +
          `which requires AI SDK v7. Use a unary model such as 'gemini-3.5-transcribe'.`,
      });
    }

    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const warnings: SharedV3Warning[] = [];
    const googleOptions = await this.parseOptions(options.providerOptions);
    const audioTranscriptionConfig =
      buildAudioTranscriptionConfig(googleOptions);

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: options.mediaType,
                data: convertToBase64(options.audio),
              },
            },
          ],
        },
      ],
      ...(audioTranscriptionConfig != null
        ? { generationConfig: { audioTranscriptionConfig } }
        : {}),
    };

    const {
      value: response,
      responseHeaders,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: `${this.config.baseURL}/models/${this.modelId}:generateContent`,
      headers: combineHeaders(
        this.config.headers ? await resolve(this.config.headers) : undefined,
        options.headers,
      ),
      body: requestBody,
      failedResponseHandler: googleVertexFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        googleVertexGeminiTranscriptionResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const text = (response.candidates?.[0]?.content?.parts ?? [])
      .map(part => part.text ?? '')
      .join('');

    return {
      text,
      segments: [],
      language: undefined,
      durationInSeconds: undefined,
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
        body: rawResponse,
      },
      ...(response.usageMetadata != null
        ? {
            providerMetadata: {
              google: { usageMetadata: response.usageMetadata as JSONObject },
            },
          }
        : {}),
    };
  }
}

/**
 * Builds Google's `AudioTranscriptionConfig` from provider options; returns
 * undefined when no options are set.
 */
function buildAudioTranscriptionConfig(
  options: GoogleVertexTranscriptionModelGeminiOptions | undefined,
): Record<string, unknown> | undefined {
  if (options == null) return undefined;
  const config: Record<string, unknown> = {};
  if (options.languageCodes != null) {
    config.languageCodes = options.languageCodes;
  }
  if (options.customVocabulary != null) {
    config.customVocabulary = options.customVocabulary;
  }
  if (options.wordTimestamp != null) {
    config.wordTimestamp = options.wordTimestamp;
  }
  if (options.diarization != null) {
    config.diarization = options.diarization;
  }
  if (options.mode != null) {
    config.mode = options.mode;
  }
  return Object.keys(config).length > 0 ? config : undefined;
}

const googleVertexGeminiTranscriptionResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z.array(z.object({ text: z.string().nullish() })).nullish(),
          })
          .nullish(),
      }),
    )
    .nullish(),
  usageMetadata: z.record(z.string(), z.unknown()).nullish(),
});
