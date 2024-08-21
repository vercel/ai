import { dataContentSchema } from './data-content';

describe('dataContentSchema', () => {
  it('should validate a Buffer', () => {
    const buffer = Buffer.from('Hello, world!');
    const result = dataContentSchema.parse(buffer);
    expect(result).toEqual(buffer);
  });

  it('should reject a non-matching object', () => {
    const nonMatchingObject = { foo: 'bar' };
    expect(() => dataContentSchema.parse(nonMatchingObject)).toThrow();
  });
});
