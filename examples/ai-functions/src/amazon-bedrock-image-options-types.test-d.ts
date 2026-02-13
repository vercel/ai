import type { AmazonBedrockImageModelOptions } from '@ai-sdk/amazon-bedrock';
import { describe, expectTypeOf, it } from 'vitest';

describe('@ai-sdk/amazon-bedrock', () => {
  it('exports AmazonBedrockImageModelOptions for `providerOptions.bedrock`', () => {
    const options = {
      quality: 'premium',
      cfgScale: 7.5,
      negativeText: 'blurry, distorted',
      taskType: 'TEXT_IMAGE',
    } satisfies AmazonBedrockImageModelOptions;

    expectTypeOf(options).toMatchTypeOf<AmazonBedrockImageModelOptions>();
  });
});
