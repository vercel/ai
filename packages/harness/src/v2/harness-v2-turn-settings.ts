import type { JSONSchema7 } from '@ai-sdk/provider';

export type HarnessV2ToolSpec = {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema?: JSONSchema7;
};

export type HarnessV2SkillFile = {
  readonly path: string;
  readonly content: string;
};

export type HarnessV2Skill = {
  readonly name: string;
  readonly description: string;
  readonly content: string;
  readonly files?: ReadonlyArray<HarnessV2SkillFile>;
};

export type HarnessV2TurnSettings = {
  readonly model?: string;
  readonly skills: ReadonlyArray<HarnessV2Skill>;
  readonly instructions?: string;
  readonly tools: ReadonlyArray<HarnessV2ToolSpec>;
};
