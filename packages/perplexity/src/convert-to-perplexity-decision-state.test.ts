import {
  InvalidArgumentError,
  UnsupportedFunctionalityError,
  type Experimental_DecisionModelV4State as DecisionModelV4State,
} from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { convertToPerplexityDecisionState } from './convert-to-perplexity-decision-state';

const image = {
  type: 'image_url',
  image_url: { url: 'data:image/png;base64,iVBORw==' },
};

it.each([
  { state: [{ type: 'text', text: 'Review' }], expected: 'Review' },
  {
    state: [{ type: 'json', value: { ticket: 'Review' } }],
    expected: { ticket: 'Review' },
  },
  {
    state: [{ type: 'json', value: ['Review', null, 1] }],
    expected: ['Review', null, 1],
  },
  { state: [{ type: 'json', value: null }], expected: [null] },
  { state: [{ type: 'json', value: false }], expected: [false] },
  { state: [{ type: 'json', value: 1 }], expected: [1] },
  { state: [], expected: [] },
] satisfies { state: DecisionModelV4State; expected: unknown }[])(
  'preserves native state without stringifying JSON: $expected',
  ({ state, expected }) => {
    expect(convertToPerplexityDecisionState(state)).toEqual(expected);
  },
);

it.each(['iVBORw==', new Uint8Array([0x89, 0x50, 0x4e, 0x47])])(
  'preserves order across text, JSON and image parts',
  data => {
    expect(
      convertToPerplexityDecisionState([
        { type: 'text', text: 'Inspect' },
        { type: 'json', value: { product: 'Vase' } },
        { type: 'file', mediaType: 'image/png', data: { type: 'data', data } },
        { type: 'text', text: 'Look for cracks' },
      ]),
    ).toEqual(['Inspect', { product: 'Vase' }, image, 'Look for cracks']);
  },
);

it.each(['image/png', 'image/jpeg', 'image/webp'])(
  'supports %s and image-only state',
  mediaType => {
    expect(
      convertToPerplexityDecisionState([
        { type: 'file', mediaType, data: { type: 'data', data: 'AQID' } },
      ]),
    ).toEqual({
      type: 'image_url',
      image_url: { url: `data:${mediaType};base64,AQID` },
    });
  },
);

it('detects image media types for direct provider calls', () => {
  expect(
    convertToPerplexityDecisionState([
      {
        type: 'file',
        mediaType: 'image/*',
        data: { type: 'data', data: 'iVBORw==' },
      },
    ]),
  ).toEqual(image);
});

it('preserves images nested inside JSON at any depth', () => {
  const value = {
    caption: 'Inspect',
    product: { photos: [image, { detail: image }] },
  };
  expect(convertToPerplexityDecisionState([{ type: 'json', value }])).toEqual(
    value,
  );
});

describe('image limits', () => {
  it('counts native nested images together with SDK file parts', () => {
    const state = [
      {
        type: 'json',
        value: { photos: Array.from({ length: 7 }, () => image) },
      },
      {
        type: 'file',
        mediaType: 'image/png',
        data: { type: 'data', data: 'iVBORw==' },
      },
    ] as const;
    expect(convertToPerplexityDecisionState(state)).toHaveLength(2);
    expect(() =>
      convertToPerplexityDecisionState([
        ...state,
        { type: 'json', value: image },
      ]),
    ).toThrow(InvalidArgumentError);
  });

  it.each([
    'https://example.com/image.png',
    'http://example.com/image.png',
    'data:image/gif;base64,AQID',
    'data:image/png,unencoded',
  ])('rejects unsupported native image URL %s', url => {
    expect(() =>
      convertToPerplexityDecisionState([
        {
          type: 'json',
          value: { photo: { type: 'image_url', image_url: { url } } },
        },
      ]),
    ).toThrow(UnsupportedFunctionalityError);
  });

  it.each(['image/gif', 'application/pdf', 'audio/wav', 'image/*'])(
    'rejects unsupported or unrecognized file type %s',
    mediaType => {
      expect(() =>
        convertToPerplexityDecisionState([
          { type: 'file', mediaType, data: { type: 'data', data: 'AQID' } },
        ]),
      ).toThrow(UnsupportedFunctionalityError);
    },
  );

  it('rejects URLs on direct provider calls instead of asking Perplexity to fetch them', () => {
    expect(() =>
      convertToPerplexityDecisionState([
        {
          type: 'file',
          mediaType: 'image/png',
          data: { type: 'url', url: new URL('https://example.com/image.png') },
        },
      ]),
    ).toThrow(UnsupportedFunctionalityError);
  });
});
