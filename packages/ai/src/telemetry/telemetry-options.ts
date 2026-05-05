import type { Arrayable, Context } from '@ai-sdk/provider-utils';
import type { Telemetry } from './telemetry';

/**
 * Telemetry configuration.
 */
export type TelemetryOptions<RUNTIME_CONTEXT extends Context = Context> = {
  /**
   * Enable or disable telemetry. Enabled by default when a telemetry
   * integration is registered. Set to `false` to opt out.
   */
  isEnabled?: boolean;

  /**
   * Enable or disable input recording. Enabled by default.
   *
   * You might want to disable input recording to avoid recording sensitive
   * information, to reduce data transfers, or to increase performance.
   */
  recordInputs?: boolean;

  /**
   * Enable or disable output recording. Enabled by default.
   *
   * You might want to disable output recording to avoid recording sensitive
   * information, to reduce data transfers, or to increase performance.
   */
  recordOutputs?: boolean;

  /**
   * Identifier for this function. Used to group telemetry data by function.
   */
  functionId?: string;

  /**
   * Top-level runtime context properties that should be included in telemetry.
   * Runtime context properties are excluded unless they are explicitly set to `true`.
   */
  includeRuntimeContext?:
    | { [KEY in keyof NoInfer<RUNTIME_CONTEXT>]?: boolean }
    | undefined;

  /**
   * Per-call telemetry integrations that receive lifecycle events during generation.
   *
   * When provided, these integrations will take precedence over the globally registered
   * integrations for this call.
   */
  integrations?: Arrayable<Telemetry>;
};
