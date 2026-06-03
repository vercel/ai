import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveHttpHandler } from './proxy-handler';

describe('resolveHttpHandler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('routes to the supplied handler and never touches the network', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('live'));
    const handler = vi.fn(async () => new Response('from-handler'));

    const resolved = resolveHttpHandler(handler);
    const res = await resolved(new Request('https://api.example.com/v1'));

    expect(await res.text()).toBe('from-handler');
    expect(handler).toHaveBeenCalledOnce();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('falls through to fetch when no handler is supplied', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('live'));

    const resolved = resolveHttpHandler(undefined);
    const res = await resolved(new Request('https://api.example.com/v1'));

    expect(await res.text()).toBe('live');
    expect(fetchSpy).toHaveBeenCalledOnce();
  });
});
