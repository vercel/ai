import type {
  HarnessV1PromptControl,
  HarnessV1PromptOptions,
} from './harness-v1-call-options';
import type { HarnessV1ResumeState } from './harness-v1-resume-state';

/**
 * Active harness session, returned by `HarnessV1.doStart`.
 *
 * A session is the unit of state continuity across multiple prompts (one
 * sandbox, one conversation history, one running agent runtime). The host
 * holds onto the session across `doPrompt` calls and releases it via
 * `doStop` (or hands it off via `doDetach`, when supported).
 */
export type HarnessV1Session = {
  /**
   * Stable identifier for this session. Same value the host passed in via
   * `HarnessV1StartOptions.sessionId`.
   */
  readonly sessionId: string;

  /**
   * Run one prompt turn. Returns a control handle the host uses to feed
   * tool results, approvals, and user messages back into the turn while it
   * is in flight. The handle's `done` promise resolves when the turn ends.
   */
  doPrompt(
    options: HarnessV1PromptOptions,
  ): PromiseLike<HarnessV1PromptControl>;

  /**
   * Tear down the session. Idempotent. After `doStop`, no further methods
   * on the session may be called.
   */
  doStop(): PromiseLike<void>;

  /**
   * Detach from the underlying runtime without tearing it down, returning a
   * payload the host can later pass to `HarnessV1.doStart({ resumeFrom })`
   * to reconnect. Optional — adapters that cannot survive a host hand-off
   * omit this method, in which case `HarnessAgent.detach()` throws
   * `HarnessCapabilityUnsupportedError`.
   */
  doDetach?(): PromiseLike<HarnessV1ResumeState>;
};
