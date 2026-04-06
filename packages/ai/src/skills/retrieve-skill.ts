import { SkillsV4, SkillsV4Skill } from '@ai-sdk/provider';
import { ProviderOptions } from '@ai-sdk/provider-utils';
import { Warning } from '../types/warning';

export interface RetrieveSkillResult {
  readonly skill: SkillsV4Skill;
  readonly warnings: Warning[];
}

export async function retrieveSkill({
  skillsManager,
  skillId,
  providerOptions,
}: {
  skillsManager: SkillsV4;
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
