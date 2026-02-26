import {
  ProviderV3,
  Experimental_SkillsManagerV1File,
  Experimental_SkillsManagerV1Skill,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { ProviderOptions } from '@ai-sdk/provider-utils';
import { Warning } from '../types/warning';

export interface UpdateSkillResult {
  readonly skill: Experimental_SkillsManagerV1Skill;
  readonly warnings: Warning[];
}

export async function experimental_updateSkill({
  provider,
  skillId,
  files,
  providerOptions,
}: {
  provider: ProviderV3;
  skillId: string;
  files: Experimental_SkillsManagerV1File[];
  providerOptions?: ProviderOptions;
}): Promise<UpdateSkillResult> {
  const skillsManager = provider.skillsManager?.();

  if (!skillsManager) {
    throw new UnsupportedFunctionalityError({
      functionality: 'skillsManager',
    });
  }

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
