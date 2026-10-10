import { InvalidArgumentError } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { createIdGenerator, generateId } from './generate-id';

describe('createIdGenerator', () => {
  it('should generate an ID with the correct length', () => {
    const idGenerator = createIdGenerator({ size: 10 });
    expect(idGenerator()).toHaveLength(10);
  });

  it('should generate an ID with the correct default length', () => {
    const idGenerator = createIdGenerator();
    expect(idGenerator()).toHaveLength(16);
  });

  it('should throw an error if the separator is part of the alphabet', () => {
    expect(() => createIdGenerator({ separator: 'a', prefix: 'b' })).toThrow(
      InvalidArgumentError,
    );
  });

  it('should reject an empty alphabet at construction', () => {
    expect(() => createIdGenerator({ alphabet: '' })).toThrow(
      expect.objectContaining({
        name: 'AI_InvalidArgumentError',
        argument: 'alphabet',
        message: 'alphabet must be a non-empty string.',
      }),
    );
  });

  it.each([
    { label: 'zero', size: 0 },
    { label: 'negative', size: -1 },
    { label: 'fractional', size: 1.5 },
    { label: 'NaN', size: Number.NaN },
    { label: 'positive infinity', size: Number.POSITIVE_INFINITY },
    { label: 'negative infinity', size: Number.NEGATIVE_INFINITY },
    { label: 'unsafe integer', size: Number.MAX_SAFE_INTEGER + 1 },
  ])('should reject a $label size at construction', ({ size }) => {
    expect(() => createIdGenerator({ size })).toThrow(
      expect.objectContaining({
        name: 'AI_InvalidArgumentError',
        argument: 'size',
        message: 'size must be a positive safe integer.',
      }),
    );
  });

  it('should generate prefixed IDs with valid settings', () => {
    const idGenerator = createIdGenerator({
      prefix: 'msg',
      separator: '_',
      size: 8,
    });

    expect(idGenerator()).toMatch(/^msg_[\dA-Za-z]{8}$/);
  });
});

describe('generateId', () => {
  it('should generate unique IDs', () => {
    const id1 = generateId();
    const id2 = generateId();

    expect(id1).not.toBe(id2);
  });
});
