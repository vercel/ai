import {
  APICallError,
  type SharedV4Warning,
  type SpeechModelV4,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createBinaryResponseHandler,
  extractResponseHeaders,
  postToApi,
  safeParseJSON,
  type FetchFunction,
  type ResponseHandler,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { getMAIVoiceModel } from './azure-speech-model-options';
import type { AzureSpeechModelSpeechOptions } from './azure-speech-speech-model-options';

const DEFAULT_VOICE = 'en-US-Harper';

// Default voice per ISO 639-1 language; available on MAI-Voice-2,
// MAI-Voice-2.1, and their Flash variants.
const DEFAULT_VOICES = new Map([
  ['de', 'de-DE-Mia'],
  ['en', DEFAULT_VOICE],
  ['es', 'es-MX-Valeria'],
  ['fr', 'fr-FR-Soleil'],
  ['hi', 'hi-IN-Kavya'],
  ['hu', 'hu-HU-Lilla'],
  ['it', 'it-IT-Rosa'],
  ['ko', 'ko-KR-Haena'],
  ['nl', 'nl-NL-Fleur'],
  ['pt', 'pt-BR-Luana'],
  ['ro', 'ro-RO-Elena'],
  ['ru', 'ru-RU-Masha'],
  ['th', 'th-TH-Krit'],
  ['tr', 'tr-TR-Elif'],
  ['zh', 'zh-CN-Mei'],
]);
const DEFAULT_OUTPUT_FORMAT = 'audio-24khz-160kbitrate-mono-mp3';

// Shorthand formats for `outputFormat`; other X-Microsoft-OutputFormat values
// (e.g. `audio-48khz-192kbitrate-mono-mp3`) are passed through unchanged.
const OUTPUT_FORMATS = new Map([
  ['mp3', DEFAULT_OUTPUT_FORMAT],
  ['opus', 'ogg-24khz-16bit-mono-opus'],
  ['pcm', 'raw-24khz-16bit-mono-pcm'],
  ['wav', 'riff-24khz-16bit-mono-pcm'],
]);
const NATIVE_OUTPUT_FORMAT =
  /^(?:amr|audio|g722|ogg|raw|riff|webm)-[a-z0-9-]+$/;

/**
 * Azure Speech text to speech with SSML. The model is appended to the voice
 * name, e.g. `en-US-Harper:MAI-Voice-2`.
 */
export class AzureSpeechSpeechModel implements SpeechModelV4 {
  readonly specificationVersion = 'v4';
  readonly provider = 'azure.speech';

  constructor(
    readonly modelId: string,
    private readonly config: {
      url: () => string;
      headers: () => Record<string, string | undefined>;
      fetch?: FetchFunction;
      _internal?: { currentDate?: () => Date };
    },
  ) {}

  async doGenerate(
    options: Parameters<SpeechModelV4['doGenerate']>[0],
    azureOptions: AzureSpeechModelSpeechOptions = {},
  ): Promise<Awaited<ReturnType<SpeechModelV4['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const warnings: SharedV4Warning[] = [];
    const { style, styleDegree } = azureOptions;

    if (options.instructions != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'instructions',
        details: 'Use providerOptions.azure.style to control speaking style.',
      });
    }
    const { voice, languageWarning } = resolveVoice(
      options.voice,
      options.language,
    );
    if (languageWarning != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'language',
        details: languageWarning,
      });
    }
    if (styleDegree != null && style == null) {
      warnings.push({
        type: 'unsupported',
        feature: 'providerOptions.azure.styleDegree',
        details: 'styleDegree requires style.',
      });
    }

    let outputFormat = DEFAULT_OUTPUT_FORMAT;
    if (options.outputFormat != null) {
      const format = options.outputFormat.toLowerCase();
      const shorthand = OUTPUT_FORMATS.get(format);
      if (shorthand != null) {
        outputFormat = shorthand;
      } else if (NATIVE_OUTPUT_FORMAT.test(format)) {
        outputFormat = format;
      } else {
        warnings.push({
          type: 'unsupported',
          feature: 'outputFormat',
          details: `Unsupported output format: ${options.outputFormat}. Using mp3 instead.`,
        });
      }
    }

    const ssml = buildSsml({
      text: options.text,
      voiceName: voice.includes(':')
        ? voice
        : `${voice}:${getMAIVoiceModel(this.modelId) ?? this.modelId}`,
      locale: /^([a-z]{2,3}-[a-z]{2,4})-/i.exec(voice)?.[1],
      speed: options.speed,
      style,
      styleDegree: style != null ? styleDegree : undefined,
    });

    const {
      value: audio,
      responseHeaders,
      rawValue,
    } = await postToApi({
      url: this.config.url(),
      headers: combineHeaders(
        this.config.headers(),
        {
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': outputFormat,
        },
        options.headers,
      ),
      body: { content: ssml, values: ssml },
      failedResponseHandler,
      successfulResponseHandler: createBinaryResponseHandler(),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    return {
      audio,
      warnings,
      request: { body: ssml },
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
        body: rawValue,
      },
    };
  }
}

function buildSsml({
  text,
  voiceName,
  locale = 'en-US',
  speed,
  style,
  styleDegree,
}: {
  text: string;
  voiceName: string;
  locale?: string;
  speed?: number;
  style?: string;
  styleDegree?: number;
}) {
  let content = escapeXml(text);
  if (speed != null) {
    content = `<prosody rate="${speed}">${content}</prosody>`;
  }
  if (style != null) {
    const degree = styleDegree != null ? ` styledegree="${styleDegree}"` : '';
    content = `<mstts:express-as style="${escapeXml(style)}"${degree}>${content}</mstts:express-as>`;
  }
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" ` +
    `xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="${escapeXml(locale)}">` +
    `<voice name="${escapeXml(voiceName)}">${content}</voice></speak>`
  );
}

const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, char => XML_ESCAPES[char]);
}

// Uses the language's default voice when no voice is set. An explicit voice
// wins, and its locale selects the language.
function resolveVoice(
  voice: string | undefined,
  language: string | undefined,
): { voice: string; languageWarning?: string } {
  const code = language ? language.split('-')[0].toLowerCase() : undefined;
  if (voice == null) {
    if (code == null) return { voice: DEFAULT_VOICE };
    if (code === 'auto') {
      return {
        voice: DEFAULT_VOICE,
        languageWarning: `Automatic language detection is not supported. ${DEFAULT_VOICE} was used.`,
      };
    }
    const defaultVoice = DEFAULT_VOICES.get(code);
    return defaultVoice != null
      ? { voice: defaultVoice }
      : {
          voice: DEFAULT_VOICE,
          languageWarning: `No default MAI voice for language "${language}". ${DEFAULT_VOICE} was used.`,
        };
  }
  const voiceLanguage = /^([a-z]{2,3})-[a-z]{2,4}-/i
    .exec(voice)?.[1]
    ?.toLowerCase();
  return code != null &&
    code !== 'auto' &&
    voiceLanguage != null &&
    code !== voiceLanguage
    ? {
        voice,
        languageWarning: `The voice ${voice} selects the language. Language "${language}" was ignored.`,
      }
    : { voice };
}

const errorSchema = z.object({
  error: z.object({ message: z.string() }),
});

// Azure Speech answers invalid requests (style or output format) with an empty
// 400 body. Unknown voices or styles reset the connection with an Envoy 502
// whose reason is `protocol error`; that is a client input error, so it is
// reported as a non-retryable 400. Other 502s stay retryable.
const failedResponseHandler: ResponseHandler<APICallError> = async ({
  response,
  url,
  requestBodyValues,
}) => {
  const responseHeaders = extractResponseHeaders(response);
  const responseBody = await response.text();
  const parsed = await safeParseJSON({
    text: responseBody,
    schema: errorSchema,
  });
  const isVoiceReset =
    response.status === 502 &&
    responseBody.includes('reset reason: protocol error');

  const message = parsed.success
    ? parsed.value.error.message
    : isVoiceReset
      ? 'Azure Speech could not synthesize the request. Check that the voice is available for this model and that the style is supported by the voice.'
      : response.status === 400
        ? 'Azure Speech request failed with status 400. Check the voice name, style, and output format.'
        : `Azure Speech request failed with status ${response.status}.`;

  return {
    responseHeaders,
    value: new APICallError({
      message,
      url,
      requestBodyValues,
      statusCode: isVoiceReset ? 400 : response.status,
      responseHeaders,
      responseBody,
      isRetryable: isVoiceReset ? false : undefined,
    }),
  };
};
