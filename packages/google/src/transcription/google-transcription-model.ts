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
import { googleFailedResponseHandler } from '../google-error';
import {
  googleTranscriptionModelOptions,
  type GoogleTranscriptionModelId,
  type GoogleTranscriptionModelOptions,
} from './google-transcription-model-options';

/**
 * Live transcription (`*-live` model variants) requires streaming support,
 * which is only available in AI SDK v7 (transcription specification v4).
 */
function isLiveTranscriptionModelId(modelId: string): boolean {
  return modelId.includes('-live');
}

interface GoogleTranscriptionModelConfig {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
}

/**
 * Gemini transcription (speech-to-text) via the Interactions API
 * (e.g. `gemini-3.5-transcribe`).
 *
 * @see https://ai.google.dev/gemini-api/docs/transcribe
 */
export class GoogleTranscriptionModel implements TranscriptionModelV3 {
  readonly specificationVersion = 'v3';

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: GoogleTranscriptionModelId,
    private readonly config: GoogleTranscriptionModelConfig,
  ) {}

  private async parseOptions(
    providerOptions: Record<string, unknown> | undefined,
  ): Promise<GoogleTranscriptionModelOptions | undefined> {
    return parseProviderOptions({
      provider: 'google',
      providerOptions,
      schema: googleTranscriptionModelOptions,
    });
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
    const transcriptionConfig = buildTranscriptionConfig(googleOptions);

    // Unary transcription is served by the Interactions API
    // (https://ai.google.dev/gemini-api/docs/transcribe).
    const requestBody = {
      model: this.modelId,
      input: [
        {
          type: 'audio',
          data: convertToBase64(options.audio),
          mime_type: options.mediaType,
        },
      ],
      ...(transcriptionConfig != null
        ? { generation_config: { transcription_config: transcriptionConfig } }
        : {}),
    };

    const {
      value: response,
      responseHeaders,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: `${this.config.baseURL}/interactions`,
      headers: combineHeaders(
        this.config.headers ? await resolve(this.config.headers) : undefined,
        options.headers,
      ),
      body: requestBody,
      failedResponseHandler: googleFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        googleInteractionsTranscriptionResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    let text = '';
    const segments: Array<{
      text: string;
      startSecond: number;
      endSecond: number;
    }> = [];
    for (const step of response.steps ?? []) {
      for (const content of step.content ?? []) {
        if (content.type !== 'text' || content.text == null) continue;
        text += content.text;
        for (const annotation of content.annotations ?? []) {
          if (annotation.type !== 'word_info') continue;
          const startSecond = parseOffsetSeconds(annotation.start_offset);
          const endSecond = parseOffsetSeconds(annotation.end_offset);
          if (
            annotation.text == null ||
            startSecond == null ||
            endSecond == null
          ) {
            continue;
          }
          segments.push({ text: annotation.text, startSecond, endSecond });
        }
      }
    }

    return {
      text,
      segments,
      language: undefined,
      durationInSeconds: undefined,
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
        body: rawResponse,
      },
      ...(response.usage != null
        ? {
            providerMetadata: {
              google: { usage: response.usage as JSONObject },
            },
          }
        : {}),
    };
  }
}

/**
 * Builds the Interactions API `transcription_config` (snake_case wire) from
 * provider options; returns undefined when no options are set. Diarization
 * and word timestamps are expressed inside the `mode` object per
 * https://ai.google.dev/gemini-api/docs/transcribe.
 */
function buildTranscriptionConfig(
  options: GoogleTranscriptionModelOptions | undefined,
): Record<string, unknown> | undefined {
  if (options == null) return undefined;
  const config: Record<string, unknown> = {};
  if (options.languageCodes != null) {
    config.language_codes = options.languageCodes;
  }
  if (options.customVocabulary != null) {
    config.custom_vocabulary = options.customVocabulary;
  }
  if (
    options.mode != null ||
    options.diarization === true ||
    options.wordTimestamp === true
  ) {
    config.mode = {
      type: (options.mode ?? 'VERBATIM').toLowerCase(),
      ...(options.diarization === true ? { diarization_mode: 'speaker' } : {}),
      ...(options.wordTimestamp === true
        ? { timestamp_granularities: ['word'] }
        : {}),
    };
  }
  return Object.keys(config).length > 0 ? config : undefined;
}

/** Parses a Google duration offset such as `"1s"` or `"9.400s"` to seconds. */
function parseOffsetSeconds(
  offset: string | undefined | null,
): number | undefined {
  if (offset == null) return undefined;
  const parsed = Number.parseFloat(offset);
  return Number.isFinite(parsed) ? parsed : undefined;
}

const googleInteractionsWordAnnotationSchema = z.object({
  type: z.string().nullish(),
  text: z.string().nullish(),
  speaker: z.string().nullish(),
  start_offset: z.string().nullish(),
  end_offset: z.string().nullish(),
});

const googleInteractionsTranscriptionResponseSchema = z.object({
  status: z.string().nullish(),
  steps: z
    .array(
      z.object({
        type: z.string().nullish(),
        content: z
          .array(
            z.object({
              type: z.string().nullish(),
              text: z.string().nullish(),
              annotations: z
                .array(googleInteractionsWordAnnotationSchema)
                .nullish(),
            }),
          )
          .nullish(),
      }),
    )
    .nullish(),
  usage: z.record(z.string(), z.unknown()).nullish(),
});
