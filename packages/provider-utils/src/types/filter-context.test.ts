import { describe, expect, it } from 'vitest';
import { filterContext } from './filter-context';

describe('filterContext', () => {
  it('filters out context properties marked as sensitive', () => {
    expect(
      filterContext({
        context: {
          userId: 'user-123',
          requestId: 'request-123',
          count: 0,
          enabled: false,
          metadata: {
            secret: 'secret',
          },
        },
        sensitiveContext: {
          userId: true,
          requestId: false,
        },
      }),
    ).toEqual({
      requestId: 'request-123',
      count: 0,
      enabled: false,
      metadata: {
        secret: 'secret',
      },
    });
  });

  it('does not filter context when sensitive context is undefined', () => {
    const context = {
      userId: 'user-123',
      requestId: 'request-123',
    };

    expect(
      filterContext({
        context,
        sensitiveContext: undefined,
      }),
    ).toBe(context);
  });
});
