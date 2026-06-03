import { describe, expect, it } from 'vitest';
import { type HttpRequest, fromResponse, toRequest } from './proxy-protocol';

describe('proxy-protocol body codec', () => {
  it('toRequest decodes a base64 body and rebuilds headers', async () => {
    const msg: HttpRequest = {
      type: 'http-request',
      requestId: 'r1',
      sessionId: 's1',
      method: 'POST',
      url: 'https://api.example.com/v1/messages',
      headers: { 'content-type': ['application/json'], 'x-multi': ['a', 'b'] },
      body: Buffer.from('{"hello":"world"}').toString('base64'),
    };

    const request = toRequest(msg);
    expect(request.method).toBe('POST');
    expect(request.headers.get('content-type')).toBe('application/json');
    expect(request.headers.get('x-multi')).toBe('a, b');
    expect(await request.text()).toBe('{"hello":"world"}');
  });

  it('toRequest drops the body for GET/HEAD', () => {
    const msg: HttpRequest = {
      type: 'http-request',
      requestId: 'r2',
      sessionId: 's1',
      method: 'GET',
      url: 'https://api.example.com/v1/models',
      headers: {},
      body: Buffer.from('ignored').toString('base64'),
    };
    expect(toRequest(msg).body).toBeNull();
  });

  it('fromResponse round-trips status, headers, and base64 body', async () => {
    const response = new Response('pong', {
      status: 201,
      headers: { 'content-type': 'text/plain' },
    });

    const msg = await fromResponse('r3', response);
    expect(msg.type).toBe('http-response');
    expect(msg.requestId).toBe('r3');
    expect(msg.status).toBe(201);
    expect(msg.headers?.['content-type']).toEqual(['text/plain']);
    expect(Buffer.from(msg.body ?? '', 'base64').toString('utf8')).toBe('pong');
  });

  it('fromResponse omits the body when empty', async () => {
    const msg = await fromResponse('r4', new Response(null, { status: 204 }));
    expect(msg.status).toBe(204);
    expect(msg.body).toBeUndefined();
  });
});
