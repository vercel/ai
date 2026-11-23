import type { SpeechModelV4, SharedV4Warning } from '@ai-sdk/provider';
import {
  resolve,
  combineHeaders,
  createBinaryResponseHandler,
  parseProviderOptions,
  postJsonToApi,
  serializeModelOptions,
  WORKFLOW_SERIALIZE,
  WORKFLOW_DESERIALIZE,
} from '@ai-sdk/provider-utils';
import type { AssemblyAIConfig } from './assemblyai-config';
import { assemblyaiFailedResponseHandler } from './assemblyai-error';
import {
  assemblyaiSpeechModelOptionsSchema,
  type AssemblyAISpeechModelOptions,
} from './assemblyai-speech-model-options';
import type { AssemblyAISpeechModelId } from './assemblyai-speech-settings';

interface AssemblyAISpeechModelConfig extends AssemblyAIConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

type AssemblyAISpeechEncoding = NonNullable<
  AssemblyAISpeechModelOptions['encoding']
>;

type AssemblyAISpeechRequestBody = {
  text: string;
  model_id: string;
  voice_id?: string;
  language?: string;
  encoding: AssemblyAISpeechEncoding;
  container?: NonNullable<AssemblyAISpeechModelOptions['container']>;
  sample_rate?: number;
  bit_rate?: number;
  stream: false;
};

const OUTPUT_FORMATS: Record<
  string,
  {
    encoding: AssemblyAISpeechEncoding;
    container?: 'raw' | 'wav';
    sampleRate?: number;
  }
> = {
  alaw: { encoding: 'pcm_alaw', container: 'raw', sampleRate: 8000 },
  mp3: { encoding: 'mp3' },
  mulaw: { encoding: 'pcm_mulaw', container: 'raw', sampleRate: 8000 },
  pcm: { encoding: 'pcm_s16le', container: 'raw' },
  wav: { encoding: 'pcm_s16le', container: 'wav' },
};

// The API names languages in full, so ISO 639-1 codes are translated.
const LANGUAGES: Record<string, string> = {
  de: 'german',
  en: 'english',
  es: 'spanish',
  fr: 'french',
  it: 'italian',
  pt: 'portuguese',
};

export class AssemblyAISpeechModel implements SpeechModelV4 {
  readonly specificationVersion = 'v4';

  get provider(): string {
    return this.config.provider;
  }

  static [WORKFLOW_SERIALIZE](model: AssemblyAISpeechModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: AssemblyAISpeechModelId;
    config: AssemblyAISpeechModelConfig;
  }) {
    return new AssemblyAISpeechModel(options.modelId, options.config);
  }

  constructor(
    readonly modelId: AssemblyAISpeechModelId,
    private readonly config: AssemblyAISpeechModelConfig,
  ) {}

  private async getArgs({
    text,
    voice,
    outputFormat = 'mp3',
    instructions,
    speed,
    language,
    providerOptions,
  }: Parameters<SpeechModelV4['doGenerate']>[0]) {
    const warnings: SharedV4Warning[] = [];

    const assemblyaiOptions = await parseProviderOptions({
      provider: 'assemblyai',
      providerOptions,
      schema: assemblyaiSpeechModelOptionsSchema,
    });

    let format = OUTPUT_FORMATS[outputFormat.toLowerCase()];
    if (format == null) {
      warnings.push({
        type: 'unsupported',
        feature: 'outputFormat',
        details: `Unknown output format "${outputFormat}". Falling back to mp3. Use providerOptions.assemblyai to configure encoding, container, and sampleRate directly.`,
      });
      format = OUTPUT_FORMATS.mp3;
    }

    const encoding = assemblyaiOptions?.encoding ?? format.encoding;
    // Container and sample rate implied by outputFormat only apply to the
    // encoding they were derived for.
    const formatApplies = encoding === format.encoding;

    const requestBody: AssemblyAISpeechRequestBody = {
      text,
      model_id: this.modelId,
      encoding,
      // Buffered responses report the final billed character count and are
      // never cut mid-body by an upstream failure.
      stream: false,
    };

    if (voice) {
      requestBody.voice_id = voice;
    }

    const container =
      assemblyaiOptions?.container ??
      (formatApplies ? format.container : undefined);
    if (container != null) {
      if (encoding === 'mp3') {
        warnings.push({
          type: 'unsupported',
          feature: 'providerOptions.assemblyai.container',
          details:
            'AssemblyAI MP3 output has no container. The container option was ignored.',
        });
      } else {
        requestBody.container = container;
      }
    }

    const sampleRate =
      assemblyaiOptions?.sampleRate ??
      (formatApplies ? format.sampleRate : undefined);
    if (sampleRate != null) {
      requestBody.sample_rate = sampleRate;
    }

    if (assemblyaiOptions?.bitRate != null) {
      if (encoding === 'mp3') {
        requestBody.bit_rate = assemblyaiOptions.bitRate;
      } else {
        warnings.push({
          type: 'unsupported',
          feature: 'providerOptions.assemblyai.bitRate',
          details:
            'AssemblyAI only accepts a bit rate for MP3 output. The bitRate option was ignored.',
        });
      }
    }

    if (language) {
      const normalized = language.toLowerCase();
      const mapped =
        LANGUAGES[normalized] ??
        (Object.values(LANGUAGES).includes(normalized)
          ? normalized
          : undefined);
      if (mapped != null) {
        requestBody.language = mapped;
      } else {
        warnings.push({
          type: 'unsupported',
          feature: 'language',
          details:
            normalized === 'auto'
              ? 'AssemblyAI text-to-speech does not detect the language. The voice speaks its own language.'
              : `AssemblyAI text-to-speech does not support language "${language}" (supported: ${Object.keys(LANGUAGES).join(', ')}). The language option was ignored.`,
        });
      }
    }

    if (speed != null && speed !== 1) {
      warnings.push({
        type: 'unsupported',
        feature: 'speed',
        details:
          'AssemblyAI text-to-speech only supports the default speed. The speed option was ignored.',
      });
    }

    if (instructions) {
      warnings.push({
        type: 'unsupported',
        feature: 'instructions',
        details:
          'AssemblyAI text-to-speech does not support instructions. Instructions parameter was ignored.',
      });
    }

    return { requestBody, warnings };
  }

  async doGenerate(
    options: Parameters<SpeechModelV4['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<SpeechModelV4['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { requestBody, warnings } = await this.getArgs(options);

    const {
      value: audio,
      responseHeaders,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: this.config.url({
        path: '/v1/speech',
        modelId: this.modelId,
      }),
      headers: combineHeaders(
        await resolve(this.config.headers),
        options.headers,
      ),
      body: requestBody,
      failedResponseHandler: assemblyaiFailedResponseHandler,
      successfulResponseHandler: createBinaryResponseHandler(),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const headerNumber = (name: string): number | undefined => {
      const value = responseHeaders?.[name];
      if (value == null) {
        return undefined;
      }
      const parsed = Number(value);
      return Number.isNaN(parsed) ? undefined : parsed;
    };
    const billedCharacters = headerNumber('x-tts-billed-characters');
    const audioDurationMs = headerNumber('x-tts-audio-duration-ms');
    const sampleRate = headerNumber('x-tts-sample-rate');

    return {
      audio,
      warnings,
      ...(billedCharacters != null
        ? { usage: { characters: billedCharacters } }
        : {}),
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
        assemblyai: {
          ...(responseHeaders?.['x-request-id']
            ? { requestId: responseHeaders['x-request-id'] }
            : {}),
          ...(responseHeaders?.['x-tts-model']
            ? { model: responseHeaders['x-tts-model'] }
            : {}),
          ...(responseHeaders?.['x-tts-voice-id']
            ? { voiceId: responseHeaders['x-tts-voice-id'] }
            : {}),
          ...(responseHeaders?.['x-tts-language']
            ? { language: responseHeaders['x-tts-language'] }
            : {}),
          ...(responseHeaders?.['x-tts-encoding']
            ? { encoding: responseHeaders['x-tts-encoding'] }
            : {}),
          ...(sampleRate != null ? { sampleRate } : {}),
          ...(audioDurationMs != null ? { audioDurationMs } : {}),
          ...(billedCharacters != null ? { billedCharacters } : {}),
        },
      },
    };
  }
}
