import { SpeechModelV2, SpeechModelV2CallWarning } from '@ai-sdk/provider';
import {
  combineHeaders,
  createBinaryResponseHandler,
  parseProviderOptions,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { HumeConfig } from './hume-config';
import { humeFailedResponseHandler } from './hume-error';
import { HumeSpeechAPITypes } from './hume-api-types';

// https://dev.hume.ai/reference/text-to-speech-tts/synthesize-file
const humeSpeechCallOptionsSchema = z.object({
  /**
   * Context for the speech synthesis request.
   * Can be either a generationId for retrieving a previous generation,
   * or a list of utterances to synthesize.
   */
  context: z
    .object({
      /**
       * ID of a previously generated speech synthesis to retrieve.
       */
      generationId: z.string(),
    })
    .or(
      z.object({
        /**
         * List of utterances to synthesize into speech.
         */
        utterances: z.array(
          z.object({
            /**
             * The text content to convert to speech.
             */
            text: z.string(),
            /**
             * Optional description or instructions for how the text should be spoken.
             */
            description: z.string().optional(),
            /**
             * Optional speech rate multiplier.
             */
            speed: z.number().optional(),
            /**
             * Optional duration of silence to add after the utterance in seconds.
             */
            trailingSilence: z.number().optional(),
            /**
             * Voice configuration for the utterance.
             * Can be specified by ID or name.
             */
            voice: z
              .object({
                /**
                 * ID of the voice to use.
                 */
                id: z.string(),
                /**
                 * Provider of the voice, either Hume's built-in voices or a custom voice.
                 */
                provider: z.enum(['HUME_AI', 'CUSTOM_VOICE']).optional(),
              })
              .or(
                z.object({
                  /**
                   * Name of the voice to use.
                   */
                  name: z.string(),
                  /**
                   * Provider of the voice, either Hume's built-in voices or a custom voice.
                   */
                  provider: z.enum(['HUME_AI', 'CUSTOM_VOICE']).optional(),
                }),
              )
              .optional(),
          }),
        ),
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

export class HumeSpeechModel implements SpeechModelV2 {
  readonly specificationVersion = 'v2';

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: '',
    private readonly config: HumeSpeechModelConfig,
  ) {}

  private async getArgs({
    text,
    voice = 'd8ab67c6-953d-4bd8-9370-8fa53a0f1453',
    outputFormat = 'mp3',
    speed,
    instructions,
    language,
    providerOptions,
  }: Parameters<SpeechModelV2['doGenerate']>[0]) {
    const warnings: SpeechModelV2CallWarning[] = [];

    // Parse provider options
    const humeOptions = await parseProviderOptions({
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

    if (language) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'language',
        details: `Hume speech models do not support language selection. Language parameter "${language}" was ignored.`,
      });
    }

    return {
      requestBody,
      warnings,
    };
  }

  async doGenerate(
    options: Parameters<SpeechModelV2['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<SpeechModelV2['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { requestBody, warnings } = await this.getArgs(options);

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
