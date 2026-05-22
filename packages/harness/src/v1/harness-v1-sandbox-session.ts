import type { Experimental_Sandbox } from '@ai-sdk/provider-utils';

/**
 * Tool-safe sandbox surface — alias for `Experimental_Sandbox`. Carries file
 * I/O, exec, and spawn; carries nothing that could disturb the session itself.
 *
 * This is the narrow type that flows to user-tool `execute()` calls. Tools
 * never receive the full {@link HarnessV1SandboxHandle}.
 */
export type HarnessV1SandboxSession = Experimental_Sandbox;
