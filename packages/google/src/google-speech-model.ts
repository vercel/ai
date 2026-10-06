import {
  InvalidArgumentError,
  type SpeechModelV4,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  createJsonResponseHandler,
  parseProviderOptions,
  postJsonToApi,
  resolve,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  type FetchFunction,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import { googleFailedResponseHandler } from './google-error';
import { googleSpeechResponseSchema } from './google-speech-api';
import { getGoogleSpeechInput } from './google-speech-input';
import {
  googleSpeechProviderOptionsSchema,
  type GoogleSpeechModelId,
  type GoogleSpeechModelOptions,
} from './google-speech-model-options';

interface GoogleSpeechModelConfig {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
}

const DEFAULT_VOICE = 'Kore';
// Gemini TTS returns raw PCM at 24kHz when the response does not specify a rate.
const DEFAULT_SAMPLE_RATE = 24000;

export class GoogleSpeechModel implements SpeechModelV4 {
  readonly specificationVersion = 'v4';

  static [WORKFLOW_SERIALIZE](model: GoogleSpeechModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: GoogleSpeechModelId;
    config: GoogleSpeechModelConfig;
  }) {
    return new GoogleSpeechModel(options.modelId, options.config);
  }

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: GoogleSpeechModelId,
    private readonly config: GoogleSpeechModelConfig,
  ) {}

  private async getArgs({
    text,
    voice = DEFAULT_VOICE,
    outputFormat,
    instructions,
    speed,
    language,
    providerOptions,
  }: Parameters<SpeechModelV4['doGenerate']>[0]) {
    const warnings: SharedV4Warning[] = [];

    // Names to look up in providerOptions. The Vertex provider exposes these
    // under `googleVertex`/`vertex` (matching the Google Vertex language model),
    // while every other Google provider uses `google`.
    const providerOptionsNames: readonly string[] =
      this.config.provider.includes('vertex')
        ? (['googleVertex', 'vertex'] as const)
        : (['google'] as const);

    let googleOptions: GoogleSpeechModelOptions | undefined;
    for (const name of providerOptionsNames) {
      googleOptions = await parseProviderOptions({
        provider: name,
        providerOptions,
        schema: googleSpeechProviderOptionsSchema,
      });
      if (googleOptions != null) {
        break;
      }
    }

    // Cross-namespace fallback: a Vertex provider may receive options under the
    // `google` key (e.g. via the AI Gateway).
    if (googleOptions == null && !providerOptionsNames.includes('google')) {
      googleOptions = await parseProviderOptions({
        provider: 'google',
        providerOptions,
        schema: googleSpeechProviderOptionsSchema,
      });
    }

    // Older Gemini families require prompt-based directions. Default newer and
    // custom model IDs to structured speech without enumerating their aliases.
    const usesStructuredSpeech =
      !this.modelId.startsWith('gemini-2.5-') &&
      !this.modelId.startsWith('gemini-3.1-');

    const input = getGoogleSpeechInput({
      text,
      voice,
      providerOptions: { google: googleOptions },
    });

    if (input.usesCustomVoice) {
      throw new InvalidArgumentError({
        argument: 'voice',
        message:
          'Custom voices are not supported. Use a prebuilt voice instead.',
      });
    }

    // Multi-speaker (provider option) takes precedence over the single voice.
    const multiSpeakerVoiceConfig = googleOptions?.multiSpeakerVoiceConfig;
    const speechConfig = multiSpeakerVoiceConfig
      ? { multiSpeakerVoiceConfig }
      : { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } };

    // Older models expect directions in the prompt. Prepending them to a
    // labelled multi-speaker transcript would break speaker parsing.
    let promptText = text;
    if (instructions != null && !usesStructuredSpeech) {
      if (multiSpeakerVoiceConfig) {
        warnings.push({
          type: 'unsupported',
          feature: 'instructions',
          details:
            'Google Gemini TTS ignores `instructions` when `multiSpeakerVoiceConfig` is set, ' +
            'because prepending them would break multi-speaker transcript parsing.',
        });
      } else {
        promptText = `${instructions}: ${text}`;
      }
    }

    let parts: Array<{
      text: string;
      speechMetadata?: { speaker?: string; style?: string };
    }> = [{ text: promptText }];

    if (usesStructuredSpeech) {
      if (googleOptions?.turns && googleOptions.speechMetadata) {
        throw new InvalidArgumentError({
          argument: 'providerOptions',
          message: 'Set speechMetadata on each turn when using turns.',
        });
      }
      if (googleOptions?.turns && text !== '') {
        warnings.push({
          type: 'unsupported',
          feature: 'text',
          details: 'Google TTS turns replace the top-level text.',
        });
      }
      parts = (
        googleOptions?.turns ?? [
          { text, speechMetadata: googleOptions?.speechMetadata },
        ]
      ).map(part => {
        const style = part.speechMetadata?.style ?? instructions;
        const speaker = part.speechMetadata?.speaker;
        if (
          multiSpeakerVoiceConfig &&
          !multiSpeakerVoiceConfig.speakerVoiceConfigs.some(
            config => config.speaker === speaker,
          )
        ) {
          throw new InvalidArgumentError({
            argument: 'speechMetadata.speaker',
            message:
              'Every multi-speaker turn must specify a speechMetadata.speaker matching a configured speaker.',
          });
        }
        return {
          text: part.text,
          ...(style != null || speaker != null
            ? { speechMetadata: { style, speaker } }
            : {}),
        };
      });
    } else if (googleOptions?.turns || googleOptions?.speechMetadata) {
      throw new InvalidArgumentError({
        argument: 'providerOptions',
        message: 'Structured speech metadata and turns require Gemini 3.8 TTS.',
      });
    }

    if (input.text.length === 0) {
      throw new InvalidArgumentError({
        argument: 'text',
        message: 'Speech input must contain a non-empty transcript.',
      });
    }

    if (speed != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'speed',
        details:
          'Google Gemini TTS models do not support the `speed` option. It was ignored.',
      });
    }

    if (language != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'language',
        details:
          'Google Gemini TTS models do not support the `language` option. ' +
          'Language is detected automatically from the input text.',
      });
    }

    const formats: Record<string, string> = usesStructuredSpeech
      ? {
          wav: 'AUDIO_WAV',
          'audio/wav': 'AUDIO_WAV',
          pcm: 'AUDIO_L16',
          'audio/l16': 'AUDIO_L16',
          mulaw: 'AUDIO_MULAW',
          'audio/mulaw': 'AUDIO_MULAW',
          alaw: 'AUDIO_ALAW',
          'audio/alaw': 'AUDIO_ALAW',
        }
      : { wav: 'AUDIO_WAV', pcm: 'AUDIO_L16' };
    let resolvedOutputFormat = 'wav';
    if (
      outputFormat != null &&
      Object.prototype.hasOwnProperty.call(formats, outputFormat)
    ) {
      resolvedOutputFormat = outputFormat;
    } else if (outputFormat != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'outputFormat',
        details: `Unsupported output format: ${outputFormat}. Using wav instead.`,
      });
    }

    const requestBody = {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig,
        ...(usesStructuredSpeech && outputFormat != null
          ? {
              responseFormat: {
                audio: { mimeType: formats[resolvedOutputFormat] },
              },
            }
          : {}),
      },
    };

    return {
      requestBody,
      warnings,
      outputFormat: formats[resolvedOutputFormat],
      usesStructuredSpeech,
    };
  }

  async doGenerate(
    options: Parameters<SpeechModelV4['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<SpeechModelV4['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { requestBody, warnings, outputFormat, usesStructuredSpeech } =
      await this.getArgs(options);

    const {
      value: response,
      responseHeaders,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: `${this.config.baseURL}/models/${this.modelId}:generateContent`,
      headers: combineHeaders(
        this.config.headers ? await resolve(this.config.headers) : undefined,
        options.headers,
      ),
      body: requestBody,
      failedResponseHandler: googleFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        googleSpeechResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    // `generateSpeech` returns a single audio result, and Gemini returns one
    // inline audio part per request, so take the first inline-data part.
    let base64Audio: string | undefined;
    let mimeType: string | undefined;
    for (const candidate of response.candidates ?? []) {
      for (const part of candidate.content?.parts ?? []) {
        if (part.inlineData?.data) {
          base64Audio = part.inlineData.data;
          mimeType = part.inlineData.mimeType ?? undefined;
          break;
        }
      }
      if (base64Audio != null) {
        break;
      }
    }

    const sampleRate = parseSampleRate(mimeType) ?? DEFAULT_SAMPLE_RATE;
    const bytes =
      base64Audio != null
        ? convertBase64ToUint8Array(base64Audio)
        : new Uint8Array(0);

    // Older models return PCM, which needs a container for default WAV output.
    // Gemini 3.8 returns WAV itself; adding another header corrupts that audio.
    const isPcm =
      /^audio\/(?:l16|pcm)(?:;|$)/i.test(mimeType ?? '') ||
      (mimeType == null && !usesStructuredSpeech);
    const audio =
      outputFormat === 'AUDIO_WAV' && isPcm && bytes.length > 0
        ? addWavHeader(bytes, sampleRate)
        : bytes;

    if (
      outputFormat === 'AUDIO_L16' &&
      bytes.length > 0 &&
      !usesStructuredSpeech
    ) {
      warnings.push({
        type: 'unsupported',
        feature: 'outputFormat',
        details:
          `Returning raw PCM audio (signed 16-bit little-endian, mono, ${sampleRate} Hz). ` +
          'These bytes have no container header and are not directly playable; ' +
          'see providerMetadata.google for the sample rate and mime type.',
      });
    }

    return {
      audio,
      warnings,
      ...(response.usageMetadata != null && {
        usage: response.usageMetadata,
      }),
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
          sampleRate,
          mimeType: mimeType ?? null,
        },
      },
    };
  }
}

/**
 * Parses the sample rate from a PCM mime type such as `audio/L16;rate=24000`.
 */
function parseSampleRate(mimeType: string | undefined): number | undefined {
  if (mimeType == null) {
    return undefined;
  }
  const match = /rate=(\d+)/.exec(mimeType);
  return match ? Number.parseInt(match[1], 10) : undefined;
}

/**
 * Wraps raw signed 16-bit little-endian mono PCM in a minimal 44-byte WAV
 * (RIFF/WAVE) container so the output is playable and detectable as `audio/wav`.
 */
function addWavHeader(pcm: Uint8Array, sampleRate: number): Uint8Array {
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm.length;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // audio format = PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  const out = new Uint8Array(buffer);
  out.set(pcm, 44);
  return out;
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}
