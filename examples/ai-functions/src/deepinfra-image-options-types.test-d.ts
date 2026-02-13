import type { DeepInfraImageModelOptions } from '@ai-sdk/deepinfra';
import { describe, expectTypeOf, it } from 'vitest';

describe('@ai-sdk/deepinfra', () => {
  it('exports DeepInfraImageModelOptions for `providerOptions.deepinfra`', () => {
    const options = {
      guidance_scale: 7.5,
      num_inference_steps: 25,
      negative_prompt: 'blurry, distorted',
    } satisfies DeepInfraImageModelOptions;

    expectTypeOf(options).toMatchTypeOf<DeepInfraImageModelOptions>();
  });
});
