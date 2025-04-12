import {
  TranscriptionModelV1,
  TranscriptionModelV1CallOptions,
  TranscriptionModelV1CallWarning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  createJsonResponseHandler,
  parseProviderOptions,
  postFormDataToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { OpenAIConfig } from './openai-config';
import { openaiFailedResponseHandler } from './openai-error';
import {
  OpenAITranscriptionModelId,
  OpenAITranscriptionModelOptions,
} from './openai-transcription-settings';

// https://platform.openai.com/docs/api-reference/audio/createTranscription
const openAIProviderOptionsSchema = z.object({
  include: z.array(z.string()).nullish(),
  language: z.string().nullish(),
  prompt: z.string().nullish(),
  temperature: z.number().min(0).max(1).nullish().default(0),
  timestampGranularities: z
    .array(z.enum(['word', 'segment']))
    .nullish()
    .default(['segment']),
});

export type OpenAITranscriptionCallOptions = Omit<
  TranscriptionModelV1CallOptions,
  'providerOptions'
> & {
  providerOptions?: {
    openai?: z.infer<typeof openAIProviderOptionsSchema>;
  };
};

interface OpenAITranscriptionModelConfig extends OpenAIConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

// https://platform.openai.com/docs/guides/speech-to-text#supported-languages
const languageMap = {
  afrikaans: 'af',
  arabic: 'ar',
  armenian: 'hy',
  azerbaijani: 'az',
  belarusian: 'be',
  bosnian: 'bs',
  bulgarian: 'bg',
  catalan: 'ca',
  chinese: 'zh',
  croatian: 'hr',
  czech: 'cs',
  danish: 'da',
  dutch: 'nl',
  english: 'en',
  estonian: 'et',
  finnish: 'fi',
  french: 'fr',
  galician: 'gl',
  german: 'de',
  greek: 'el',
  hebrew: 'he',
  hindi: 'hi',
  hungarian: 'hu',
  icelandic: 'is',
  indonesian: 'id',
  italian: 'it',
  japanese: 'ja',
  kannada: 'kn',
  kazakh: 'kk',
  korean: 'ko',
  latvian: 'lv',
  lithuanian: 'lt',
  macedonian: 'mk',
  malay: 'ms',
  marathi: 'mr',
  maori: 'mi',
  nepali: 'ne',
  norwegian: 'no',
  persian: 'fa',
  polish: 'pl',
  portuguese: 'pt',
  romanian: 'ro',
  russian: 'ru',
  serbian: 'sr',
  slovak: 'sk',
  slovenian: 'sl',
  spanish: 'es',
  swahili: 'sw',
  swedish: 'sv',
  tagalog: 'tl',
  tamil: 'ta',
  thai: 'th',
  turkish: 'tr',
  ukrainian: 'uk',
  urdu: 'ur',
  vietnamese: 'vi',
  welsh: 'cy',
};

export class OpenAITranscriptionModel implements TranscriptionModelV1 {
  readonly specificationVersion = 'v1';

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: OpenAITranscriptionModelId,
    private readonly config: OpenAITranscriptionModelConfig,
  ) {}

  private getArgs({
    audio,
    mediaType,
    providerOptions,
  }: OpenAITranscriptionCallOptions) {
    const warnings: TranscriptionModelV1CallWarning[] = [];

    // Parse provider options
    const openAIOptions = parseProviderOptions({
      provider: 'openai',
      providerOptions,
      schema: openAIProviderOptionsSchema,
    });

    // Create form data with base fields
    const formData = new FormData();
    const blob =
      audio instanceof Uint8Array
        ? new Blob([audio])
        : new Blob([convertBase64ToUint8Array(audio)]);

    formData.append('model', this.modelId);
    formData.append('file', new File([blob], 'audio', { type: mediaType }));

    // Add provider-specific options
    if (openAIOptions) {
      const transcriptionModelOptions: OpenAITranscriptionModelOptions = {
        include: openAIOptions.include ?? undefined,
        language: openAIOptions.language ?? undefined,
        prompt: openAIOptions.prompt ?? undefined,
        temperature: openAIOptions.temperature ?? undefined,
        timestamp_granularities:
          openAIOptions.timestampGranularities ?? undefined,
      };

      for (const key in transcriptionModelOptions) {
        const value =
          transcriptionModelOptions[
            key as keyof OpenAITranscriptionModelOptions
          ];
        if (value !== undefined) {
          formData.append(key, String(value));
        }
      }
    }

    return {
      formData,
      warnings,
    };
  }

  async doGenerate(
    options: OpenAITranscriptionCallOptions,
  ): Promise<Awaited<ReturnType<TranscriptionModelV1['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { formData, warnings } = this.getArgs(options);

    const {
      value: response,
      responseHeaders,
      rawValue: rawResponse,
    } = await postFormDataToApi({
      url: this.config.url({
        path: '/audio/transcriptions',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      formData,
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        openaiTranscriptionResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const language =
      response.language != null && response.language in languageMap
        ? languageMap[response.language as keyof typeof languageMap]
        : undefined;

    return {
      text: response.text,
      segments:
        response.words?.map(word => ({
          text: word.word,
          startSecond: word.start,
          endSecond: word.end,
        })) ?? [],
      language,
      durationInSeconds: response.duration ?? undefined,
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

const openaiTranscriptionResponseSchema = z.object({
  text: z.string(),
  language: z.string().nullish(),
  duration: z.number().nullish(),
  words: z
    .array(
      z.object({
        word: z.string(),
        start: z.number(),
        end: z.number(),
      }),
    )
    .nullish(),
});
