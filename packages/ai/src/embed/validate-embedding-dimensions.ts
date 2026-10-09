import { InvalidArgumentError } from '../error/invalid-argument-error';

export function validateEmbeddingDimensions(dimensions: number | undefined) {
  if (
    dimensions !== undefined &&
    (!Number.isInteger(dimensions) || dimensions <= 0)
  ) {
    throw new InvalidArgumentError({
      parameter: 'dimensions',
      value: dimensions,
      message: 'dimensions must be a positive integer',
    });
  }
}
