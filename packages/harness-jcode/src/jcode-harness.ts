import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1,
} from '@ai-sdk/harness';
import type { ConnectOptions, LaunchOptions } from '@1jehuang/jcode-sdk';
import {
  launchJcodeClient,
  takeParkedJcodeClient,
  type JcodeClientFactory,
} from './jcode-client';
import { jcodeResumeDataSchema } from './jcode-resume-state';
import { createJcodeSession } from './jcode-session';
import { VERSION } from './version';

export interface JcodeHarnessSettings {
  /**
   * Explicitly run Jcode on the adapter host instead of inside the supplied
   * sandbox. Experimental and unsafe for remote or untrusted workspaces.
   */
  readonly experimentalHostExecution?: boolean;
  readonly model?: string;
  readonly reasoningEffort?: string;
  readonly jcodeHome?: string;
  readonly inheritLogins?: boolean;
  readonly binary?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly startupTimeoutMs?: number;
  readonly inheritStderr?: boolean;
  /** Dependency-injection seam for conformance tests and custom runtimes. */
  readonly clientFactory?: JcodeClientFactory;
}

export function createJcode(
  settings: JcodeHarnessSettings = {},
): HarnessV1<Record<string, never>> {
  return {
    specificationVersion: 'harness-v1',
    harnessId: 'jcode',
    builtinTools: {},
    supportsBuiltinToolApprovals: false,
    supportsBuiltinToolFiltering: false,
    lifecycleStateSchema: jcodeResumeDataSchema,
    async doStart(options) {
      if (!settings.experimentalHostExecution) {
        throw new HarnessCapabilityUnsupportedError({
          harnessId: 'jcode',
          message:
            'jcode: sandbox execution requires the planned in-sandbox bridge. Set experimentalHostExecution: true only for trusted host-local workspaces.',
        });
      }
      const lifecycle = options.continueFrom ?? options.resumeFrom;
      const resumeData = lifecycle?.data
        ? jcodeResumeDataSchema.parse(lifecycle.data)
        : undefined;
      const launchOptions: LaunchOptions & ConnectOptions = {
        workingDir: options.sessionWorkDir,
        ...((resumeData?.jcodeHome ?? settings.jcodeHome)
          ? { jcodeHome: resumeData?.jcodeHome ?? settings.jcodeHome }
          : {}),
        ...(settings.inheritLogins == null
          ? {}
          : { inheritLogins: settings.inheritLogins }),
        ...(settings.binary ? { binary: settings.binary } : {}),
        ...(settings.env ? { env: { ...settings.env } } : {}),
        ...(settings.startupTimeoutMs == null
          ? {}
          : { startupTimeoutMs: settings.startupTimeoutMs }),
        ...(settings.inheritStderr == null
          ? {}
          : { inheritStderr: settings.inheritStderr }),
        clientName: `ai-sdk/harness-jcode/${VERSION}`,
      };
      const client =
        (resumeData?.jcodeSessionId
          ? takeParkedJcodeClient(resumeData.jcodeSessionId)
          : undefined) ??
        (await (settings.clientFactory ?? launchJcodeClient)(launchOptions));
      return createJcodeSession({
        client,
        sessionId: options.sessionId,
        sessionWorkDir: options.sessionWorkDir,
        resumeJcodeSessionId: resumeData?.jcodeSessionId,
        model: settings.model,
        reasoningEffort: settings.reasoningEffort,
        abortSignal: options.abortSignal,
      });
    },
  };
}
