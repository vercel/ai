import {
  ProviderV3,
  Experimental_SkillsManagerV1File,
  Experimental_SkillsManagerV1Skill,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { ProviderOptions } from '@ai-sdk/provider-utils';
import { Warning } from '../types/warning';

export interface CreateSkillResult {
  readonly skill: Experimental_SkillsManagerV1Skill;
  readonly warnings: Warning[];
}

export async function experimental_createSkill({
  provider,
  files,
  displayTitle,
  providerOptions,
}: {
  provider: ProviderV3;
  files: Experimental_SkillsManagerV1File[];
  displayTitle?: string;
  providerOptions?: ProviderOptions;
}): Promise<CreateSkillResult> {
  const skillsManager = provider.skillsManager?.();

  if (!skillsManager) {
    throw new UnsupportedFunctionalityError({
      functionality: 'skillsManager',
    });
  }

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
