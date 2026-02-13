import type {
  FireworksImageModelOptions,
  FireworksFluxImageModelOptions,
  FireworksKontextImageModelOptions,
} from '@ai-sdk/fireworks';
import { describe, expectTypeOf, it } from 'vitest';

describe('@ai-sdk/fireworks', () => {
  it('exports FireworksFluxImageModelOptions for `providerOptions.fireworks`', () => {
    const options = {
      guidance_scale: 3.5,
      num_inference_steps: 4,
    } satisfies FireworksFluxImageModelOptions;

    expectTypeOf(options).toMatchTypeOf<FireworksFluxImageModelOptions>();
  });

  it('exports FireworksKontextImageModelOptions for `providerOptions.fireworks`', () => {
    const options = {
      output_format: 'png',
      safety_tolerance: 2,
      prompt_upsampling: true,
    } satisfies FireworksKontextImageModelOptions;

    expectTypeOf(options).toMatchTypeOf<FireworksKontextImageModelOptions>();
  });

  it('exports FireworksImageModelOptions as a union type', () => {
    const fluxOptions = {
      guidance_scale: 7.0,
    } satisfies FireworksImageModelOptions;

    const kontextOptions = {
      safety_tolerance: 3,
    } satisfies FireworksImageModelOptions;

    expectTypeOf(fluxOptions).toMatchTypeOf<FireworksImageModelOptions>();
    expectTypeOf(kontextOptions).toMatchTypeOf<FireworksImageModelOptions>();
  });
});
