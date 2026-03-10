import {
  Experimental_SkillsManagerV1,
  Experimental_SkillsManagerV1Skill,
} from '@ai-sdk/provider';
import { ProviderOptions } from '@ai-sdk/provider-utils';
import { Warning } from '../types/warning';

export interface ListSkillsResult {
  readonly skills: Experimental_SkillsManagerV1Skill[];
  readonly warnings: Warning[];
}

export async function experimental_listSkills({
  skillsManager,
  providerOptions,
}: {
  skillsManager: Experimental_SkillsManagerV1;
  providerOptions?: ProviderOptions;
}): Promise<ListSkillsResult> {
  const result = await skillsManager.list({
    providerOptions,
  });

  return {
    skills: result.skills,
    warnings: result.warnings,
  };
}
