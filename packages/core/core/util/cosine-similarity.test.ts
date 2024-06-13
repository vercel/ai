import { cosineSimilarity } from './cosine-similarity';

it('should calculate cosine similarity correctly', () => {
  const vector1 = [1, 2, 3];
  const vector2 = [4, 5, 6];

  const result = cosineSimilarity(vector1, vector2);

  // test against pre-calculated value:
  expect(result).toBeCloseTo(0.9746318461970762, 5);
});

it('should calculate negative cosine similarity correctly', () => {
  const vector1 = [1, 0];
  const vector2 = [-1, 0];

  const result = cosineSimilarity(vector1, vector2);

  // test against pre-calculated value:
  expect(result).toBeCloseTo(-1, 5);
});

it('should throw an error when vectors have different lengths', () => {
  const vector1 = [1, 2, 3];
  const vector2 = [4, 5];

  expect(() => cosineSimilarity(vector1, vector2)).toThrowError();
});
