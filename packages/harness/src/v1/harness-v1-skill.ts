/**
 * A self-contained instruction bundle the underlying runtime can load into
 * its context. Adapters decide how to surface skills to the runtime — the
 * `claude` CLI auto-discovers skills materialised as Markdown files in
 * `.claude/skills`, while the `codex` CLI has no skill mechanism and the
 * adapter inlines them into every user message.
 */
export type HarnessV1Skill = {
  /** Stable identifier for the skill (kebab-case slug). */
  readonly name: string;

  /**
   * Short, model-facing description. For runtimes that auto-select skills
   * (Claude Code), this is what the runtime sees to decide whether the
   * skill is relevant; for runtimes that load every skill on every turn
   * (Codex), it appears alongside the content.
   */
  readonly description: string;

  /** Full skill content the model loads when the skill is active. */
  readonly content: string;
};
