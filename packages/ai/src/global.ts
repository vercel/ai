import type { ProviderV2, ProviderV3, ProviderV4 } from '@ai-sdk/provider';
import type { LogWarningsFunction } from './logger/log-warnings';
import type { Telemetry } from './telemetry/telemetry';

// Each installed copy contributes its own types without conflicting with other
// versions. This is a type-only key; no symbol is created at runtime.
declare const aiSdkGlobalsKey: unique symbol;

declare global {
  interface AISDKGlobalTypes {
    [aiSdkGlobalsKey]: {
      provider: ProviderV4 | ProviderV3 | ProviderV2;
      logWarnings: LogWarningsFunction;
      telemetry: Telemetry;
    };
  }

  // Keep these registry-based declarations identical across major versions.
  /**
   * The default provider to use for the AI SDK.
   * String model ids are resolved to the default provider and model id.
   *
   * If not set, the default provider is the Vercel AI gateway provider.
   * An explicitly configured provider must support decision models to use experimental_decide.
   *
   * @see https://ai-sdk.dev/docs/ai-sdk-core/provider-management#global-provider-configuration
   */
  var AI_SDK_DEFAULT_PROVIDER:
    | AISDKGlobalTypes[keyof AISDKGlobalTypes]['provider']
    | undefined;

  /**
   * The warning logger to use for the AI SDK.
   *
   * If not set, warnings use process.emitWarning when available, otherwise
   * console.warn. Deprecations are emitted once per code by the default logger.
   *
   * If set to false, no warnings are logged.
   */
  var AI_SDK_LOG_WARNINGS:
    | AISDKGlobalTypes[keyof AISDKGlobalTypes]['logWarnings']
    | undefined
    | false;

  /**
   * Globally registered telemetry integrations for the AI SDK.
   *
   * Integrations registered here receive lifecycle events (onStart, onStepStart,
   * etc.) from every `generateText`, `streamText`, and similar call.
   *
   * Prefer using `registerTelemetry()` from `'ai'` instead of
   * assigning this directly.
   */
  var AI_SDK_TELEMETRY_INTEGRATIONS:
    | Array<AISDKGlobalTypes[keyof AISDKGlobalTypes]['telemetry']>
    | undefined;
}
