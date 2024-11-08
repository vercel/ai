import { InvalidArgumentError } from '@ai-sdk/provider';
import { expect, it } from 'vitest';
import { createIdGenerator, generateId } from './generate-id';

it('should generate an ID with the correct length', () => {
  expect(generateId(10)).toHaveLength(10);
});

it('should generate an ID with the correct default length', () => {
  expect(generateId()).toHaveLength(16);
});

it('should generate unique IDs', () => {
  const id1 = generateId();
  const id2 = generateId();

  expect(id1).not.toBe(id2);
});

it('should throw an error if the separator is part of the alphabet', () => {
  expect(() => createIdGenerator({ separator: 'a', prefix: 'b' })).toThrow(
    InvalidArgumentError,
  );
});
