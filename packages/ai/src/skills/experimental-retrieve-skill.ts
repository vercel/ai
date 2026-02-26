import {
  ProviderV3,
  Experimental_SkillsManagerV1Skill,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { ProviderOptions } from '@ai-sdk/provider-utils';
import { Warning } from '../types/warning';

export interface RetrieveSkillResult {
  readonly skill: Experimental_SkillsManagerV1Skill;
  readonly warnings: Warning[];
}

export async function experimental_retrieveSkill({
  provider,
  skillId,
  providerOptions,
}: {
  provider: ProviderV3;
  skillId: string;
  providerOptions?: ProviderOptions;
}): Promise<RetrieveSkillResult> {
  const skillsManager = provider.skillsManager?.();

  if (!skillsManager) {
    throw new UnsupportedFunctionalityError({
      functionality: 'skillsManager',
    });
  }

  const result = await skillsManager.retrieve({
    skillId,
    providerOptions,
  });

  return {
    skill: result.skill,
    warnings: result.warnings,
  };
}
