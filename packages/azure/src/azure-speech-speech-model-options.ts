import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const azureSpeechSpeechModelOptionsShape = () => ({
  /**
   * Speaking style applied with `mstts:express-as`, e.g. `excited` or
   * `whispering`. Supported styles vary by voice.
   */
  style: z.string().min(1).optional(),

  /**
   * Intensity of `style`, from 0.01 to 2. Azure defaults to 1.
   */
  styleDegree: z.number().min(0.01).max(2).optional(),
});

export const azureSpeechSpeechModelOptions = lazySchema(() =>
  zodSchema(z.strictObject(azureSpeechSpeechModelOptionsShape())),
);

export type AzureSpeechModelSpeechOptions = InferSchema<
  typeof azureSpeechSpeechModelOptions
>;
