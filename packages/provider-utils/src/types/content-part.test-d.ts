import { describe, expectTypeOf, it } from 'vitest';
import { DataContent } from './data-content';
import { FilePart, ReasoningFilePart } from './content-part';
import { ProviderReference } from './provider-reference';

type TaggedFileData = Extract<FilePart['data'], { type: string }>;
type TaggedReasoningFileData = Extract<
  ReasoningFilePart['data'],
  { type: string }
>;

describe('FilePart.data', () => {
  it('narrows exhaustively across the 4 tagged arms', () => {
    const data = null as unknown as TaggedFileData;

    switch (data.type) {
      case 'data': {
        expectTypeOf(data.data).toEqualTypeOf<DataContent>();
        break;
      }
      case 'url': {
        expectTypeOf(data.url).toEqualTypeOf<URL>();
        break;
      }
      case 'reference': {
        expectTypeOf(data.reference).toEqualTypeOf<ProviderReference>();
        break;
      }
      case 'text': {
        expectTypeOf(data.text).toEqualTypeOf<string>();
        break;
      }
      default: {
        const _exhaustive: never = data;
        return _exhaustive;
      }
    }
  });

  it('exposes exactly 4 tagged `type` discriminants', () => {
    expectTypeOf<TaggedFileData['type']>().toEqualTypeOf<
      'data' | 'url' | 'reference' | 'text'
    >();
  });

  it('accepts the tagged `data` arm', () => {
    expectTypeOf<{
      type: 'file';
      data: { type: 'data'; data: Uint8Array };
      mediaType: string;
    }>().toMatchTypeOf<FilePart>();
  });

  it('accepts the tagged `url` arm', () => {
    expectTypeOf<{
      type: 'file';
      data: { type: 'url'; url: URL };
      mediaType: string;
    }>().toMatchTypeOf<FilePart>();
  });

  it('accepts the tagged `reference` arm', () => {
    expectTypeOf<{
      type: 'file';
      data: { type: 'reference'; reference: ProviderReference };
      mediaType: string;
    }>().toMatchTypeOf<FilePart>();
  });

  it('accepts the tagged `text` arm', () => {
    expectTypeOf<{
      type: 'file';
      data: { type: 'text'; text: string };
      mediaType: string;
    }>().toMatchTypeOf<FilePart>();
  });

  it('also accepts bare DataContent, URL, and ProviderReference shorthands', () => {
    expectTypeOf<{
      type: 'file';
      data: Uint8Array;
      mediaType: string;
    }>().toMatchTypeOf<FilePart>();

    expectTypeOf<{
      type: 'file';
      data: string;
      mediaType: string;
    }>().toMatchTypeOf<FilePart>();

    expectTypeOf<{
      type: 'file';
      data: URL;
      mediaType: string;
    }>().toMatchTypeOf<FilePart>();

    expectTypeOf<{
      type: 'file';
      data: ProviderReference;
      mediaType: string;
    }>().toMatchTypeOf<FilePart>();
  });
});

describe('ReasoningFilePart.data', () => {
  it('narrows exhaustively across the 2 tagged arms', () => {
    const data = null as unknown as TaggedReasoningFileData;

    switch (data.type) {
      case 'data': {
        expectTypeOf(data.data).toEqualTypeOf<DataContent>();
        break;
      }
      case 'url': {
        expectTypeOf(data.url).toEqualTypeOf<URL>();
        break;
      }
      default: {
        const _exhaustive: never = data;
        return _exhaustive;
      }
    }
  });

  it('exposes exactly 2 tagged `type` discriminants', () => {
    expectTypeOf<TaggedReasoningFileData['type']>().toEqualTypeOf<
      'data' | 'url'
    >();
  });

  it('accepts the tagged `data` arm', () => {
    expectTypeOf<{
      type: 'reasoning-file';
      data: { type: 'data'; data: Uint8Array };
      mediaType: string;
    }>().toMatchTypeOf<ReasoningFilePart>();
  });

  it('accepts the tagged `url` arm', () => {
    expectTypeOf<{
      type: 'reasoning-file';
      data: { type: 'url'; url: URL };
      mediaType: string;
    }>().toMatchTypeOf<ReasoningFilePart>();
  });

  it('also accepts bare DataContent and URL shorthands', () => {
    expectTypeOf<{
      type: 'reasoning-file';
      data: Uint8Array;
      mediaType: string;
    }>().toMatchTypeOf<ReasoningFilePart>();

    expectTypeOf<{
      type: 'reasoning-file';
      data: URL;
      mediaType: string;
    }>().toMatchTypeOf<ReasoningFilePart>();
  });
});

describe('ProviderReference (top-level)', () => {
  it('accepts plain provider-id records', () => {
    expectTypeOf<{ openai: 'file-abc' }>().toMatchTypeOf<ProviderReference>();
    expectTypeOf<{ fileId: 'abc' }>().toMatchTypeOf<ProviderReference>();
  });

  it('rejects records that carry a `type` key', () => {
    expectTypeOf<{
      type: 'x';
      openai: 'file-abc';
    }>().not.toMatchTypeOf<ProviderReference>();
  });
});
