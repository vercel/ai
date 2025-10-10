import {
  TranscriptionModelV2,
  TranscriptionModelV2CallWarning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  createJsonResponseHandler,
  parseProviderOptions,
  postToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { DeepgramConfig } from './deepgram-config';
import { deepgramFailedResponseHandler } from './deepgram-error';
import { DeepgramTranscriptionModelId } from './deepgram-transcription-options';
import { DeepgramTranscriptionAPITypes } from './deepgram-api-types';

// https://developers.deepgram.com/docs/pre-recorded-audio#results
const deepgramProviderOptionsSchema = z.object({
  /** Language to use for transcription. If not specified, Deepgram will auto-detect the language. */
  language: z.string().nullish(),
  /** Whether to use smart formatting, which formats written-out numbers, dates, times, etc. */
  smartFormat: z.boolean().nullish(),
  /** Whether to add punctuation to the transcript. */
  punctuate: z.boolean().nullish(),
  /** Whether to format the transcript into paragraphs. */
  paragraphs: z.boolean().nullish(),
  /** Whether to generate a summary of the transcript. Use 'v2' for the latest version or false to disable. */
  summarize: z.union([z.literal('v2'), z.literal(false)]).nullish(),
  /** Whether to identify topics in the transcript. */
  topics: z.boolean().nullish(),
  /** Whether to identify intents in the transcript. */
  intents: z.boolean().nullish(),
  /** Whether to analyze sentiment in the transcript. */
  sentiment: z.boolean().nullish(),
  /** Whether to detect and tag named entities in the transcript. */
  detectEntities: z.boolean().nullish(),
  /** Specify terms or patterns to redact from the transcript. Can be a string or array of strings. */
  redact: z.union([z.string(), z.array(z.string())]).nullish(),
  /** String to replace redacted content with. */
  replace: z.string().nullish(),
  /** Term or phrase to search for in the transcript. */
  search: z.string().nullish(),
  /** Key term to identify in the transcript. */
  keyterm: z.string().nullish(),
  /** Whether to identify different speakers in the audio. */
  diarize: z.boolean().nullish(),
  /** Whether to segment the transcript into utterances. */
  utterances: z.boolean().nullish(),
  /** Minimum duration of silence (in seconds) to trigger a new utterance. */
  uttSplit: z.number().nullish(),
  /** Whether to include filler words (um, uh, etc.) in the transcript. */
  fillerWords: z.boolean().nullish(),
});

export type DeepgramTranscriptionCallOptions = z.infer<
  typeof deepgramProviderOptionsSchema
>;

interface DeepgramTranscriptionModelConfig extends DeepgramConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

export class DeepgramTranscriptionModel implements TranscriptionModelV2 {
  readonly specificationVersion = 'v2';

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: DeepgramTranscriptionModelId,
    private readonly config: DeepgramTranscriptionModelConfig,
  ) {}

  private async getArgs({
    providerOptions,
  }: Parameters<TranscriptionModelV2['doGenerate']>[0]) {
    const warnings: TranscriptionModelV2CallWarning[] = [];

    // Parse provider options
    const deepgramOptions = await parseProviderOptions({
      provider: 'deepgram',
      providerOptions,
      schema: deepgramProviderOptionsSchema,
    });

    const body: DeepgramTranscriptionAPITypes = {
      model: this.modelId,
      diarize: true,
    };

    // Add provider-specific options
    if (deepgramOptions) {
      body.detect_entities = deepgramOptions.detectEntities ?? undefined;
      body.filler_words = deepgramOptions.fillerWords ?? undefined;
      body.language = deepgramOptions.language ?? undefined;
      body.punctuate = deepgramOptions.punctuate ?? undefined;
      body.redact = deepgramOptions.redact ?? undefined;
      body.search = deepgramOptions.search ?? undefined;
      body.smart_format = deepgramOptions.smartFormat ?? undefined;
      body.summarize = deepgramOptions.summarize ?? undefined;
      body.topics = deepgramOptions.topics ?? undefined;
      body.utterances = deepgramOptions.utterances ?? undefined;
      body.utt_split = deepgramOptions.uttSplit ?? undefined;

      if (typeof deepgramOptions.diarize === 'boolean') {
        body.diarize = deepgramOptions.diarize;
      }
    }

    // Convert body to URL query parameters
    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries(body)) {
      if (value !== undefined) {
        queryParams.append(key, String(value));
      }
    }

    return {
      queryParams,
      warnings,
    };
  }

  async doGenerate(
    options: Parameters<TranscriptionModelV2['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<TranscriptionModelV2['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { queryParams, warnings } = await this.getArgs(options);

    const {
      value: response,
      responseHeaders,
      rawValue: rawResponse,
    } = await postToApi({
      url:
        this.config.url({
          path: '/v1/listen',
          modelId: this.modelId,
        }) +
        '?' +
        queryParams.toString(),
      headers: {
        ...combineHeaders(this.config.headers(), options.headers),
        'Content-Type': options.mediaType,
      },
      body: {
        content: options.audio,
        values: options.audio,
      },
      failedResponseHandler: deepgramFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        deepgramTranscriptionResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    return {
      text:
        response.results?.channels.at(0)?.alternatives.at(0)?.transcript ?? '',
      segments:
        response.results?.channels[0].alternatives[0].words?.map(word => ({
          text: word.word,
          startSecond: word.start,
          endSecond: word.end,
        })) ?? [],
      language: undefined,
      durationInSeconds: response.metadata?.duration ?? undefined,
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
        body: rawResponse,
      },
    };
  }
}

const deepgramTranscriptionResponseSchema = z.object({
  metadata: z
    .object({
      duration: z.number(),
    })
    .nullish(),
  results: z
    .object({
      channels: z.array(
        z.object({
          alternatives: z.array(
            z.object({
              transcript: z.string(),
              words: z.array(
                z.object({
                  word: z.string(),
                  start: z.number(),
                  end: z.number(),
                }),
              ),
            }),
          ),
        }),
      ),
    })
    .nullish(),
});
