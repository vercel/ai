import { SpeechModelV2, SpeechModelV2CallWarning } from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonResponseHandler,
  parseProviderOptions,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { MinimaxConfig } from './minimax-config';
import { minimaxFailedResponseHandler } from './minimax-error';
import { MinimaxSpeechModelId } from './minimax-speech-options';

// https://www.minimax.io/platform/document/T2A%20V2?key=66719005a427f0c8a5701643
const minimaxSpeechCallOptionsSchema = z.object({
  /**
   * The model to use for speech synthesis e.g. 'speech-02-hd', 'speech-02-turbo', 'speech-01-hd', or 'speech-01-turbo'.
   * @default 'speech-02-hd'
   */
  model: z
    .union([
      z.enum([
        'speech-02-hd',
        'speech-02-turbo',
        'speech-01-hd',
        'speech-01-turbo',
      ]),
      z.string(),
    ])
    .optional(),

  text: z.string().optional(),

  audio_setting: z
    .object({
      /**
       * range: [8000,16000,22050,24000,32000,44100] default: 32000
       * Sample rate of generated sound. Optional.
       */
      sample_rate: z
        .union([
          z.literal(8000),
          z.literal(16000),
          z.literal(22050),
          z.literal(24000),
          z.literal(32000),
          z.literal(44100),
        ])
        .optional(),

      /**
       * range: [32000,64000,128000,256000] default: 128000
       * Bitrate of generated sound. Optional
       */
      bitrate: z
        .union([
          z.literal(32000),
          z.literal(64000),
          z.literal(128000),
          z.literal(256000),
        ])
        .optional(),

      /**
       * string range: [mp3,pcm,flac] default: mp3
       * Format of generated sound. Optional
       */
      format: z.enum(['mp3', 'pcm', 'flac']).optional(),

      /**
       * range: [1, 2] default: 1
       * The number of channels of the generated audio.
       */
      channel: z.union([z.literal(1), z.literal(2)]).optional(),
    })
    .optional(),

  voice_setting: z
    .object({
      /**
       * range: [0.5,2] default: 1.0
       * The speed of the generated speech. Larger values indicate faster speech.
       */
      speed: z.number().min(0.5).max(2).optional(),

      /**
       * range: (0,10] default: 1.0
       * The volume of the generated speech. Larger values indicate larger volumes.
       */
      vol: z.number().min(0).max(10).optional(),

      /**
       * range: [-12,12] default: 0
       * The pitch of the generated speech. A value of 0 corresponds to default voice output.
       */
      pitch: z.number().min(-12).max(12).optional(),

      /**
     * Desired voice. Both system voice ids and cloned voice ids are supported. System voice ids are listed below:
     * Wise_Woman
     * Friendly_Person
     * Inspirational_girl
     * Deep_Voice_Man
     * Calm_Woman
     * Casual_Guy
     * Lively_Girl
     * Patient_Man
     * Young_Knight
     * Determined_Man
     * Lovely_Girl
     * Decent_Boy
     * Imposing_Manner
     * Elegant_Man
     * Abbess
     * Sweet_Girl_2
Exuberant_Girl
     */
      voice_id: z.string().optional(),

      /**
       * The emotion of the generated speech;
       * Currently supports seven emotions；
       * range:["happy", "sad", "angry", "fearful", "disgusted", "surprised", "neutral"]
       */
      emotion: z
        .enum([
          'happy',
          'sad',
          'angry',
          'fearful',
          'disgusted',
          'surprised',
          'neutral',
        ])
        .optional(),

      /**
       * This parameter supports English text normalization, which improves performance in number-reading scenarios, but this comes at the cost of a slight increase in latency. If not provided, the default value is false.
       */
      english_normalization: z.boolean().optional(),
    })
    .optional(),

  pronunciation_dict: z
    .object({
      /**
       * Replacement of text, symbols and corresponding pronunciations that require manual handling.
       * Replace the pronunciation (adjust the tone/replace the pronunciation of other characters) using the following format:
       * [“燕少飞/(yan4)(shao3)(fei1)”, “达菲/(da2)(fei1)”, “omg/oh my god”]
       * For Chinese texts, tones are replaced by numbers, with 1 for the first tone (high), 2 for the second tone (rising), 3 for the third tone (low/dipping), 4 for the fourth tone (falling), and 5 for the fifth tone (neutral).
       */
      tone: z.array(z.string()).optional(),
    })
    .optional(),

  // timber_weights: z.object({
  //   /**
  //    * Desired voice id. Must be given in conjunction with weight param. Only system voice ids are supported (see voice_id above for more information on existing system voices).
  //    */
  //   voice_id: z.string(),

  //   /**
  //    * Must be given in conjunction with voice_id param. Supports up to voice mixing of up to 4 voices. Higher weighted voices will be sampled more heavily than lower weighted ones.
  //    * integer range: [1, 100]
  //    */
  //   weight: z.number().min(1).max(100),
  // }),

  /**
   * Boolean value indicating whether the generated audio will be a stream. Defaults to non-streaming output.
   */
  stream: z.boolean().optional(),

  /**
   * Enhance the ability to recognize specified languages and dialects.
   * Supported values include:
   * 'Chinese', 'Chinese,Yue', 'English', 'Arabic', 'Russian', 'Spanish', 'French', 'Portuguese', 'German', 'Turkish', 'Dutch', 'Ukrainian', 'Vietnamese', 'Indonesian', 'Japanese', 'Italian', 'Korean', 'Thai', 'Polish', 'Romanian', 'Greek', 'Czech', 'Finnish', 'Hindi', 'auto'
   */
  language_boost: z
    .enum([
      'Chinese',
      'Chinese,Yue',
      'English',
      'Arabic',
      'Russian',
      'Spanish',
      'French',
      'Portuguese',
      'German',
      'Turkish',
      'Dutch',
      'Ukrainian',
      'Vietnamese',
      'Indonesian',
      'Japanese',
      'Italian',
      'Korean',
      'Thai',
      'Polish',
      'Romanian',
      'Greek',
      'Czech',
      'Finnish',
      'Hindi',
      'auto',
    ])
    .optional(),

  /**
   * Adjust audio effects. Supported formats:
   * - Non-streaming: mp3, wav, flac
   * - Streaming: mp3
   */
  voice_modify: z.string().optional(),

  /**
   * The parameter controls whether the subtitle service is enabled. If this parameter is not provided, the default value is false. This parameter only takes effect when the output is non-streaming.
   */
  subtitle: z.boolean().optional(),

  /**
   * This parameter controls the format of the output content. The optional values are urlandhex. The default value is hex. This parameter is only effective in non-streaming scenarios. In streaming scenarios, only the "hex" format is supported for return.
   */
  output_format: z.enum(['url', 'hex']).optional(),
});

export type MinimaxSpeechCallOptions = z.infer<
  typeof minimaxSpeechCallOptionsSchema
>;

const minimaxSpeechResponseSchema = z.object({
  data: z.object({
    audio: z.string(),
    status: z.number().optional(),
    subtitle_file: z.string().optional(),
  }),
  extra_info: z
    .object({
      audio_length: z.number().optional(),
      audio_sample_rate: z.number().optional(),
      audio_size: z.number().optional(),
      audio_bitrate: z.number().optional(),
      word_count: z.number().optional(),
      invisible_character_ratio: z.number().optional(),
      audio_format: z.string().optional(),
      usage_characters: z.number().optional(),
    })
    .optional(),
  trace_id: z.string().optional(),
  base_resp: z
    .object({
      status_code: z.number().optional(),
      status_msg: z.string().optional(),
    })
    .optional(),
});

export type MinimaxSpeechResponse = z.infer<typeof minimaxSpeechResponseSchema>;

interface MinimaxSpeechModelConfig extends MinimaxConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

export class MinimaxSpeechModel implements SpeechModelV2 {
  readonly specificationVersion = 'v2';

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: MinimaxSpeechModelId,
    private readonly config: MinimaxSpeechModelConfig,
  ) {}

  private async getArgs({
    text,
    voice = 'Wise_Woman',
    outputFormat = 'mp3',
    speed = 1,
    language = 'auto',
    providerOptions,
  }: Parameters<SpeechModelV2['doGenerate']>[0]) {
    const warnings: SpeechModelV2CallWarning[] = [];

    // Parse provider options
    const minimaxOptions = await parseProviderOptions({
      provider: 'minimax',
      providerOptions,
      schema: minimaxSpeechCallOptionsSchema,
    });

    // Create request body
    const requestBody: MinimaxSpeechCallOptions = {
      model: this.modelId,
      text,
      audio_setting: {},
      voice_setting: {
        voice_id: voice,
        speed,
      },
    };

    if (outputFormat) {
      if (['mp3', 'pcm', 'flac'].includes(outputFormat)) {
        requestBody.audio_setting!.format = outputFormat as
          | 'mp3'
          | 'pcm'
          | 'flac';
      } else {
        warnings.push({
          type: 'unsupported-setting',
          setting: 'outputFormat',
          details: `Unsupported output format: ${outputFormat}. Using mp3 instead.`,
        });
      }
    }

    // Add provider-specific options
    if (minimaxOptions) {
      for (const key in minimaxOptions) {
        const value =
          minimaxOptions[
            key as keyof Omit<MinimaxSpeechCallOptions, 'model' | 'text'>
          ];
        if (value !== undefined) {
          console.log(key, value, requestBody, minimaxOptions);

          if (requestBody[key as keyof MinimaxSpeechCallOptions]) {
            Object.assign((requestBody as any)[key], value);
          } else {
            (requestBody as any)[key] = value;
          }
        }
      }
    }

    // if (language) {
    //   requestBody.language = language;
    // }

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
        path: '/v1/t2a_v2',
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: requestBody,
      failedResponseHandler: minimaxFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        minimaxSpeechResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const audioData = (rawResponse as MinimaxSpeechResponse)?.data?.audio;
    const audioBuffer = Buffer.from(audioData, 'hex');

    return {
      audio: audioBuffer,
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
