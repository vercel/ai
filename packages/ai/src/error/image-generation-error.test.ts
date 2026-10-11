import { describe, expect, it } from 'vitest';
import { ImageGenerationError } from './image-generation-error';

describe('ImageGenerationError', () => {
  it('supports marker-based identification across package copies', () => {
    const error = {
      [Symbol.for('vercel.ai.error.AI_ImageGenerationError')]: true,
    };

    expect(ImageGenerationError.isInstance(error)).toBe(true);
  });
});
