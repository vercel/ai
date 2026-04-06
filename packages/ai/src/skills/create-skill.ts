import { SkillsV4, SkillsV4File, SkillsV4Skill } from '@ai-sdk/provider';
import { ProviderOptions } from '@ai-sdk/provider-utils';
import { Warning } from '../types/warning';

export interface CreateSkillResult {
  readonly skill: SkillsV4Skill;
  readonly warnings: Warning[];
}

export async function createSkill({
  skillsManager,
  files,
  displayTitle,
  providerOptions,
}: {
  skillsManager: SkillsV4;
  files: SkillsV4File[];
  displayTitle?: string;
  providerOptions?: ProviderOptions;
}): Promise<CreateSkillResult> {
  const result = await skillsManager.create({
    files,
    displayTitle,
    providerOptions,
  });

  return {
    skill: result.skill,
    warnings: result.warnings,
  };
}
