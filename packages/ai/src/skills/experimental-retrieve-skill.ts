import {
  Experimental_SkillsManagerV1,
  Experimental_SkillsManagerV1Skill,
} from '@ai-sdk/provider';
import { ProviderOptions } from '@ai-sdk/provider-utils';
import { Warning } from '../types/warning';

export interface RetrieveSkillResult {
  readonly skill: Experimental_SkillsManagerV1Skill;
  readonly warnings: Warning[];
}

export async function experimental_retrieveSkill({
  skillsManager,
  skillId,
  providerOptions,
}: {
  skillsManager: Experimental_SkillsManagerV1;
  skillId: string;
  providerOptions?: ProviderOptions;
}): Promise<RetrieveSkillResult> {
  const result = await skillsManager.retrieve({
    skillId,
    providerOptions,
  });

  return {
    skill: result.skill,
    warnings: result.warnings,
  };
}
