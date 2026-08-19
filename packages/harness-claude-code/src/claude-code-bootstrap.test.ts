import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLAUDE_CODE_PINNED_CLI_VERSION } from './claude-code-bootstrap';

// The SDK's own package.json declares the CLI version it was built and
// tested against. A version bump here without updating the pin leaves the
// adapter installing a CLI the bridge was never tested against.
describe('CLAUDE_CODE_PINNED_CLI_VERSION', () => {
  it('matches the installed Agent SDK build claudeCodeVersion', () => {
    const require = createRequire(import.meta.url);
    const sdkEntryPath = require.resolve('@anthropic-ai/claude-agent-sdk');
    let packageDir = dirname(sdkEntryPath);
    while (!existsSync(join(packageDir, 'package.json'))) {
      packageDir = dirname(packageDir);
    }
    const sdkPackageJson = JSON.parse(
      readFileSync(join(packageDir, 'package.json'), 'utf8'),
    ) as { claudeCodeVersion?: string };

    expect(sdkPackageJson.claudeCodeVersion).toBe(
      CLAUDE_CODE_PINNED_CLI_VERSION,
    );
  });
});
