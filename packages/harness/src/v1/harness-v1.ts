import type { FlexibleSchema } from '@ai-sdk/provider-utils';
import type { HarnessV1BuiltinToolDescriptor } from './harness-v1-builtin-tool';
import type { HarnessV1StartOptions } from './harness-v1-call-options';
import type { HarnessV1Session } from './harness-v1-session';

/**
 * Versioned specification for a harness adapter — the integration point for
 * one third-party coding-agent runtime (Claude Code, Codex, …).
 *
 * Modelled after `LanguageModelV4`: a tagged spec version, a small set of
 * descriptive fields, and one entry-point method (`doStart`) that yields a
 * session. There is intentionally no static "capabilities" object —
 * optional features are signalled by the presence or absence of optional
 * methods on the session and prompt-control handle. Adapters that cannot
 * satisfy a request (no sandbox provided, detach not supported, …) throw
 * `HarnessCapabilityUnsupportedError` from the method that needs the
 * capability.
 */
export type HarnessV1 = {
  /**
   * Spec version this adapter implements. Always the literal `'harness-v1'`.
   */
  readonly specificationVersion: 'harness-v1';

  /**
   * Stable identifier for this harness, used as the key inside
   * `HarnessV1Metadata` / `HarnessV1Options` objects. Conventionally a
   * kebab-case slug matching the package name (`'claude-code'`, `'codex'`).
   */
  readonly harnessId: string;

  /**
   * Descriptors for tools that the adapter's underlying runtime exposes
   * natively. Pure introspection — see `HarnessV1BuiltinToolDescriptor`.
   */
  readonly builtinTools: ReadonlyArray<HarnessV1BuiltinToolDescriptor>;

  /**
   * Optional schema for the payload returned by
   * `HarnessV1Session.doDetach`. When present, the adapter promises that
   * exported state validated by this schema can be re-imported in a future
   * `doStart({ resumeFrom })` call. Hosts use this to persist and re-hydrate
   * resume payloads safely.
   */
  readonly resumeStateSchema?: FlexibleSchema<unknown>;

  /**
   * Start a fresh session (or reattach via `resumeFrom`). The host then
   * issues prompts against the returned session, ending with `doStop` or
   * `doDetach`.
   */
  doStart(options: HarnessV1StartOptions): PromiseLike<HarnessV1Session>;
};
