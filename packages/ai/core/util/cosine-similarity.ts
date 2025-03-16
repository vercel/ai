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
 * @throws {InvalidArgumentError} If throwErrorForEmptyVectors is true and vectors are empty.
 * @throws {Error} If the vectors do not have the same length.
 */
export function cosineSimilarity(
  vector1: number[],
  vector2: number[],
  options: {
    throwErrorForEmptyVectors?: boolean;
  } = {
    throwErrorForEmptyVectors: false,
  },
): number {
  const { throwErrorForEmptyVectors } = options;

  if (vector1.length !== vector2.length) {
    throw new Error(
      `Vectors must have the same length (vector1: ${vector1.length} elements, vector2: ${vector2.length} elements)`,
    );
  }

  if (throwErrorForEmptyVectors && vector1.length === 0) {
    throw new InvalidArgumentError({
      parameter: 'vector1',
      value: vector1,
      message: 'Vectors cannot be empty',
    });
  }

  if (vector1.length === 0) {
    return 0; // Return 0 for empty vectors if no error is thrown
  }

  let dot = 0;
  let norm1 = 0;
  let norm2 = 0;

  // Single-pass loop: compute dot product and squared norms concurrently
  for (let i = 0; i < vector1.length; i++) {
    const a = vector1[i];
    const b = vector2[i];
    dot += a * b;
    norm1 += a * a;
    norm2 += b * b;
  }

  if (norm1 === 0 || norm2 === 0) {
    return 0;
  }

  return dot / (Math.sqrt(norm1) * Math.sqrt(norm2));
}
