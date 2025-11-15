import { z } from 'zod/v4';

// https://cloud.google.com/text-to-speech/docs/gemini-tts
export type GoogleVertexSpeechModelId =
  | 'gemini-2.5-flash-tts'
  | 'gemini-2.5-pro-tts'
  | (string & {});

export type GoogleVertexSpeechVoiceId =
  | 'Achernar'
  | 'Achird'
  | 'Algenib'
  | 'Algieba'
  | 'Alnilam'
  | 'Aoede'
  | 'Autonoe'
  | 'Callirrhoe'
  | 'Charon'
  | 'Despina'
  | 'Enceladus'
  | 'Erinome'
  | 'Fenrir'
  | 'Gacrux'
  | 'Iapetus'
  | 'Kore'
  | 'Laomedeia'
  | 'Leda'
  | 'Orus'
  | 'Pulcherrima'
  | 'Puck'
  | 'Rasalgethi'
  | 'Sadachbia'
  | 'Sadaltager'
  | 'Schedar'
  | 'Sulafat'
  | 'Umbriel'
  | 'Vindemiatrix'
  | 'Zephyr'
  | 'Zubenelgenubi'
  | (string & {});

export const googleVertexSpeechProviderOptions = z.object({
  /**
   * Optional. Audio encoding format.
   * Valid values: LINEAR16, MP3, OGG_OPUS, MULAW, ALAW, PCM, M4A.
   * If not specified, outputFormat will be used to determine the encoding.
   */
  audioEncoding: z
    .enum(['LINEAR16', 'MP3', 'OGG_OPUS', 'MULAW', 'ALAW', 'PCM', 'M4A'])
    .optional(),

  /**
   * Optional. The sample rate in hertz for the audio.
   */
  sampleRateHertz: z.number().optional(),

  /**
   * Optional. The speaking rate/speed. Valid values are [0.25, 2.0].
   * 1.0 is the normal native speed. 2.0 is twice as fast, and 0.5 is half as fast.
   */
  speakingRate: z.number().min(0.25).max(2.0).optional(),

  /**
   * Optional. Speaking pitch. Valid values are [-20.0, 20.0].
   * 20 semitones is equivalent to one octave.
   */
  pitch: z.number().min(-20.0).max(20.0).optional(),

  /**
   * Optional. Volume gain (in dB) of the audio. Valid values are [-96.0, 16.0].
   */
  volumeGainDb: z.number().min(-96.0).max(16.0).optional(),

  /**
   * Optional. Multi-speaker voice configuration for conversations.
   */
  multiSpeakerVoiceConfig: z
    .object({
      speakerVoiceConfigs: z
        .array(
          z.object({
            speakerAlias: z.string(),
            speakerId: z.string(),
          }),
        )
        .optional(),
    })
    .optional(),

  /**
   * Optional. Multi-speaker markup for structured conversations.
   */
  multiSpeakerMarkup: z
    .object({
      turns: z
        .array(
          z.object({
            speaker: z.string(),
            text: z.string(),
          }),
        )
        .optional(),
    })
    .optional(),
});

export type GoogleVertexSpeechProviderOptions = z.infer<
  typeof googleVertexSpeechProviderOptions
>;
