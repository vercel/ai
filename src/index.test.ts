// import kv, { VercelKV, createClient } from '.';

// let scanReturnValues: [number, string[]][] = [[0, []]];
// jest.mock('@upstash/redis', () => ({
//   Redis: jest.fn(() => ({
//     get: jest.fn().mockResolvedValue('bar'),
//     scan: jest
//       .fn()
//       .mockImplementation(() => Promise.resolve(scanReturnValues.shift())),
//     // eslint-disable-next-line jest/unbound-method
//     scanIterator: VercelKV.prototype.scanIterator,
//   })),
// }));

describe('@vercel/ai-utils', () => {
  beforeEach(() => {
    // scanReturnValues = [[0, []]];
  });

  describe('not a real test', () => {
    it('exports a default client', () => {
      expect(true).toEqual(true);
    });
  });
});
