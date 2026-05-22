import type { Experimental_Sandbox } from '@ai-sdk/provider-utils';
import { expectTypeOf, test } from 'vitest';
import type { HarnessV1SandboxProvider } from './harness-v1-sandbox';
import type {
  HarnessV1NetworkPolicy,
  HarnessV1SandboxHandle,
} from './harness-v1-sandbox-handle';
import type { HarnessV1SandboxSession } from './harness-v1-sandbox-session';

test('HarnessV1SandboxSession is an alias for Experimental_Sandbox', () => {
  expectTypeOf<HarnessV1SandboxSession>().toEqualTypeOf<Experimental_Sandbox>();
});

test('HarnessV1SandboxProvider has create returning a handle', () => {
  type CreateReturn = ReturnType<HarnessV1SandboxProvider['create']>;
  expectTypeOf<Awaited<CreateReturn>>().toEqualTypeOf<HarnessV1SandboxHandle>();
});

test('handle exposes session, ports, getPortUrl, stop as required', () => {
  expectTypeOf<
    HarnessV1SandboxHandle['session']
  >().toEqualTypeOf<HarnessV1SandboxSession>();
  expectTypeOf<HarnessV1SandboxHandle['ports']>().toEqualTypeOf<
    ReadonlyArray<number>
  >();
  expectTypeOf<HarnessV1SandboxHandle['getPortUrl']>().not.toBeUndefined();
  expectTypeOf<HarnessV1SandboxHandle['stop']>().not.toBeUndefined();
});

test('setNetworkPolicy is optional on the handle', () => {
  const _handle = {} as HarnessV1SandboxHandle;
  // optional — may be undefined
  expectTypeOf(_handle.setNetworkPolicy).toEqualTypeOf<
    HarnessV1SandboxHandle['setNetworkPolicy']
  >();
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
