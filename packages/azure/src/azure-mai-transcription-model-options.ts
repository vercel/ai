import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const azureMaiTranscriptionModelOptionsShape = () => ({
  /**
   * Language hint for streaming transcription, e.g. `en`. Omit for automatic
   * language detection.
   */
  language: z.string().min(1).optional(),
});

export const azureMaiTranscriptionModelOptions = lazySchema(() =>
  zodSchema(z.strictObject(azureMaiTranscriptionModelOptionsShape())),
);

export type AzureTranscriptionModelMaiOptions = InferSchema<
  typeof azureMaiTranscriptionModelOptions
>;
