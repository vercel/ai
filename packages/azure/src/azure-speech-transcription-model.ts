import type { TranscriptionModelV4 } from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  mediaTypeToExtension,
  postFormDataToApi,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { AzureTranscriptionProviderMetadata } from './azure-transcription-provider-metadata';
import {
  isMAITranscribe2,
  type AzureTranscriptionModelOptions,
} from './azure-transcription-model-options';

export class AzureSpeechTranscriptionModel implements TranscriptionModelV4 {
  readonly specificationVersion = 'v4';
  readonly provider = 'azure.transcription';

  constructor(
    readonly modelId: string,
    private readonly config: {
      url: () => string;
      headers: () => Record<string, string | undefined>;
      fetch?: FetchFunction;
    },
  ) {}

  async doGenerate(
    options: Parameters<TranscriptionModelV4['doGenerate']>[0],
    azureOptions: AzureTranscriptionModelOptions = {},
  ): Promise<Awaited<ReturnType<TranscriptionModelV4['doGenerate']>>> {
    const timestamp = new Date();
    const formData = new FormData();
    formData.append(
      'audio',
      new Blob(
        [
          typeof options.audio === 'string'
            ? convertBase64ToUint8Array(options.audio)
            : options.audio,
        ],
        { type: options.mediaType },
      ),
      `audio.${mediaTypeToExtension(options.mediaType)}`,
    );
    formData.append(
      'definition',
      JSON.stringify({
        enhancedMode: {
          enabled: true,
          model: isMAITranscribe2(this.modelId)
            ? 'MAI-Transcribe-2'
            : this.modelId,
          modelOptions: {
            timestamps: azureOptions.timestamps ?? 'segment',
            transcribeStyle: azureOptions.transcribeStyle,
          },
        },
        locales: azureOptions.locales,
        diarization: azureOptions.diarization,
        phraseList: azureOptions.phraseList,
      }),
    );

    const { value, rawValue, responseHeaders } = await postFormDataToApi({
      url: this.config.url(),
      headers: combineHeaders(this.config.headers(), options.headers),
      formData,
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: z.union([
          z.object({ error: z.object({ message: z.string() }) }),
          z.object({ message: z.string() }),
        ]),
        errorToMessage: data =>
          'error' in data ? data.error.message : data.message,
      }),
      successfulResponseHandler: createJsonResponseHandler(responseSchema),
    });

    const phrases = value.phrases ?? [];
    const languages = new Set(
      phrases.flatMap(phrase => {
        const language = phrase.locale?.split('-')[0]?.toLowerCase();
        return language != null && /^[a-z]{2}$/.test(language)
          ? [language]
          : [];
      }),
    );

    return {
      text: value.combinedPhrases.map(phrase => phrase.text).join(' '),
      segments: phrases.flatMap(phrase =>
        phrase.offsetMilliseconds != null && phrase.durationMilliseconds != null
          ? [
              {
                text: phrase.text,
                startSecond: phrase.offsetMilliseconds / 1000,
                endSecond:
                  (phrase.offsetMilliseconds + phrase.durationMilliseconds) /
                  1000,
              },
            ]
          : [],
      ),
      language: languages.size === 1 ? [...languages][0] : undefined,
      durationInSeconds:
        value.durationMilliseconds != null
          ? value.durationMilliseconds / 1000
          : undefined,
      warnings: [],
      providerMetadata: {
        azure: { phrases },
      } satisfies AzureTranscriptionProviderMetadata,
      response: {
        timestamp,
        modelId: this.modelId,
        headers: responseHeaders,
        body: rawValue,
      },
    };
  }
}

const responseSchema = z.object({
  combinedPhrases: z.array(z.object({ text: z.string() })),
  durationMilliseconds: z.number().nullish(),
  phrases: z
    .array(
      z.object({
        text: z.string(),
        offsetMilliseconds: z.number().nullish(),
        durationMilliseconds: z.number().nullish(),
        locale: z.string().nullish(),
        speaker: z.number().nullish(),
        confidence: z.number().nullish(),
        words: z
          .array(
            z.object({
              text: z.string(),
              offsetMilliseconds: z.number().nullish(),
              durationMilliseconds: z.number().nullish(),
            }),
          )
          .nullish(),
      }),
    )
    .nullish(),
});
