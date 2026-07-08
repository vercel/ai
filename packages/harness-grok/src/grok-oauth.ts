import type { Experimental_SandboxSession } from "@ai-sdk/provider-utils";

import { GROK_CLI } from "./grok-bootstrap.js";

const URL_PATTERN = /https:\/\/[^\s"'<>]+/i;
const USER_CODE_LINE = /(?:enter\s+)?code[:\s]+([A-Z0-9-]+)/i;

export function parseGrokDeviceLoginOutput(
  output: string,
): { url: string; userCode?: string } | undefined {
  const urlMatch = output.match(URL_PATTERN);
  if (!urlMatch) return undefined;
  const url = urlMatch[0].replace(/[.,)]+$/, "");
  const codeMatch = output.match(USER_CODE_LINE);
  const userCode = codeMatch?.[1];
  return { url, userCode };
}

export function formatGrokLoginQuestion(parsed: { url: string; userCode?: string }): string {
  const codeLine = parsed.userCode ? ` Code: ${parsed.userCode}.` : "";
  return `Grok harness needs OAuth in the sandbox.${codeLine} Open ${parsed.url} — complete login, then retry.`;
}

export async function grokAuthFileExists(
  session: Experimental_SandboxSession,
  homeDir: string,
): Promise<boolean> {
  const result = (await session.run({
    command: `test -f ${homeDir}/.grok/auth.json && echo ok`,
    workingDirectory: homeDir,
  })) as { exitCode?: number; stdout?: string };
  return (result.stdout ?? "").includes("ok");
}

export async function runGrokDeviceLogin(input: {
  session: Experimental_SandboxSession;
  sessionWorkDir: string;
  homeDir?: string;
}): Promise<{ url: string; userCode?: string } | undefined> {
  const home = input.homeDir ?? "/vercel/sandbox";
  const result = (await input.session.run({
    command: [
      `export HOME=${home}`,
      `mkdir -p ${home}/.grok`,
      `timeout 120 ${GROK_CLI} login --device-auth 2>&1 || true`,
    ].join(" && "),
    workingDirectory: input.sessionWorkDir,
    env: { HOME: home },
  })) as { stdout?: string; stderr?: string };

  return parseGrokDeviceLoginOutput(`${result.stdout ?? ""}\n${result.stderr ?? ""}`);
}

/**
 * Ensure Grok OAuth credentials exist in the sandbox before the first harness turn.
 * Use from `HarnessAgent` `sandboxConfig.onSession` when `XAI_API_KEY` is unset.
 */
export async function ensureGrokSandboxOAuth(input: {
  session: Experimental_SandboxSession;
  sessionWorkDir: string;
  homeDir?: string;
}): Promise<{ ready: true } | { ready: false; question: string }> {
  const homeDir = input.homeDir ?? "/vercel/sandbox";
  if (await grokAuthFileExists(input.session, homeDir)) {
    return { ready: true };
  }

  const parsed = await runGrokDeviceLogin({
    session: input.session,
    sessionWorkDir: input.sessionWorkDir,
    homeDir,
  });

  if (!parsed) {
    return {
      ready: false,
      question:
        "Could not start Grok device login in the sandbox. Set XAI_API_KEY on the host or retry OAuth.",
    };
  }

  return { ready: false, question: formatGrokLoginQuestion(parsed) };
}