import { InvalidArgumentError } from '@ai-sdk/provider';
import { convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import { prepareQuiverAIImageReference } from './prepare-quiverai-image-reference';

const encoder = new TextEncoder();
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>';
const svgBytes = encoder.encode(svg);
const svgBase64 = convertUint8ArrayToBase64(svgBytes);

describe('prepareQuiverAIImageReference', () => {
  it('prepares URL references', () => {
    expect(
      prepareQuiverAIImageReference(
        new URL('https://example.com/reference.svg'),
      ),
    ).toEqual({ url: 'https://example.com/reference.svg' });
    expect(
      prepareQuiverAIImageReference('http://example.com/reference.png'),
    ).toEqual({ url: 'http://example.com/reference.png' });
  });

  it('prepares binary references', () => {
    expect(prepareQuiverAIImageReference(svgBytes)).toEqual({
      base64: svgBase64,
    });
    expect(prepareQuiverAIImageReference(svgBytes.buffer)).toEqual({
      base64: svgBase64,
    });
  });

  it('prepares base64 and data URL references', () => {
    expect(prepareQuiverAIImageReference(svgBase64)).toEqual({
      base64: svgBase64,
    });
    expect(
      prepareQuiverAIImageReference(`data:image/svg+xml;base64,${svgBase64}`),
    ).toEqual({ base64: svgBase64 });
  });

  it.each([
    'ftp://example.com/reference.png',
    'not base64!',
    'data:image/bmp;base64,Qk0=',
  ])('rejects invalid string reference input: %s', input => {
    expect(() => prepareQuiverAIImageReference(input)).toThrow(
      InvalidArgumentError,
    );
  });

  it('rejects unsupported binary reference input', () => {
    expect(() =>
      prepareQuiverAIImageReference(new Uint8Array([1, 2, 3])),
    ).toThrow(InvalidArgumentError);
  });
});
