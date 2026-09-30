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
    if (options.language != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'language',
        details:
          'The voice locale selects the language, e.g. de-DE-Mia for German.',
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

    const voice = options.voice ?? DEFAULT_VOICE;
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

const errorSchema = z.object({
  error: z.object({ message: z.string() }),
});

// Azure Speech answers most invalid requests (unknown voice, style, or output
// format) with an empty 400 body, and sometimes resets the connection (502).
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
    response.status === 502 && responseBody.includes('reset reason');

  const message = parsed.success
    ? parsed.value.error.message
    : isVoiceReset
      ? 'Azure Speech could not synthesize the request. Check that the voice is available for this model and that the style is supported by the voice.'
      : `Azure Speech request failed with status ${response.status}. Check the voice name, style, and output format.`;

  return {
    responseHeaders,
    value: new APICallError({
      message,
      url,
      requestBodyValues,
      statusCode: response.status,
      responseHeaders,
      responseBody,
      isRetryable: isVoiceReset ? false : undefined,
    }),
  };
};
