import { SkillsV4, SkillsV4File, SkillsV4Skill } from '@ai-sdk/provider';
import { ProviderOptions } from '@ai-sdk/provider-utils';
import { Warning } from '../types/warning';

export interface UpdateSkillResult {
  readonly skill: SkillsV4Skill;
  readonly warnings: Warning[];
}

export async function updateSkill({
  skillsManager,
  skillId,
  files,
  providerOptions,
}: {
  skillsManager: SkillsV4;
  skillId: string;
  files: SkillsV4File[];
  providerOptions?: ProviderOptions;
}): Promise<UpdateSkillResult> {
  const result = await skillsManager.update({
    skillId,
    files,
    providerOptions,
  });

  return {
    skill: result.skill,
    warnings: result.warnings,
  };
}
