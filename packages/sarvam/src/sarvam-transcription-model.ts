import {
  TranscriptionModelV1,
  TranscriptionModelV1CallWarning,
} from '@ai-sdk/provider';
import { parseProviderOptions } from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { SarvamConfig } from './sarvam-config';
import { SarvamTranscriptionAPITypes } from './sarvam-api-types';
import { sarvamFailedResponseHandler } from './sarvam-error';
import { SarvamTranscriptionModelId } from './sarvam-transcription-settings';

// https://docs.sarvam.ai/api-reference-docs/endpoints/speech-to-text
const sarvamProviderOptionsSchema = z.object({
  language_code: z.string(),
  with_timestamps: z.boolean().nullish().default(false),
  /**
   * Enables speaker diarization, which identifies and separates different speakers in the audio.
   * When set to true, the API will provide speaker-specific segments in the response.
   * Note: This parameter is currently in Beta mode.
   */
  with_diarization: z.boolean().nullish().default(false),
  /**
   * Number of speakers to be detected in the audio.
   * This is used when with_diarization is set to true.
   * Can be null.
   */
  num_speakers: z.number().int().min(1).max(32).nullish(),
});

export type SarvamTranscriptionCallOptions = z.infer<
  typeof sarvamProviderOptionsSchema
>;

interface SarvamTranscriptionModelConfig extends SarvamConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

export class SarvamTranscriptionModel implements TranscriptionModelV1 {
  readonly specificationVersion = 'v1';

  constructor(
    readonly modelId: SarvamTranscriptionModelId,
    private readonly config: SarvamTranscriptionModelConfig,
  ) {}

  get provider(): string {
    return this.config.provider;
  }

  private getArgs({
    audio,
    mediaType,
    providerOptions,
  }: Parameters<TranscriptionModelV1['doGenerate']>[0]) {
    const warnings: TranscriptionModelV1CallWarning[] = [];

    const sarvamOptions = parseProviderOptions({
      provider: 'sarvam',
      providerOptions,
      schema: sarvamProviderOptionsSchema,
    });

    const formData = new FormData();
    const blob =
      audio instanceof Blob ? audio : new Blob([audio], { type: mediaType });

    formData.append('file', blob);
    formData.append('model', this.modelId);
    if (sarvamOptions) {
      formData.append('language_code', sarvamOptions.language_code);
      formData.append(
        'with_timestamps',
        sarvamOptions.with_timestamps ? 'true' : 'false',
      );
      formData.append(
        'with_diarization',
        sarvamOptions.with_diarization ? 'true' : 'false',
      );
      if (
        sarvamOptions.num_speakers !== null &&
        sarvamOptions.num_speakers !== undefined
      ) {
        formData.append('num_speakers', sarvamOptions.num_speakers.toString());
      }
    }

    return {
      formData,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      warnings,
    };
  }
}
