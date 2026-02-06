import {
  type SharedV3Warning,
  type SpeechModelV3,
  type SpeechModelV3CallOptions,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  createJsonResponseHandler,
  type FetchFunction,
  type InferSchema,
  lazySchema,
  parseProviderOptions,
  postJsonToApi,
  type Resolvable,
  resolve,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { googleFailedResponseHandler } from './google-error';
import {
  googleSpeechProviderOptionsSchema,
  type GoogleGenerativeAISpeechModelId,
} from './google-generative-ai-speech-settings';

export type GoogleGenerativeAISpeechProviderOptions = InferSchema<
  typeof googleSpeechProviderOptionsSchema
>;

interface GoogleGenerativeAISpeechModelConfig {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
}

export class GoogleGenerativeAISpeechModel implements SpeechModelV3 {
  readonly specificationVersion = 'v3';

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: GoogleGenerativeAISpeechModelId,
    private readonly config: GoogleGenerativeAISpeechModelConfig,
  ) {}

  async doGenerate(
    options: SpeechModelV3CallOptions,
  ): Promise<Awaited<ReturnType<SpeechModelV3['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const warnings: SharedV3Warning[] = [];

    // Parse provider options
    const googleOptions = (await parseProviderOptions({
      provider: 'google',
      providerOptions: options.providerOptions,
      schema: googleSpeechProviderOptionsSchema,
    })) as GoogleGenerativeAISpeechProviderOptions | undefined;

    // Generate warnings for unsupported features
    if (options.speed != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'speed',
        details: 'Gemini TTS does not support speed control.',
      });
    }

    if (options.outputFormat != null && options.outputFormat !== 'wav') {
      warnings.push({
        type: 'unsupported',
        feature: 'outputFormat',
        details:
          'Gemini TTS returns WAV audio. The outputFormat parameter is ignored.',
      });
    }

    // Build speechConfig
    const speechConfig: Record<string, unknown> = {};

    // Add language code if provided
    if (options.language != null) {
      speechConfig.languageCode = options.language;
    }

    // Handle multi-speaker configuration (mutually exclusive with voiceConfig)
    if (googleOptions?.multiSpeakerVoiceConfig != null) {
      speechConfig.multiSpeakerVoiceConfig =
        googleOptions.multiSpeakerVoiceConfig;
    } else {
      // Build voiceConfig for single speaker
      const voiceConfig: Record<string, unknown> = {};

      if (googleOptions?.replicatedVoiceConfig != null) {
        // Voice cloning
        voiceConfig.replicatedVoiceConfig = googleOptions.replicatedVoiceConfig;
      } else if (options.voice != null) {
        // Prebuilt voice
        voiceConfig.prebuiltVoiceConfig = {
          voiceName: options.voice,
        };
      }

      if (Object.keys(voiceConfig).length > 0) {
        speechConfig.voiceConfig = voiceConfig;
      }
    }

    // Build the text content, prepending instructions if provided
    const textContent =
      options.instructions != null
        ? `${options.instructions}\n\n${options.text}`
        : options.text;

    // Build request body
    const body = {
      contents: [
        {
          parts: [{ text: textContent }],
        },
      ],
      generationConfig: {
        responseModalities: ['AUDIO'],
        ...(Object.keys(speechConfig).length > 0 && { speechConfig }),
      },
    };

    // Make the API request
    const { value: response, responseHeaders } = await postJsonToApi({
      url: `${this.config.baseURL}/models/${this.modelId}:generateContent`,
      headers: combineHeaders(
        await resolve(this.config.headers),
        options.headers,
      ),
      body,
      successfulResponseHandler: createJsonResponseHandler(
        googleSpeechResponseSchema,
      ),
      failedResponseHandler: googleFailedResponseHandler,
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    // Extract audio data from response
    const audioData =
      response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!audioData) {
      throw new Error(
        `No audio data in response. Response: ${JSON.stringify(response)}`,
      );
    }

    // Convert base64 PCM to Uint8Array
    const pcmData = convertBase64ToUint8Array(audioData);

    // Convert PCM to WAV format (Gemini returns 16-bit PCM, mono, 24kHz)
    const audio = createWavFromPcm(pcmData, 24000, 1, 16);

    return {
      audio,
      warnings,
      request: {
        body,
      },
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
        body: response,
      },
    };
  }
}

/**
 * Creates a WAV file from raw PCM audio data by adding the RIFF/WAV header.
 * Gemini TTS returns raw PCM audio (16-bit, mono, 24kHz) which needs a header
 * to be playable by standard audio players.
 */
function createWavFromPcm(
  pcmData: Uint8Array,
  sampleRate: number,
  numChannels: number,
  bitsPerSample: number,
): Uint8Array {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmData.length;
  const headerSize = 44;
  const fileSize = headerSize + dataSize;

  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, fileSize - 8, true); // File size - 8 bytes for RIFF header
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Sub-chunk size (16 for PCM)
  view.setUint16(20, 1, true); // Audio format (1 = PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Copy PCM data
  const wavArray = new Uint8Array(buffer);
  wavArray.set(pcmData, headerSize);

  return wavArray;
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

const googleSpeechResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      candidates: z
        .array(
          z.object({
            content: z
              .object({
                parts: z
                  .array(
                    z.object({
                      inlineData: z
                        .object({
                          mimeType: z.string().nullish(),
                          data: z.string(),
                        })
                        .nullish(),
                    }),
                  )
                  .nullish(),
              })
              .nullish(),
          }),
        )
        .nullish(),
    }),
  ),
);
