import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createCline } from './_create';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

const cline = createCline();

/*
 * Skills are domain-specific reference material the agent loads on demand
 * when it decides — based on the skill's name and description — that the
 * current task is relevant. They are not system-prompt overrides and do not
 * auto-fire on every turn. The description has to advertise *when to use
 * this skill* so the agent can recognise the match.
 *
 * The Cline adapter exposes skills through Cline's native `skills` tool. The
 * skill instructions and attached files stay in the host process until the
 * model invokes that tool.
 */
run(async () => {
  const sandbox = createVercelSandbox({
    runtime: 'node24',
    timeout: 10 * 60 * 1000,
  });

  const agent = new HarnessAgent({
    harness: cline,
    sandbox,
    skills: [
      {
        name: 'release-notes-format',
        description:
          'Use when the user asks to write, draft, or update release notes. Provides our team-specific format that you will not know otherwise.',
        content: `# Release notes format

Before drafting release notes, read \`release-notes-format.md\`. It is the source of truth for the section order, tone, PR reference style, and version-tag rule.`,
        files: [
          {
            path: 'release-notes-format.md',
            content: `# Release notes format reference

Structure release notes as exactly three top-level sections in this order:

## Highlights
User-facing new features. One short paragraph per item, present tense.
Reference PRs inline as bare \`#1234\` (no link).

## Fixes
Bug fixes only. One bullet per fix, imperative mood ("Fix X" not "Fixed X").

## Breaking changes
Schema changes, removed APIs, behaviour changes that require migration.
Each item: a one-line summary followed by a "**Migration:**" sub-bullet.
Omit this section entirely if there are no breaking changes.

End the document with the version tag on a line by itself, prefixed with \`v\`.`,
          },
        ],
      },
    ],
  });

  let exitCode = 0;
  const session = await agent.createSession();
  try {
    const result = await agent.stream({
      session,
      prompt:
        'Draft release notes for our next release, v2.4.0. We added a dark mode toggle in #892, fixed an autofocus bug in the search bar in #901, and renamed the `--legacy` CLI flag to `--compat` (old flag removed, no alias).',
    });
    await printFullStream({ result });
  } catch (err) {
    exitCode = 1;
    console.error('[example] failed:', err);
  } finally {
    await session.destroy();
    process.exit(exitCode);
  }
});
