import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { DefaultGeneratedFile } from './generated-file';

describe('DefaultGeneratedFile', () => {
  it('handles standard Uint8Array data', () => {
    const file = new DefaultGeneratedFile({
      data: new Uint8Array([72, 101, 108, 108, 111]),
      mediaType: 'text/plain',
    });

    expect(file.base64).toBe('SGVsbG8=');
    expect(file.uint8Array).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
  });

  it('handles base64 string data', () => {
    const file = new DefaultGeneratedFile({
      data: 'SGVsbG8=',
      mediaType: 'text/plain',
    });

    expect(file.base64).toBe('SGVsbG8=');
    expect(file.uint8Array).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
  });

  it('handles cross-realm Uint8Array data', () => {
    const realmBytes = vm.runInNewContext(
      'new Uint8Array([72, 101, 108, 108, 111])',
    );
    expect(realmBytes instanceof Uint8Array).toBe(false);

    const file = new DefaultGeneratedFile({
      data: realmBytes as unknown as Uint8Array,
      mediaType: 'text/plain',
    });

    expect(typeof file.base64).toBe('string');
    expect(file.base64).toBe('SGVsbG8=');
    expect(file.uint8Array).toBeInstanceOf(Uint8Array);
    expect(file.uint8Array).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
  });

  it('handles cross-realm ArrayBuffer data', () => {
    const realmBuffer = vm.runInNewContext(
      'new Uint8Array([72, 101, 108, 108, 111]).buffer',
    );
    expect(realmBuffer instanceof ArrayBuffer).toBe(false);

    const file = new DefaultGeneratedFile({
      data: realmBuffer as unknown as Uint8Array,
      mediaType: 'text/plain',
    });

    expect(typeof file.base64).toBe('string');
    expect(file.base64).toBe('SGVsbG8=');
    expect(file.uint8Array).toBeInstanceOf(Uint8Array);
    expect(file.uint8Array).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
  });
});
