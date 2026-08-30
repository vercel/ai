import { describe, expect, it } from 'vitest';
import { setOwn } from './set-own';

describe('setOwn', () => {
  it('sets a normal key as an own, enumerable, writable property', () => {
    const obj: Record<string, unknown> = {};
    setOwn(obj, 'a', 1);
    expect(obj.a).toBe(1);
    expect(Object.keys(obj)).toEqual(['a']);
    obj.a = 2;
    expect(obj.a).toBe(2);
  });

  it('does not mutate the object prototype when the key is __proto__', () => {
    const obj: Record<string, unknown> = {};
    setOwn(obj, '__proto__', { polluted: true });

    // The prototype of `obj` itself must be untouched...
    expect(Object.getPrototypeOf(obj)).toBe(Object.prototype);
    // ...and the global Object.prototype must be untouched.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();

    // The value is instead stored as an ordinary own property.
    expect(Object.hasOwn(obj, '__proto__')).toBe(true);
    expect(Object.getOwnPropertyDescriptor(obj, '__proto__')?.value).toEqual({
      polluted: true,
    });
  });

  it('does not go through other inherited Object.prototype setters/keys', () => {
    const obj: Record<string, unknown> = {};
    for (const key of [
      'constructor',
      'toString',
      'valueOf',
      'hasOwnProperty',
    ]) {
      setOwn(obj, key, 'overridden');
      expect(Object.hasOwn(obj, key)).toBe(true);
      expect(obj[key]).toBe('overridden');
    }
    expect(Object.getPrototypeOf(obj)).toBe(Object.prototype);
  });

  it('overwrites an existing own property', () => {
    const obj: Record<string, unknown> = { a: 1 };
    setOwn(obj, 'a', 2);
    expect(obj.a).toBe(2);
  });
});
