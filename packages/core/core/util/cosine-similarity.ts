/**
 * Calculates the cosine similarity between two vectors. This is a useful metric for
 * comparing the similarity of two vectors such as embeddings.
 *
 * @param vector1 - The first vector.
 * @param vector2 - The second vector.
 *
 * @returns The cosine similarity between vector1 and vector2.
 * @throws {Error} If the vectors do not have the same length.
 */
export function cosineSimilarity(vector1: number[], vector2: number[]) {
  if (vector1.length !== vector2.length) {
    throw new Error(
      `Vectors must have the same length (vector1: ${vector1.length} elements, vector2: ${vector2.length} elements)`,
    );
  }

  return (
    dotProduct(vector1, vector2) / (magnitude(vector1) * magnitude(vector2))
  );
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
