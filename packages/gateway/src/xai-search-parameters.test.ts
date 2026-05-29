import { describe, expect, it } from 'vitest';
import {
  type XaiSearchParameters,
  xaiSearchParameters,
} from './xai-search-parameters';

describe('xaiSearchParameters', () => {
  it('defaults mode to "on" when no config is passed', () => {
    const result = xaiSearchParameters();
    expect(result).toEqual({ mode: 'on' });
  });

  it('defaults mode to "on" when only other fields are set', () => {
    const result = xaiSearchParameters({ maxSearchResults: 5 });
    expect(result).toEqual({ mode: 'on', maxSearchResults: 5 });
  });

  it('preserves an explicit mode over the default', () => {
    expect(xaiSearchParameters({ mode: 'auto' }).mode).toBe('auto');
    expect(xaiSearchParameters({ mode: 'off' }).mode).toBe('off');
  });

  it('treats explicit mode: undefined the same as omitted', () => {
    const result = xaiSearchParameters({ mode: undefined });
    expect(result.mode).toBe('on');
  });

  it('passes through all optional fields verbatim', () => {
    const result = xaiSearchParameters({
      mode: 'on',
      maxSearchResults: 10,
      returnCitations: false,
      fromDate: '2025-01-01',
      toDate: '2025-12-31',
    });
    expect(result).toEqual({
      mode: 'on',
      maxSearchResults: 10,
      returnCitations: false,
      fromDate: '2025-01-01',
      toDate: '2025-12-31',
    });
  });

  it('passes through the sources discriminated union for all four types', () => {
    const result = xaiSearchParameters({
      mode: 'on',
      sources: [
        {
          type: 'web',
          country: 'US',
          excludedWebsites: ['example.com'],
          allowedWebsites: ['nature.com'],
          safeSearch: true,
        },
        {
          type: 'x',
          excludedXHandles: ['bot'],
          includedXHandles: ['elonmusk'],
          postFavoriteCount: 10,
          postViewCount: 100,
        },
        { type: 'news', country: 'GB', safeSearch: false },
        { type: 'rss', links: ['https://example.com/feed'] },
      ],
    });
    expect(result.sources).toHaveLength(4);
    expect(result.sources?.[0]).toEqual({
      type: 'web',
      country: 'US',
      excludedWebsites: ['example.com'],
      allowedWebsites: ['nature.com'],
      safeSearch: true,
    });
    expect(result.sources?.[3]).toEqual({
      type: 'rss',
      links: ['https://example.com/feed'],
    });
  });

  it('returns a value assignable to XaiSearchParameters', () => {
    // Compile-time check: the return type must satisfy XaiSearchParameters.
    const result: XaiSearchParameters = xaiSearchParameters({
      maxSearchResults: 3,
    });
    expect(result.mode).toBe('on');
  });
});
