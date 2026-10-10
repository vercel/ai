import { expectTypeOf, it } from 'vitest';
import { MockImageModelV4 } from '../test/mock-image-model-v4';
import { generateImage } from './generate-image';

it('accepts a maximum number of parallel image model calls', async () => {
  const options: Parameters<typeof generateImage>[0] = {
    model: new MockImageModelV4(),
    prompt: 'A lighthouse during a storm',
    n: 4,
    maxParallelCalls: 2,
  };

  expectTypeOf(options.maxParallelCalls).toEqualTypeOf<number | undefined>();

  await generateImage(options);
});
