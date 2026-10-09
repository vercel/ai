import { expectTypeOf } from 'vitest';
import type {
  HarnessV1NetworkSandboxSession,
  HarnessV1SandboxTemplate,
} from '@ai-sdk/harness';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import type { SpritesNetworkSandboxSession } from './sprites-network-sandbox-session';
import type { SpritesSandboxSession } from './sprites-sandbox-session';
import type {
  SpritesNativeSandboxSession,
  SpritesNetworkSandboxSessionCreateOptions,
  SpritesNetworkSandboxSessionResumeOptions,
  createSpritesNetworkSandboxSession,
  createSpritesNetworkSandboxSessionFromNativeSandbox,
  createSpritesSandboxSessionFromNativeSandbox,
  resumeSpritesNetworkSandboxSession,
} from './sprites-sandbox';

type Options = SpritesNetworkSandboxSessionCreateOptions;

expectTypeOf<{}>().toExtend<Options>();
expectTypeOf<{
  apiKey: string;
  baseUrl: string;
  workingDirectory: string;
  urlAuth: 'public';
  waitForCapacity: boolean;
  sandboxId: string;
  template: HarnessV1SandboxTemplate;
  abortSignal: AbortSignal;
}>().toExtend<Options>();
expectTypeOf<{ urlAuth: 'sprite' }>().toExtend<Options>();
expectTypeOf<{ urlAuth: 'private' }>().not.toExtend<Options>();
// The Sprite is named with `sandboxId`.
expectTypeOf<{ name: string }>().not.toExtend<Options>();
// An existing Sprite is reattached with the resume function.
expectTypeOf<{ spriteName: string }>().not.toExtend<Options>();
// An existing Sprite is adapted with the native sandbox functions.
expectTypeOf<{
  sandbox: SpritesNativeSandboxSession;
}>().not.toExtend<Options>();

type ResumeOptions = SpritesNetworkSandboxSessionResumeOptions;

expectTypeOf<{ sandboxId: string }>().toExtend<ResumeOptions>();
expectTypeOf<{
  sandboxId: string;
  apiKey: string;
  baseUrl: string;
  workingDirectory: string;
  urlAuth: 'public';
  abortSignal: AbortSignal;
}>().toExtend<ResumeOptions>();
expectTypeOf<{}>().not.toExtend<ResumeOptions>();
expectTypeOf<{
  sandboxId: string;
  name: string;
}>().not.toExtend<ResumeOptions>();
expectTypeOf<{
  sandboxId: string;
  spriteName: string;
}>().not.toExtend<ResumeOptions>();
expectTypeOf<ResumeOptions>().not.toHaveProperty('template');
expectTypeOf<ResumeOptions>().not.toHaveProperty('waitForCapacity');

expectTypeOf<typeof createSpritesNetworkSandboxSession>().returns.toEqualTypeOf<
  Promise<HarnessV1NetworkSandboxSession>
>();
expectTypeOf<typeof resumeSpritesNetworkSandboxSession>().returns.toEqualTypeOf<
  Promise<HarnessV1NetworkSandboxSession>
>();

expectTypeOf<{
  sprite: { name: string; url: string };
  workingDirectory: string;
}>().toExtend<SpritesNativeSandboxSession>();
expectTypeOf<{
  apiKey: string;
  baseUrl: string;
  sprite: { name: string; url: string; urlAuth: 'public' };
  workingDirectory: string;
}>().toExtend<SpritesNativeSandboxSession>();
expectTypeOf<{
  sprite: { name: string; url: string };
}>().not.toExtend<SpritesNativeSandboxSession>();
expectTypeOf<{
  sprite: { name: string };
  workingDirectory: string;
}>().not.toExtend<SpritesNativeSandboxSession>();

expectTypeOf<
  typeof createSpritesSandboxSessionFromNativeSandbox
>().returns.toEqualTypeOf<SandboxSession>();
expectTypeOf<
  typeof createSpritesNetworkSandboxSessionFromNativeSandbox
>().returns.toEqualTypeOf<HarnessV1NetworkSandboxSession>();

// Structural conformance to the session contracts.
expectTypeOf<SpritesNetworkSandboxSession>().toExtend<HarnessV1NetworkSandboxSession>();
expectTypeOf<SpritesSandboxSession>().toExtend<SandboxSession>();
expectTypeOf<
  SpritesNetworkSandboxSession['restricted']
>().returns.toEqualTypeOf<SandboxSession>();
