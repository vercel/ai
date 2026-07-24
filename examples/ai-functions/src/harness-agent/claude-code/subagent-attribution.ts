import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createClaudeCode } from '@ai-sdk/harness-claude-code';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { run } from '../../lib/run';

const expectedFiles = {
  'alpha.txt': 'alpha',
  'alpha-grandchild.txt': 'alpha-grandchild',
  'beta.txt': 'beta',
  'beta-grandchild.txt': 'beta-grandchild',
  'gamma.txt': 'gamma',
  'gamma-grandchild.txt': 'gamma-grandchild',
};

run(async () => {
  let activeSandbox: Experimental_SandboxSession | undefined;
  let sessionWorkDir: string | undefined;
  const sandbox = createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
    ...(process.env.VERCEL_TOKEN &&
    process.env.VERCEL_TEAM_ID &&
    process.env.VERCEL_PROJECT_ID
      ? {
          token: process.env.VERCEL_TOKEN,
          teamId: process.env.VERCEL_TEAM_ID,
          projectId: process.env.VERCEL_PROJECT_ID,
        }
      : {}),
  });
  const agent = new HarnessAgent({
    harness: createClaudeCode({
      model: 'claude-opus-4-6',
      forwardSubagentText: true,
    }),
    sandbox,
    permissionMode: 'allow-all',
    sandboxConfig: {
      onSession: async ({ session, sessionWorkDir: workDir }) => {
        activeSandbox = session;
        sessionWorkDir = workDir;
      },
    },
  });

  let exitCode = 0;
  const session = await agent.createSession();
  try {
    const result = await agent.stream({
      session,
      prompt: [
        'This is a recursive-agent protocol test. In one assistant response,',
        'make exactly three Agent tool calls back-to-back with these exact tasks:',
        '1. Alpha: write alpha.txt containing alpha, then you MUST call the Agent tool',
        'exactly once. Tell that grandchild to write alpha-grandchild.txt containing',
        'alpha-grandchild. Verify both files before returning.',
        '2. Beta: write beta.txt containing beta, then you MUST call the Agent tool',
        'exactly once. Tell that grandchild to write beta-grandchild.txt containing',
        'beta-grandchild. Verify both files before returning.',
        '3. Gamma: write gamma.txt containing gamma, then you MUST call the Agent tool',
        'exactly once. Tell that grandchild to write gamma-grandchild.txt containing',
        'gamma-grandchild. Verify both files before returning.',
        'The root must not write files or launch any agents beyond alpha, beta, and',
        'gamma. A child may not write its grandchild file itself.',
      ].join(' '),
    });

    const agentToolParents = new Map<string, string | undefined>();
    const descendantEvents: Array<{
      type: string;
      toolCallId?: string;
      parentToolUseId: string;
    }> = [];

    for await (const part of result.fullStream) {
      const providerMetadata =
        'providerMetadata' in part ? part.providerMetadata : undefined;
      const parentToolUseId = getParentToolUseId(providerMetadata);

      if (part.type === 'tool-call' && part.toolName === 'Agent') {
        agentToolParents.set(part.toolCallId, parentToolUseId);
        console.log('Agent tool call:', {
          toolCallId: part.toolCallId,
          parentToolUseId: parentToolUseId ?? null,
        });
      }
      if (parentToolUseId !== undefined) {
        descendantEvents.push({
          type: part.type,
          ...('toolCallId' in part ? { toolCallId: part.toolCallId } : {}),
          parentToolUseId,
        });
      }
    }

    const rootAgentIds = [...agentToolParents]
      .filter(([, parentToolUseId]) => parentToolUseId === undefined)
      .map(([toolCallId]) => toolCallId);
    const nestedAgentEntries = [...agentToolParents].filter(
      ([, parentToolUseId]) => parentToolUseId !== undefined,
    );
    if (agentToolParents.size !== 6) {
      throw new Error(
        `Expected six Agent tool ids, received ${agentToolParents.size}: ${JSON.stringify([...agentToolParents])}.`,
      );
    }
    if (rootAgentIds.length !== 3 || nestedAgentEntries.length !== 3) {
      throw new Error(
        `Expected three root and three nested Agent calls; received ${rootAgentIds.length} root and ${nestedAgentEntries.length} nested.`,
      );
    }

    const rootAgentIdSet = new Set(rootAgentIds);
    for (const [toolCallId, parentToolUseId] of nestedAgentEntries) {
      if (
        parentToolUseId === undefined ||
        !rootAgentIdSet.has(parentToolUseId)
      ) {
        throw new Error(
          `Nested Agent ${toolCallId} has unexpected parent ${String(parentToolUseId)}.`,
        );
      }
    }
    for (const event of descendantEvents) {
      if (!agentToolParents.has(event.parentToolUseId)) {
        throw new Error(
          `${event.type} references unknown parent ${event.parentToolUseId}.`,
        );
      }
    }
    if (descendantEvents.length === 0) {
      throw new Error('Expected attributed descendant events.');
    }

    const sandboxSession = activeSandbox;
    const workDir = sessionWorkDir;
    if (sandboxSession === undefined || workDir === undefined) {
      throw new Error('Sandbox session was not captured.');
    }
    for (const [file, expectedContent] of Object.entries(expectedFiles)) {
      const content = await sandboxSession.readTextFile({
        path: `${workDir}/${file}`,
      });
      if (content?.trim() !== expectedContent) {
        throw new Error(
          `Expected ${file} to contain "${expectedContent}", received ${JSON.stringify(content)}.`,
        );
      }
    }

    console.log('Agent tool ids:', [...agentToolParents.keys()]);
    console.log('Root Agent tool ids:', rootAgentIds);
    console.log('Attributed descendant events:', descendantEvents);
    console.log('Verified files:', Object.keys(expectedFiles));
  } catch (err) {
    exitCode = 1;
    console.error('[example] failed:', err);
  } finally {
    await session.destroy();
    process.exit(exitCode);
  }
});

function getParentToolUseId(metadata: unknown): string | undefined {
  if (!isRecord(metadata)) return undefined;
  const claudeCodeMetadata = metadata['claude-code'];
  if (!isRecord(claudeCodeMetadata)) return undefined;
  const parentToolUseId = claudeCodeMetadata.parentToolUseId;
  return typeof parentToolUseId === 'string' ? parentToolUseId : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
