import assert from 'node:assert/strict';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createClaudeCode } from '@ai-sdk/harness-claude-code';
import { NoSuchToolError } from 'ai';

async function main() {
  const harness = createClaudeCode();

  assert.doesNotThrow(() => {
    new HarnessAgent({
      harness,
      inactiveTools: ['SendMessage'],
    });
  });

  assert.throws(
    () => {
      new HarnessAgent({
        harness,
        inactiveTools: ['DefinitelyNotAClaudeCodeTool'] as never,
      });
    },
    error =>
      NoSuchToolError.isInstance(error) &&
      error.toolName === 'DefinitelyNotAClaudeCodeTool',
  );

  try {
    new HarnessAgent({
      harness,
      // The cast exposes the runtime behavior while ListAgents is absent from
      // the adapter's typed builtin catalog.
      inactiveTools: ['ListAgents'] as never,
    });
  } catch (error) {
    if (NoSuchToolError.isInstance(error) && error.toolName === 'ListAgents') {
      throw new Error(
        "Issue #22370 reproduced: HarnessAgent rejected inactive native tool 'ListAgents' during construction.",
        { cause: error },
      );
    }

    throw error;
  }

  console.log(
    "Issue #22370 not reproduced: HarnessAgent accepted inactive native tool 'ListAgents'.",
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
