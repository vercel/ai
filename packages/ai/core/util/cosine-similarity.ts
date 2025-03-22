import { InvalidArgumentError } from '../../errors/invalid-argument-error';

/**
 * Calculates the cosine similarity between two vectors. This is a useful metric for
 * comparing the similarity of two vectors such as embeddings.
 *
 * @param vector1 - The first vector.
 * @param vector2 - The second vector.
 * @param options - Optional configuration.
 * @param options.throwErrorForEmptyVectors - If true, throws an error for empty vectors. Default: false.
 *
 * @returns The cosine similarity between vector1 and vector2.
 * @returns 0 if either vector is the zero vector.
 *
 * @throws {InvalidArgumentError} If throwErrorForEmptyVectors is true and vectors are empty.
 * @throws {InvalidArgumentError} If the vectors do not have the same length.
 */
export function cosineSimilarity(
  vector1: number[],
  vector2: number[],
  // TODO remove throw option in 5.0
  options?: {
    /**
     * @deprecated will be removed in 5.0
     */
    throwErrorForEmptyVectors?: boolean;
  },
): number {
  if (vector1.length !== vector2.length) {
    throw new InvalidArgumentError({
      parameter: 'vector1,vector2',
      value: { vector1Length: vector1.length, vector2Length: vector2.length },
      message: `Vectors must have the same length`,
    });
  }

  const n = vector1.length;

  if (n === 0) {
    if (options?.throwErrorForEmptyVectors) {
      throw new InvalidArgumentError({
        parameter: 'vector1',
        value: vector1,
        message: 'Vectors cannot be empty',
      });
    }

    return 0; // Return 0 for empty vectors if no error is thrown
  }

  let magnitudeSquared1 = 0;
  let magnitudeSquared2 = 0;
  let dotProduct = 0;

  for (let i = 0; i < n; i++) {
    const value1 = vector1[i];
    const value2 = vector2[i];

    magnitudeSquared1 += value1 * value1;
    magnitudeSquared2 += value2 * value2;
    dotProduct += value1 * value2;
  }

  return magnitudeSquared1 === 0 || magnitudeSquared2 === 0
    ? 0
    : dotProduct /
        (Math.sqrt(magnitudeSquared1) * Math.sqrt(magnitudeSquared2));
}
