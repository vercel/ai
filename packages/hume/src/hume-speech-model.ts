import { SpeechModelV1, SpeechModelV1CallWarning } from '@ai-sdk/provider';
import {
  combineHeaders,
  createBinaryResponseHandler,
  parseProviderOptions,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { HumeConfig } from './hume-config';
import { humeFailedResponseHandler } from './hume-error';
import { HumeSpeechAPITypes } from './hume-api-types';

const humeSpeechCallOptionsUtterancesSchema = z.array(
  z.object({
    text: z.string(),
    description: z.string().optional(),
    speed: z.number().optional(),
    trailingSilence: z.number().optional(),
    voice: z
      .object({
        id: z.string(),
        provider: z.enum(['HUME_AI', 'CUSTOM_VOICE']).optional(),
      })
      .or(
        z.object({
          name: z.string(),
          provider: z.enum(['HUME_AI', 'CUSTOM_VOICE']).optional(),
        }),
      )
      .optional(),
  }),
);

// https://dev.hume.ai/reference/text-to-speech-tts/synthesize-file
const humeSpeechCallOptionsSchema = z.object({
  context: z
    .object({
      generationId: z.string(),
    })
    .or(
      z.object({
        utterances: humeSpeechCallOptionsUtterancesSchema,
      }),
    )
    .nullish(),
});

export type HumeSpeechCallOptions = z.infer<typeof humeSpeechCallOptionsSchema>;

interface HumeSpeechModelConfig extends HumeConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

export class HumeSpeechModel implements SpeechModelV1 {
  readonly specificationVersion = 'v1';

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: '',
    private readonly config: HumeSpeechModelConfig,
  ) {}

  private getArgs({
    text,
    voice = 'd8ab67c6-953d-4bd8-9370-8fa53a0f1453',
    outputFormat = 'mp3',
    speed,
    instructions,
    providerOptions,
  }: Parameters<SpeechModelV1['doGenerate']>[0]) {
    const warnings: SpeechModelV1CallWarning[] = [];

    // Parse provider options
    const humeOptions = parseProviderOptions({
      provider: 'hume',
      providerOptions,
      schema: humeSpeechCallOptionsSchema,
    });

    // Create request body
    const requestBody: HumeSpeechAPITypes = {
      utterances: [
        {
          text,
          speed,
          description: instructions,
          voice: {
            id: voice,
            provider: 'HUME_AI',
          },
        },
      ],
      format: { type: 'mp3' },
    };

    if (outputFormat) {
      if (['mp3', 'pcm', 'wav'].includes(outputFormat)) {
        requestBody.format = { type: outputFormat as 'mp3' | 'pcm' | 'wav' };
      } else {
        warnings.push({
          type: 'unsupported-setting',
          setting: 'outputFormat',
          details: `Unsupported output format: ${outputFormat}. Using mp3 instead.`,
        });
      }
    }

    // Add provider-specific options
    if (humeOptions) {
      const speechModelOptions: Omit<
        HumeSpeechAPITypes,
        'utterances' | 'format'
      > = {};

      if (humeOptions.context) {
        if ('generationId' in humeOptions.context) {
          speechModelOptions.context = {
            generation_id: humeOptions.context.generationId,
          };
        } else {
          speechModelOptions.context = {
            utterances: humeOptions.context.utterances.map(utterance => ({
              text: utterance.text,
              description: utterance.description,
              speed: utterance.speed,
              trailing_silence: utterance.trailingSilence,
              voice: utterance.voice,
            })),
          };
        }
      }

      for (const key in speechModelOptions) {
        const value =
          speechModelOptions[
            key as keyof Omit<HumeSpeechAPITypes, 'utterances' | 'format'>
          ];
        if (value !== undefined) {
          (requestBody as Record<string, unknown>)[key] = value;
        }
      }
    }

    return {
      requestBody,
      warnings,
    };
  }

  async doGenerate(
    options: Parameters<SpeechModelV1['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<SpeechModelV1['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { requestBody, warnings } = this.getArgs(options);

    const {
      value: audio,
      responseHeaders,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: this.config.url({
        path: '/v0/tts/file',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: requestBody,
      failedResponseHandler: humeFailedResponseHandler,
      successfulResponseHandler: createBinaryResponseHandler(),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

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
