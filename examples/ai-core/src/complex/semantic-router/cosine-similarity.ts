export function cosineSimilarity(a: number[], b: number[]) {
  if (a.length !== b.length) {
    throw new Error(
      `Vectors must have the same length (a: ${a.length}, b: ${b.length})`,
    );
  }

  return dotProduct(a, b) / (magnitude(a) * magnitude(b));
}

function dotProduct(a: number[], b: number[]) {
  return a.reduce(
    (acc: number, val: number, i: number) => acc + val * b[i]!,
    0,
  );
}

function magnitude(a: number[]) {
  return Math.sqrt(dotProduct(a, a));
}
