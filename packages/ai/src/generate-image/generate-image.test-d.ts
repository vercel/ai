import { it } from 'vitest';
import { MockImageModelV4 } from '../test/mock-image-model-v4';
import { generateImage } from './generate-image';

const model = new MockImageModelV4();

it('supports fixed and incrementing seed strategies', () => {
  generateImage({
    model,
    prompt: 'A lighthouse on a cliff',
    seed: 42,
    seedStrategy: 'fixed',
  });

  generateImage({
    model,
    prompt: 'A lighthouse on a cliff',
    seed: 42,
    seedStrategy: 'increment',
  });
});

it('rejects unsupported seed strategies', () => {
  generateImage({
    model,
    prompt: 'A lighthouse on a cliff',
    seed: 42,
    // @ts-expect-error - seedStrategy only supports fixed or increment
    seedStrategy: 'random',
  });
});
