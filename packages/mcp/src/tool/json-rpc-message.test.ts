import { describe, expect, it } from 'vitest';
import {
  JSONRPCErrorSchema,
  JSONRPCMessageSchema,
  JSONRPCNotificationSchema,
  JSONRPCRequestSchema,
  JSONRPCResponseSchema,
} from '../index';

describe('JSON-RPC schema exports', () => {
  it('exports schemas for validating JSON-RPC messages', () => {
    const request = {
      jsonrpc: '2.0',
      id: '1',
      method: 'tools/list',
      params: {},
    };
    const notification = {
      jsonrpc: '2.0',
      method: 'notifications/progress',
    };
    const response = { jsonrpc: '2.0', id: '1', result: {} };
    const error = {
      jsonrpc: '2.0',
      id: '1',
      error: { code: -32600, message: 'Invalid Request' },
    };

    expect(JSONRPCRequestSchema.parse(request)).toEqual(request);
    expect(JSONRPCNotificationSchema.parse(notification)).toEqual(notification);
    expect(JSONRPCResponseSchema.parse(response)).toEqual(response);
    expect(JSONRPCErrorSchema.parse(error)).toEqual(error);

    expect(JSONRPCMessageSchema.parse(request)).toEqual(request);
    expect(JSONRPCMessageSchema.parse(notification)).toEqual(notification);
    expect(JSONRPCMessageSchema.parse(response)).toEqual(response);
    expect(JSONRPCMessageSchema.parse(error)).toEqual(error);
  });
});
