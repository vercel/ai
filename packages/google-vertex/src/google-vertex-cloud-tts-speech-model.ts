import type { SharedV4Warning, SpeechModelV4 } from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  createJsonResponseHandler,
  postJsonToApi,
  resolve,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  type FetchFunction,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { googleVertexFailedResponseHandler } from './google-vertex-error';
import type { GoogleVertexSpeechModelId } from './google-vertex-speech-model-options';

interface GoogleVertexCloudTTSSpeechModelConfig {
  provider: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
}

const DEFAULT_VOICE = 'Kore';
const DEFAULT_LANGUAGE = 'en-US';

// Chirp 3: HD voice names are `<locale>-Chirp3-HD-<voice>`,
// e.g. `en-US-Chirp3-HD-Kore`.
// https://cloud.google.com/text-to-speech/docs/chirp3-hd
const CHIRP3_HD_VOICE_INFIX = 'Chirp3-HD';

// Cloud Text-to-Speech uses a single non-regional host for standard
// synthesis (unlike Speech-to-Text and Vertex AI, which are regional).
// https://cloud.google.com/text-to-speech/docs/reference/rest/v1/text/synthesize
const CLOUD_TTS_SYNTHESIZE_URL =
  'https://texttospeech.googleapis.com/v1/text:synthesize';

/**
 * Speech model for Chirp 3: HD voices on the Google Cloud Text-to-Speech API.
 *
 * Unlike the Gemini TTS models (which go through the Vertex
 * `generateContent` endpoint via `GoogleSpeechModel`), Chirp 3: HD voices are
 * served by the dedicated Cloud Text-to-Speech `text:synthesize` endpoint,
 * reusing the provider's Google Cloud credentials.
 */
export class GoogleVertexCloudTTSSpeechModel implements SpeechModelV4 {
  readonly specificationVersion = 'v4';

  static [WORKFLOW_SERIALIZE](model: GoogleVertexCloudTTSSpeechModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: GoogleVertexSpeechModelId;
    config: GoogleVertexCloudTTSSpeechModelConfig;
  }) {
    return new GoogleVertexCloudTTSSpeechModel(options.modelId, options.config);
  }

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: GoogleVertexSpeechModelId,
    private readonly config: GoogleVertexCloudTTSSpeechModelConfig,
  ) {}

  async doGenerate(
    options: Parameters<SpeechModelV4['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<SpeechModelV4['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const warnings: SharedV4Warning[] = [];

    const {
      text,
      voice = DEFAULT_VOICE,
      outputFormat,
      instructions,
      speed,
      language,
    } = options;

    // Compose the voice name. A fully-qualified Chirp 3: HD voice name
    // (e.g. `en-US-Chirp3-HD-Kore`) is passed through verbatim, with its
    // locale prefix as the language code; otherwise the name is composed
    // from the language (BCP-47 locale, e.g. `en-US`) and the plain voice
    // name (e.g. `Kore`).
    let voiceName: string;
    let languageCode: string;
    if (voice.includes(CHIRP3_HD_VOICE_INFIX)) {
      voiceName = voice;
      // The locale prefix may be missing (e.g. `Chirp3-HD-Kore`), in which
      // case the extracted prefix is empty and the default language is used.
      const localePrefix = voice
        .split(CHIRP3_HD_VOICE_INFIX)[0]
        .replace(/-$/, '');
      languageCode = language ?? (localePrefix || DEFAULT_LANGUAGE);
    } else {
      languageCode = language ?? DEFAULT_LANGUAGE;
      voiceName = `${languageCode}-${CHIRP3_HD_VOICE_INFIX}-${voice}`;
    }

    if (instructions != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'instructions',
        details:
          'Google Cloud Text-to-Speech Chirp 3: HD voices do not support the `instructions` option. It was ignored.',
      });
    }

    // LINEAR16 responses are WAV (RIFF) files, so only `wav` is supported.
    if (outputFormat != null && outputFormat !== 'wav') {
      warnings.push({
        type: 'unsupported',
        feature: 'outputFormat',
        details: `Unsupported output format: ${outputFormat}. Using wav instead.`,
      });
    }

    const requestBody = {
      input: { text },
      voice: { languageCode, name: voiceName },
      audioConfig: {
        audioEncoding: 'LINEAR16',
        ...(speed != null ? { speakingRate: speed } : {}),
      },
    };

    const {
      value: response,
      responseHeaders,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: CLOUD_TTS_SYNTHESIZE_URL,
      headers: combineHeaders(
        this.config.headers ? await resolve(this.config.headers) : undefined,
        options.headers,
      ),
      body: requestBody,
      failedResponseHandler: googleVertexFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        googleVertexCloudTTSResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    // Empty audio is returned as-is so the core layer throws
    // NoSpeechGeneratedError.
    const audio =
      response.audioContent != null
        ? convertBase64ToUint8Array(response.audioContent)
        : new Uint8Array(0);

    return {
      audio,
      warnings,
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
        google: {
          mimeType: 'audio/wav',
        },
      },
    };
  }
}

// Minimal schema: only the fields the implementation reads, with `.nullish()`
// so provider API changes don't break parsing.
const googleVertexCloudTTSResponseSchema = z.object({
  audioContent: z.string().nullish(),
});
