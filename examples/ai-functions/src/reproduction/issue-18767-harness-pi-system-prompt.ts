import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createPi } from '@ai-sdk/harness-pi';
import { createJustBashSandbox } from '@ai-sdk/sandbox-just-bash';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const customSystemPrompt = 'ISSUE_18767_CUSTOM_SYSTEM_PROMPT';
const defaultSystemPromptMarker =
  'You are an expert coding assistant operating inside pi';

async function main() {
  let observedSystemPrompt: string | undefined;
  const agentDir = await mkdtemp(path.join(tmpdir(), 'issue-18767-pi-agent-'));
  await writeFile(
    path.join(agentDir, 'models.json'),
    JSON.stringify({
      providers: {
        'issue-18767-provider': {
          baseUrl: 'http://127.0.0.1:1/v1',
          api: 'openai-completions',
          apiKey: 'issue-18767-reproduction-key',
          models: [{ id: 'capture-system-prompt' }],
        },
      },
    }),
  );

  try {
    const agent = new HarnessAgent({
      harness: createPi({
        agentDir,
        model: 'issue-18767-provider/capture-system-prompt',
        extensionFactories: [
          pi => {
            pi.on('before_agent_start', event => {
              observedSystemPrompt = event.systemPrompt;
            });
          },
        ],
      }),
      sandbox: createJustBashSandbox(),
      sandboxConfig: {
        onSession: async ({ session, sessionWorkDir, abortSignal }) => {
          const mkdirResult = await session.run({
            command: `mkdir -p '${sessionWorkDir}/.pi'`,
            abortSignal,
          });
          if (mkdirResult.exitCode !== 0) {
            throw new Error(`Failed to create .pi: ${mkdirResult.stderr}`);
          }

          await session.writeTextFile({
            path: `${sessionWorkDir}/.pi/SYSTEM.md`,
            content: customSystemPrompt,
            abortSignal,
          });

          const writtenPrompt = await session.readTextFile({
            path: `${sessionWorkDir}/.pi/SYSTEM.md`,
            abortSignal,
          });
          if (writtenPrompt !== customSystemPrompt) {
            throw new Error(
              'Failed to write the sandbox SYSTEM.md precondition.',
            );
          }
        },
      },
    });

    const session = await agent.createSession({
      sessionId: `issue-18767-${process.pid}`,
    });

    try {
      await agent.generate({
        session,
        prompt: 'Capture the active system prompt.',
      });
    } catch (error) {
      if (observedSystemPrompt == null) {
        throw error;
      }
    } finally {
      await session.destroy();
    }
  } finally {
    await rm(agentDir, { recursive: true, force: true });
  }

  if (observedSystemPrompt?.includes(customSystemPrompt)) {
    return;
  }

  if (observedSystemPrompt?.includes(defaultSystemPromptMarker)) {
    throw new Error(
      'ISSUE_18767: sandbox .pi/SYSTEM.md was ignored and Pi used its default system prompt',
    );
  }

  throw new Error(
    'The active Pi system prompt contained neither the project prompt nor the default prompt marker.',
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
