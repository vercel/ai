import { SkillsV4, SkillsV4Skill } from '@ai-sdk/provider';
import { ProviderOptions } from '@ai-sdk/provider-utils';
import { Warning } from '../types/warning';

export interface ListSkillsResult {
  readonly skills: SkillsV4Skill[];
  readonly warnings: Warning[];
}

export async function listSkills({
  skillsManager,
  providerOptions,
}: {
  skillsManager: SkillsV4;
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
