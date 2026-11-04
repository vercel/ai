import {
  type SharedV4Warning,
  type TranscriptionModelV4,
  type TranscriptionModelV4CallOptions,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  createJsonResponseHandler,
  mediaTypeToExtension,
  parseProviderOptions,
  postFormDataToApi,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { nebulFailedResponseHandler } from './nebul-error';
import {
  nebulTranscriptionModelOptions,
  type NebulTranscriptionModelId,
} from './nebul-transcription-options';

export type NebulTranscriptionModelConfig = {
  provider: string;
  baseURL: string;
  headers?: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
};

const nebulTranscriptionResponseSchema = z.object({
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
  segments: z
    .array(
      z.object({
        // different models use either `text` or `segment` as the text key
        text: z.string().nullish(),
        segment: z.string().nullish(),
        start: z.number(),
        end: z.number(),
      }),
    )
    .nullish(),
});

// ISO-639-1 codes map (verbose_json responses return language names)
const languageMap: Record<string, string> = {
  english: 'en',
  afrikaans: 'af',
  albanian: 'sq',
  amharic: 'am',
  arabic: 'ar',
  armenian: 'hy',
  azerbaijani: 'az',
  bengali: 'bn',
  bosnian: 'bs',
  bulgarian: 'bg',
  catalan: 'ca',
  chinese: 'zh',
  croatian: 'hr',
  czech: 'cs',
  danish: 'da',
  dutch: 'nl',
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
  malayalam: 'ml',
  marathi: 'mr',
  nepali: 'ne',
  norwegian: 'no',
  persian: 'fa',
  polish: 'pl',
  portuguese: 'pt',
  punjabi: 'pa',
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
  uzbek: 'uz',
  vietnamese: 'vi',
  welsh: 'cy',
};

export class NebulTranscriptionModel implements TranscriptionModelV4 {
  readonly specificationVersion = 'v4';

  static [WORKFLOW_SERIALIZE](model: NebulTranscriptionModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: NebulTranscriptionModelId;
    config: NebulTranscriptionModelConfig;
  }) {
    return new NebulTranscriptionModel(options.modelId, options.config);
  }

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: NebulTranscriptionModelId,
    private readonly config: NebulTranscriptionModelConfig,
  ) {}

  private async getArgs({
    audio,
    mediaType,
    providerOptions,
  }: TranscriptionModelV4CallOptions) {
    const warnings: SharedV4Warning[] = [];

    const nebulOptions = await parseProviderOptions({
      provider: 'nebul',
      providerOptions,
      schema: nebulTranscriptionModelOptions,
    });

    const formData = new FormData();
    const blob =
      audio instanceof Uint8Array
        ? new Blob([audio])
        : new Blob([convertBase64ToUint8Array(audio)]);

    formData.append('model', this.modelId);
    const fileExtension = mediaTypeToExtension(mediaType);
    formData.append(
      'file',
      new File([blob], 'audio', { type: mediaType }),
      `audio.${fileExtension}`,
    );

    formData.append(
      'response_format',
      nebulOptions?.responseFormat ?? 'verbose_json',
    );

    if (nebulOptions?.language != null) {
      formData.append('language', nebulOptions.language);
    }

    if (nebulOptions?.prompt != null) {
      formData.append('prompt', nebulOptions.prompt);
    }

    if (nebulOptions?.temperature != null) {
      formData.append('temperature', String(nebulOptions.temperature));
    }

    return { formData, warnings };
  }

  async doGenerate(
    options: TranscriptionModelV4CallOptions,
  ): Promise<Awaited<ReturnType<TranscriptionModelV4['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { formData, warnings } = await this.getArgs(options);

    const {
      value: response,
      responseHeaders,
      rawValue: rawResponse,
    } = await postFormDataToApi({
      url: `${this.config.baseURL}/audio/transcriptions`,
      headers: combineHeaders(this.config.headers?.(), options.headers),
      formData,
      failedResponseHandler: nebulFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        nebulTranscriptionResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    return {
      text: response.text,
      segments:
        response.segments?.map(segment => ({
          text: segment.text ?? segment.segment ?? '',
          startSecond: segment.start,
          endSecond: segment.end,
        })) ??
        response.words?.map(word => ({
          text: word.word,
          startSecond: word.start,
          endSecond: word.end,
        })) ??
        [],
      language:
        response.language != null
          ? (languageMap[response.language] ?? response.language)
          : undefined,
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
