import {
  Experimental_SkillsManagerV1,
  Experimental_SkillsManagerV1File,
  Experimental_SkillsManagerV1Skill,
} from '@ai-sdk/provider';
import { ProviderOptions } from '@ai-sdk/provider-utils';
import { Warning } from '../types/warning';

export interface CreateSkillResult {
  readonly skill: Experimental_SkillsManagerV1Skill;
  readonly warnings: Warning[];
}

export async function experimental_createSkill({
  skillsManager,
  files,
  displayTitle,
  providerOptions,
}: {
  skillsManager: Experimental_SkillsManagerV1;
  files: Experimental_SkillsManagerV1File[];
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
