import { createChunkDecoder } from './index';

it('should correctly decode streamed utf8 chunks in simple mode', () => {
  const decoder = createChunkDecoder();

  const chunk1 = new Uint8Array([226, 153]);
  const chunk2 = new Uint8Array([165]);
  const values = decoder(chunk1);
  const secondValues = decoder(chunk2);
  if (typeof values !== 'string' || typeof secondValues !== 'string') {
    throw new Error('Expected values to be strings, not objects');
  }

  expect(values + secondValues).toBe('♥');
});
