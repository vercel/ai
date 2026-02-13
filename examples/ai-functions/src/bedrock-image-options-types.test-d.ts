import type { AmazonBedrockImageModelOptions } from '@ai-sdk/amazon-bedrock';
import { describe, expectTypeOf, it } from 'vitest';

describe('@ai-sdk/amazon-bedrock', () => {
  it('exports AmazonBedrockImageModelOptions for `providerOptions.bedrock`', () => {
    const options = {
      quality: 'premium',
      negativeText: 'blurry, low quality',
      cfgScale: 7.5,
      style: 'PHOTOREALISM',
    } satisfies AmazonBedrockImageModelOptions;

    expectTypeOf(options).toMatchTypeOf<AmazonBedrockImageModelOptions>();
  });
});
