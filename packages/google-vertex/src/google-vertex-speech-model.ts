import { SpeechModelV3, SpeechModelV3CallWarning } from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonResponseHandler,
  parseProviderOptions,
  postJsonToApi,
  resolve,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { GoogleVertexConfig } from './google-vertex-config';
import { googleVertexFailedResponseHandler } from './google-vertex-error';
import {
  GoogleVertexSpeechModelId,
  googleVertexSpeechProviderOptions,
} from './google-vertex-speech-options';

interface GoogleVertexSpeechModelConfig extends GoogleVertexConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

export class GoogleVertexSpeechModel implements SpeechModelV3 {
  readonly specificationVersion = 'v3';

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: GoogleVertexSpeechModelId,
    private readonly config: GoogleVertexSpeechModelConfig,
  ) {}

  private async getArgs({
    text,
    voice = 'Achernar',
    outputFormat,
    speed,
    instructions,
    language = 'en-US',
    providerOptions,
  }: Parameters<SpeechModelV3['doGenerate']>[0]) {
    const warnings: SpeechModelV3CallWarning[] = [];

    // Parse provider options
    const googleOptions = await parseProviderOptions({
      provider: 'google',
      providerOptions,
      schema: googleVertexSpeechProviderOptions,
    });

    // Create request body based on Google Text-to-Speech API format
    const input: Record<string, unknown> = {};

    // Handle multi-speaker markup vs regular text
    if (googleOptions?.multiSpeakerMarkup?.turns) {
      input.multiSpeakerMarkup = googleOptions.multiSpeakerMarkup;
    } else {
      input.text = text;
    }

    // Handle instructions
    if (instructions) {
      input.prompt = instructions;
    }

    // Create voice configuration
    const voiceConfig: Record<string, unknown> = {
      languageCode: language,
      modelName: this.modelId,
    };

    // Handle multi-speaker vs single speaker voice config
    if (googleOptions?.multiSpeakerVoiceConfig) {
      voiceConfig.multiSpeakerVoiceConfig =
        googleOptions.multiSpeakerVoiceConfig;
    } else {
      voiceConfig.name = voice;
    }

    // Create audio config
    const formatMap: Record<string, string> = {
      mp3: 'MP3',
      wav: 'LINEAR16',
      pcm: 'LINEAR16',
      ogg: 'OGG_OPUS',
      mulaw: 'MULAW',
      alaw: 'ALAW',
    };

    let audioEncoding: string;
    if (outputFormat) {
      const mappedFormat = formatMap[outputFormat];
      if (mappedFormat) {
        audioEncoding = mappedFormat;
      } else {
        warnings.push({
          type: 'unsupported-setting',
          setting: 'outputFormat',
          details: `Unsupported output format: ${outputFormat}.`,
        });
      }
    } else if (googleOptions?.audioEncoding) {
      audioEncoding = googleOptions.audioEncoding;
    }
    audioEncoding ??= 'LINEAR16';

    const audioConfig: Record<string, unknown> = {
      audioEncoding,
    };

    // Add sample rate if provided
    if (googleOptions?.sampleRateHertz !== undefined) {
      audioConfig.sampleRateHertz = googleOptions.sampleRateHertz;
    }

    // Add speaking rate if provided
    if (speed !== undefined) {
      audioConfig.speakingRate = speed;
    } else if (googleOptions?.speakingRate !== undefined) {
      audioConfig.speakingRate = googleOptions.speakingRate;
    }

    // Add pitch if provided
    if (googleOptions?.pitch !== undefined) {
      audioConfig.pitch = googleOptions.pitch;
    }

    // Add volume gain if provided
    if (googleOptions?.volumeGainDb !== undefined) {
      audioConfig.volumeGainDb = googleOptions.volumeGainDb;
    }

    const requestBody = {
      input,
      voice: voiceConfig,
      audioConfig,
    };

    return {
      requestBody,
      warnings,
    };
  }

  async doGenerate(
    options: Parameters<SpeechModelV3['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<SpeechModelV3['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { requestBody, warnings } = await this.getArgs(options);

    const {
      value: response,
      responseHeaders,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: `${this.config.baseURL}/text:synthesize`,
      headers: combineHeaders(
        await resolve(this.config.headers),
        options.headers,
      ),
      body: requestBody,
      failedResponseHandler: googleVertexFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        googleVertexSpeechResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    // Decode base64 audio content
    const audioContent = response.audioContent;
    const audio = Buffer.from(audioContent, 'base64');

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
    };
  }
}

// Schema for Google Text-to-Speech API response
const googleVertexSpeechResponseSchema = z.object({
  audioContent: z.string(), // Base64 encoded audio
});
