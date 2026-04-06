import { SkillsV4 } from '@ai-sdk/provider';
import { ProviderOptions } from '@ai-sdk/provider-utils';
import { Warning } from '../types/warning';

export interface DeleteSkillResult {
  readonly warnings: Warning[];
}

export async function deleteSkill({
  skillsManager,
  skillId,
  providerOptions,
}: {
  skillsManager: SkillsV4;
  skillId: string;
  providerOptions?: ProviderOptions;
}): Promise<DeleteSkillResult> {
  const result = await skillsManager.delete({
    skillId,
    providerOptions,
  });

  return {
    warnings: result.warnings,
  };
}
