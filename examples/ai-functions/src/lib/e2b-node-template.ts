import { Template } from 'e2b';

const templateName = 'ai-sdk-node24';

/*
 * Bridge-backed harness adapters such as Claude Code and Codex install their
 * bridge with pnpm, which E2B's default `base` template does not include.
 * This builds a Node.js 24 template with pnpm in the E2B account on first use
 * and returns its name on later calls. The template also fixes the CPU and
 * memory of the sandboxes that start from it.
 */
export async function ensureE2BNodeTemplate(): Promise<string> {
  if (!(await Template.exists(templateName))) {
    await Template.build(
      Template().fromNodeImage('24').npmInstall('pnpm', { g: true }),
      templateName,
      { cpuCount: 2, memoryMB: 2048 },
    );
  }
  return templateName;
}
