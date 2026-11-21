import { AISDKError } from '@ai-sdk/provider';
import { HarnessError } from './harness-error';

const name = 'AI_HarnessExecutableMissingError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

/**
 * Thrown when the runtime's executable is missing from the session's
 * environment and installing it was not consented to.
 *
 * Carries the adapter-declared install command so the error is actionable:
 * run the command yourself, or pass `onInstallRequest` on the agent to
 * authorize the harness to run it for you.
 */
export class HarnessExecutableMissingError extends HarnessError {
  private readonly [symbol] = true;

  readonly harnessId?: string;
  /** The executable that was not found on the environment's `PATH`. */
  readonly executable: string;
  /** The adapter's preferred command to install it. */
  readonly installCommand?: string;

  constructor({
    message,
    harnessId,
    executable,
    installCommand,
    cause,
  }: {
    message?: string;
    harnessId?: string;
    executable: string;
    installCommand?: string;
    cause?: unknown;
  }) {
    super({
      message:
        message ??
        `The '${executable}' executable was not found in the session's environment.` +
          (installCommand
            ? ` Install it with \`${installCommand}\`, or pass \`onInstallRequest\` to authorize the harness to install it.`
            : ''),
      cause,
    });
    Object.defineProperty(this, 'name', { value: name });
    this.harnessId = harnessId;
    this.executable = executable;
    this.installCommand = installCommand;
  }

  static isInstance(error: unknown): error is HarnessExecutableMissingError {
    return AISDKError.hasMarker(error, marker);
  }
}
