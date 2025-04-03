import { TranscriptionModelV1 } from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonResponseHandler,
  postFormDataToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { OpenAIConfig } from './openai-config';
import { openaiFailedResponseHandler } from './openai-error';
import { OpenAITranscriptionModelId } from './openai-transcription-settings';

interface OpenAITranscriptionModelConfig extends OpenAIConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

const providerOptionsMapping = {
  include: 'include',
  language: 'language',
  prompt: 'prompt',
  responseFormat: 'response_format',
  temperature: 'temperature',
  timestampGranularities: 'timestamp_granularities',
};

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

  async doGenerate({
    audio,
    providerOptions,
    headers,
    abortSignal,
  }: Parameters<TranscriptionModelV1['doGenerate']>[0]): Promise<
    Awaited<ReturnType<TranscriptionModelV1['doGenerate']>>
  > {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const formData = new FormData();

    let blob: Blob | undefined;

    if (audio instanceof Uint8Array) {
      // Convert Uint8Array to Blob and then to File
      blob = new Blob([audio]);
    } else if (typeof audio === 'string') {
      // Convert base64 string to Blob and then to File
      const byteCharacters = atob(audio);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      blob = new Blob([byteArray]);
    } else {
      throw new Error(
        'Invalid audio format. Must be Uint8Array or base64 string.',
      );
    }

    formData.append('model', this.modelId);
    formData.append(
      'file',
      new File([blob], 'audio.wav', { type: 'audio/wav' }),
    );

    // Add any additional provider options
    if (providerOptions?.openai) {
      for (const [key, value] of Object.entries(providerOptions.openai)) {
        if (key in providerOptionsMapping) {
          const newKey =
            providerOptionsMapping[key as keyof typeof providerOptionsMapping];

          formData.append(newKey, String(value));
        }
      }
    }

    const { value: response, responseHeaders } = await postFormDataToApi({
      url: this.config.url({
        path: '/audio/transcriptions',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), headers),
      formData,
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        openaiTranscriptionResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    let language: string | undefined;

    if (response.language && response.language in languageMap) {
      language = languageMap[response.language as keyof typeof languageMap];
    }

    return {
      text: response.text,
      segments: response.words.map(word => ({
        text: word.word,
        startSecond: word.start,
        endSecond: word.end,
      })),
      language,
      durationInSeconds: response.duration,
      warnings: [],
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },

      // When using format `verbose_json` on `whisper-1`, OpenAI includes the things like `task` and enhanced `segments` information.
      providerMetadata: {
        openai: {
          transcript: response,
        },
      },
    };
  }
}

const openaiTranscriptionResponseSchema = z.object({
  text: z.string(),
  language: z.string().optional(),
  duration: z.number().optional(),
  words: z.array(
    z.object({
      word: z.string(),
      start: z.number(),
      end: z.number(),
    }),
  ),
});
