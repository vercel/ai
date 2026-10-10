import { InvalidArgumentError } from '../error/invalid-argument-error';

/**
 * Calculates the cosine similarity between two vectors. This is a useful metric for
 * comparing the similarity of two vectors such as embeddings.
 *
 * @param vector1 - The first vector.
 * @param vector2 - The second vector.
 *
 * @returns The cosine similarity between vector1 and vector2, or 0 if either vector is the zero vector.
 *
 * @throws {InvalidArgumentError} If the vectors do not have the same length.
 */
export function cosineSimilarity(vector1: number[], vector2: number[]): number {
  if (vector1.length !== vector2.length) {
    throw new InvalidArgumentError({
      parameter: 'vector1,vector2',
      value: { vector1Length: vector1.length, vector2Length: vector2.length },
      message: `Vectors must have the same length`,
    });
  }

  const n = vector1.length;

  if (n === 0) {
    return 0; // Return 0 for empty vectors if no error is thrown
  }

  let maxAbsValue1 = 0;
  let maxAbsValue2 = 0;

  // Scale each vector independently to keep the accumulated values finite.
  for (let i = 0; i < n; i++) {
    maxAbsValue1 = Math.max(maxAbsValue1, Math.abs(vector1[i]));
    maxAbsValue2 = Math.max(maxAbsValue2, Math.abs(vector2[i]));
  }

  if (maxAbsValue1 === 0 || maxAbsValue2 === 0) {
    return 0;
  }

  let magnitudeSquared1 = 0;
  let magnitudeSquared2 = 0;
  let dotProduct = 0;

  for (let i = 0; i < n; i++) {
    const value1 = vector1[i] / maxAbsValue1;
    const value2 = vector2[i] / maxAbsValue2;

    magnitudeSquared1 += value1 * value1;
    magnitudeSquared2 += value2 * value2;
    dotProduct += value1 * value2;
  }

  return (
    dotProduct / (Math.sqrt(magnitudeSquared1) * Math.sqrt(magnitudeSquared2))
  );
}
