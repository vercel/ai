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
) {
  // TODO: In the next major version, change the default value of throwErrorForEmptyVectors to true
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

  const magnitude1 = magnitude(vector1);
  const magnitude2 = magnitude(vector2);

  if (magnitude1 === 0 || magnitude2 === 0) {
    return 0;
  }

  return dotProduct(vector1, vector2) / (magnitude1 * magnitude2);
}

/**
 * Calculates the dot product of two vectors.
 * @param vector1 - The first vector.
 * @param vector2 - The second vector.
 * @returns The dot product of vector1 and vector2.
 */
function dotProduct(vector1: number[], vector2: number[]) {
  return vector1.reduce(
    (accumulator: number, value: number, index: number) =>
      accumulator + value * vector2[index]!,
    0,
  );
}

/**
 * Calculates the magnitude of a vector.
 * @param vector - The vector.
 * @returns The magnitude of the vector.
 */
function magnitude(vector: number[]) {
  return Math.sqrt(dotProduct(vector, vector));
}
