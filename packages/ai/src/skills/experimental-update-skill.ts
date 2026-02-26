import {
  Experimental_SkillsManagerV1,
  Experimental_SkillsManagerV1File,
  Experimental_SkillsManagerV1Skill,
} from '@ai-sdk/provider';
import { ProviderOptions } from '@ai-sdk/provider-utils';
import { Warning } from '../types/warning';

export interface UpdateSkillResult {
  readonly skill: Experimental_SkillsManagerV1Skill;
  readonly warnings: Warning[];
}

export async function experimental_updateSkill({
  skillsManager,
  skillId,
  files,
  providerOptions,
}: {
  skillsManager: Experimental_SkillsManagerV1;
  skillId: string;
  files: Experimental_SkillsManagerV1File[];
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
