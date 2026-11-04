import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import { expectTypeOf, test } from 'vitest';
import type {
  HarnessV1NetworkPolicy,
  HarnessV1NetworkSandboxSession,
  HarnessV1PortEndpoint,
  HarnessV1RequestTransformation,
} from './harness-v1-network-sandbox-session';

test('network sandbox session extends the bare sandbox session surface', () => {
  expectTypeOf<HarnessV1NetworkSandboxSession>().toMatchTypeOf<SandboxSession>();
  expectTypeOf<HarnessV1NetworkSandboxSession['run']>().toEqualTypeOf<
    SandboxSession['run']
  >();
  expectTypeOf<HarnessV1NetworkSandboxSession['spawn']>().toEqualTypeOf<
    SandboxSession['spawn']
  >();
});

test('restricted() returns the bare sandbox session surface', () => {
  expectTypeOf<
    ReturnType<HarnessV1NetworkSandboxSession['restricted']>
  >().toEqualTypeOf<SandboxSession>();
});

test('network sandbox session exposes port resolution and lifecycle as required', () => {
  expectTypeOf<HarnessV1NetworkSandboxSession['ports']>().toEqualTypeOf<
    ReadonlyArray<number>
  >();
  expectTypeOf<
    HarnessV1NetworkSandboxSession['getPortEndpoint']
  >().not.toBeUndefined();
  expectTypeOf<
    Awaited<ReturnType<HarnessV1NetworkSandboxSession['getPortEndpoint']>>
  >().toEqualTypeOf<HarnessV1PortEndpoint>();
  expectTypeOf<
    HarnessV1NetworkSandboxSession['getPortUrl']
  >().not.toBeUndefined();
  expectTypeOf<HarnessV1NetworkSandboxSession['stop']>().not.toBeUndefined();
  expectTypeOf<HarnessV1NetworkSandboxSession['destroy']>().not.toBeUndefined();
});

test('setNetworkPolicy is optional on the network sandbox session', () => {
  const _session = {} as HarnessV1NetworkSandboxSession;
  expectTypeOf(_session.setNetworkPolicy).toEqualTypeOf<
    HarnessV1NetworkSandboxSession['setNetworkPolicy']
  >();
});

test('setRequestTransformations is optional on the network sandbox session', () => {
  const _session = {} as HarnessV1NetworkSandboxSession;
  expectTypeOf(_session.setRequestTransformations).toEqualTypeOf<
    HarnessV1NetworkSandboxSession['setRequestTransformations']
  >();
});

test('addRequestTransformations is optional on the network sandbox session', () => {
  const _session = {} as HarnessV1NetworkSandboxSession;
  expectTypeOf(_session.addRequestTransformations).toEqualTypeOf<
    HarnessV1NetworkSandboxSession['addRequestTransformations']
  >();
});

test('request transformation includes the host in its match', () => {
  const _transformation: HarnessV1RequestTransformation = {
    match: {
      host: 'api.example.com',
      method: ['POST'],
      path: { startsWith: '/v1/' },
      headers: [
        {
          key: { exact: 'authorization' },
          value: { regex: '^Bearer ' },
        },
      ],
      queryString: [{ key: { exact: 'version' }, value: { exact: '1' } }],
    },
    transform: { headers: { authorization: 'Bearer host-only-credential' } },
  };
  void _transformation;
});

test('network policy: allow-all and deny-all are valid', () => {
  const _a: HarnessV1NetworkPolicy = { mode: 'allow-all' };
  const _d: HarnessV1NetworkPolicy = { mode: 'deny-all' };
  void _a;
  void _d;
});

test('network policy: custom with allowedHosts is valid', () => {
  const _p: HarnessV1NetworkPolicy = {
    mode: 'custom',
    allowedHosts: ['*.npmjs.org'],
  };
  void _p;
});

test('network policy: custom with allowedCIDRs is valid', () => {
  const _p: HarnessV1NetworkPolicy = {
    mode: 'custom',
    allowedCIDRs: ['10.0.0.0/8'],
  };
  void _p;
});

test('network policy: custom with both allow + deniedCIDRs is valid', () => {
  const _p: HarnessV1NetworkPolicy = {
    mode: 'custom',
    allowedCIDRs: ['10.0.0.0/8'],
    deniedCIDRs: ['10.5.0.0/16', '169.254.169.254/32'],
  };
  void _p;
});

test('network policy: custom with only deniedCIDRs is a type error', () => {
  // @ts-expect-error — neither allowedHosts nor allowedCIDRs provided
  const _p: HarnessV1NetworkPolicy = {
    mode: 'custom',
    deniedCIDRs: ['169.254.169.254/32'],
  };
  void _p;
});
