import type { JSONSchema7 } from '@ai-sdk/provider';

/**
 * Tool declaration supplied to an adapter for one user turn.
 */
export type HarnessV2ToolSpec = {
  /**
   * Name used by the harness when exposing or invoking the tool.
   */
  readonly name: string;

  /**
   * Optional instructions shown to the model or harness runtime.
   */
  readonly description?: string;

  /**
   * Optional JSON Schema describing the tool's input.
   */
  readonly inputSchema?: JSONSchema7;
};

/**
 * A file bundled with a skill's instructions.
 */
export type HarnessV2SkillFile = {
  /**
   * Relative path at which the adapter should expose the file.
   */
  readonly path: string;

  /**
   * Text content of the skill file.
   */
  readonly content: string;
};

/**
 * Skill instructions and optional supporting files for a user turn.
 */
export type HarnessV2Skill = {
  /**
   * Stable skill name.
   */
  readonly name: string;

  /**
   * Short description used when presenting or selecting the skill.
   */
  readonly description: string;

  /**
   * Main instruction content supplied to the harness.
   */
  readonly content: string;

  /**
   * Optional supporting files made available with the skill.
   */
  readonly files?: ReadonlyArray<HarnessV2SkillFile>;
};

/**
 * Adapter-facing configuration applied to a single prompt submission.
 */
export type HarnessV2TurnSettings = {
  /**
   * Optional model identifier requested for this turn.
   */
  readonly model?: string;

  /**
   * Skills available to the harness while processing this turn.
   */
  readonly skills: ReadonlyArray<HarnessV2Skill>;

  /**
   * Optional system-level instructions for this turn.
   */
  readonly instructions?: string;

  /**
   * Tools exposed to the harness for this turn.
   */
  readonly tools: ReadonlyArray<HarnessV2ToolSpec>;
};
