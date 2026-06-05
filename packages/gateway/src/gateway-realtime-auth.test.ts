import { describe, expect, it } from 'vitest';
import {
  GATEWAY_AUTH_SUBPROTOCOL_PREFIX,
  GATEWAY_REALTIME_SUBPROTOCOL,
  getGatewayRealtimeAuthToken,
  getGatewayRealtimeProtocols,
} from './gateway-realtime-auth';

describe('getGatewayRealtimeProtocols', () => {
  it('offers the marker subprotocol and the prefixed auth token', () => {
    expect(getGatewayRealtimeProtocols('vck_test-token')).toEqual([
      GATEWAY_REALTIME_SUBPROTOCOL,
      `${GATEWAY_AUTH_SUBPROTOCOL_PREFIX}vck_test-token`,
    ]);
  });
});

describe('getGatewayRealtimeAuthToken', () => {
  it('round-trips a token produced by getGatewayRealtimeProtocols', () => {
    // The server receives the offered subprotocols as a comma-joined header.
    const header = getGatewayRealtimeProtocols('vck_test-token').join(', ');
    expect(getGatewayRealtimeAuthToken(header)).toBe('vck_test-token');
  });

  it('tolerates arbitrary whitespace and subprotocol ordering', () => {
    const header = `  ${GATEWAY_AUTH_SUBPROTOCOL_PREFIX}oidc-token  ,  ${GATEWAY_REALTIME_SUBPROTOCOL}  `;
    expect(getGatewayRealtimeAuthToken(header)).toBe('oidc-token');
  });

  it('returns undefined when no auth subprotocol is present', () => {
    expect(
      getGatewayRealtimeAuthToken(GATEWAY_REALTIME_SUBPROTOCOL),
    ).toBeUndefined();
  });

  it('returns undefined for an empty/whitespace token', () => {
    expect(
      getGatewayRealtimeAuthToken(`${GATEWAY_AUTH_SUBPROTOCOL_PREFIX}   `),
    ).toBeUndefined();
  });

  it('returns undefined for missing header values', () => {
    expect(getGatewayRealtimeAuthToken(undefined)).toBeUndefined();
    expect(getGatewayRealtimeAuthToken(null)).toBeUndefined();
    expect(getGatewayRealtimeAuthToken('')).toBeUndefined();
  });

  it('preserves tokens that contain dots (e.g. JWT/OIDC)', () => {
    const jwt = 'header.payload.signature';
    const header = getGatewayRealtimeProtocols(jwt).join(',');
    expect(getGatewayRealtimeAuthToken(header)).toBe(jwt);
  });
});
