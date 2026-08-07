import { describe, expect, it } from 'vitest';
import {
  SideChannelFilter,
  stripJsonFence,
  stripSideChannels,
} from './side-channels';

describe('stripSideChannels', () => {
  it('returns the trimmed text unchanged when there are no tags', () => {
    expect(stripSideChannels('  hello world  ')).toEqual({
      text: 'hello world',
    });
  });

  it('extracts a <think> block and removes it from the text', () => {
    expect(
      stripSideChannels('<think>internal notes</think>The answer is 42.'),
    ).toEqual({
      text: 'The answer is 42.',
      reasoning: 'internal notes',
    });
  });

  it('joins multiple <think> blocks with newlines', () => {
    expect(
      stripSideChannels('<think>first</think>mid<think>second</think>end'),
    ).toEqual({
      text: 'midend',
      reasoning: 'first\nsecond',
    });
  });

  it('extracts a <precontext> array block', () => {
    const result = stripSideChannels(
      '<precontext>[{"name":"web_search","result":{"ok":true}}]</precontext>Weather is sunny.',
    );
    expect(result.text).toBe('Weather is sunny.');
    expect(result.precontext).toEqual([
      { name: 'web_search', result: { ok: true } },
    ]);
  });

  it('wraps a non-array <precontext> payload in an array', () => {
    const result = stripSideChannels(
      '<precontext>{"name":"ocr","result":"text"}</precontext>done',
    );
    expect(result.precontext).toEqual([{ name: 'ocr', result: 'text' }]);
  });

  it('drops a malformed <precontext> block without throwing', () => {
    const result = stripSideChannels('<precontext>not json</precontext>done');
    expect(result.text).toBe('done');
    expect(result.precontext).toBeUndefined();
  });
});

describe('stripJsonFence', () => {
  it('unwraps a ```json fence', () => {
    expect(stripJsonFence('```json\n{"result":"2026"}\n```')).toBe(
      '{"result":"2026"}',
    );
  });

  it('unwraps a bare ``` fence', () => {
    expect(stripJsonFence('```\n{"result":"2026"}\n```')).toBe(
      '{"result":"2026"}',
    );
  });

  it('returns the content unchanged when there is no fence', () => {
    expect(stripJsonFence('{"result":"2026"}')).toBe('{"result":"2026"}');
  });
});

describe('SideChannelFilter', () => {
  it('passes plain text through untouched', () => {
    const filter = new SideChannelFilter();
    expect(filter.feed('hello ') + filter.feed('world')).toBe('hello world');
    expect(filter.flush()).toBe('');
  });

  it('strips a <think> block delivered in a single chunk', () => {
    const filter = new SideChannelFilter();
    const visible = filter.feed('<think>hidden</think>visible');
    expect(visible).toBe('visible');
    expect(filter.flush()).toBe('');
  });

  it('strips a <think> block whose open tag is split across chunks', () => {
    const filter = new SideChannelFilter();
    let visible = '';
    visible += filter.feed('<thi');
    visible += filter.feed('nk>hidden reasoning</thi');
    visible += filter.feed('nk>It is ');
    visible += filter.feed('sunny.');
    expect(visible).toBe('It is sunny.');
    expect(filter.flush()).toBe('');
  });

  it('discards an unterminated tag on flush', () => {
    const filter = new SideChannelFilter();
    const visible = filter.feed('before<think>never closes');
    expect(visible).toBe('before');
    expect(filter.flush()).toBe('');
  });

  it('releases a held-back "<" that turns out not to start a tag', () => {
    const filter = new SideChannelFilter();
    let visible = '';
    visible += filter.feed('1 < 2');
    visible += filter.flush();
    expect(visible).toBe('1 < 2');
  });

  it('releases buffered plain text on flush', () => {
    const filter = new SideChannelFilter();
    const visible = filter.feed('trailing text');
    expect(visible).toBe('trailing text');
    expect(filter.flush()).toBe('');
  });
});
