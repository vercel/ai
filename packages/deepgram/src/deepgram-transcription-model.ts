import {
  TranscriptionModelV1,
  TranscriptionModelV1CallWarning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  createJsonResponseHandler,
  parseProviderOptions,
  postToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { DeepgramConfig } from './deepgram-config';
import { deepgramFailedResponseHandler } from './deepgram-error';
import { DeepgramTranscriptionModelId } from './deepgram-transcription-settings';
import { DeepgramTranscriptionAPITypes } from './deepgram-api-types';

// https://developers.deepgram.com/docs/pre-recorded-audio#results
const deepgramProviderOptionsSchema = z.object({
  // Base parameters
  language: z.string().nullish(),

  // Formatting options
  smartFormat: z.boolean().nullish(),
  punctuate: z.boolean().nullish(),
  paragraphs: z.boolean().nullish(),

  // Summarization and analysis
  summarize: z.union([z.literal('v2'), z.literal(false)]).nullish(),
  topics: z.boolean().nullish(),
  intents: z.boolean().nullish(),
  sentiment: z.boolean().nullish(),

  // Entity detection
  detectEntities: z.boolean().nullish(),

  // Redaction options
  redact: z.union([z.string(), z.array(z.string())]).nullish(),
  replace: z.string().nullish(),

  // Search and keywords
  search: z.string().nullish(),
  keyterm: z.string().nullish(),

  // Speaker-related features
  diarize: z.boolean().nullish(),
  utterances: z.boolean().nullish(),
  uttSplit: z.number().nullish(),

  // Miscellaneous
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

export class DeepgramTranscriptionModel implements TranscriptionModelV1 {
  readonly specificationVersion = 'v1';

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: DeepgramTranscriptionModelId,
    private readonly config: DeepgramTranscriptionModelConfig,
  ) {}

  private getArgs({
    providerOptions,
  }: Parameters<TranscriptionModelV1['doGenerate']>[0]) {
    const warnings: TranscriptionModelV1CallWarning[] = [];

    // Parse provider options
    const deepgramOptions = parseProviderOptions({
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
    options: Parameters<TranscriptionModelV1['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<TranscriptionModelV1['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { queryParams, warnings } = this.getArgs(options);

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
      transaction_key: z.string(),
      request_id: z.string(),
      sha256: z.string(),
      created: z.string(),
      duration: z.number(),
      channels: z.number(),
      models: z.array(z.string()),
      model_info: z.record(
        z.object({
          name: z.string(),
          version: z.string(),
          arch: z.string(),
        }),
      ),
    })
    .nullish(),
  results: z
    .object({
      channels: z.array(
        z.object({
          alternatives: z.array(
            z.object({
              transcript: z.string(),
              confidence: z.number(),
              words: z.array(
                z.object({
                  word: z.string(),
                  start: z.number(),
                  end: z.number(),
                  confidence: z.number(),
                  punctuated_word: z.string().nullish(),
                }),
              ),
              paragraphs: z
                .object({
                  transcript: z.string(),
                  paragraphs: z.array(
                    z.object({
                      sentences: z.array(
                        z.object({
                          text: z.string(),
                          start: z.number(),
                          end: z.number(),
                        }),
                      ),
                      num_words: z.number(),
                      start: z.number(),
                      end: z.number(),
                    }),
                  ),
                })
                .nullish(),
            }),
          ),
        }),
      ),
    })
    .nullish(),
});
