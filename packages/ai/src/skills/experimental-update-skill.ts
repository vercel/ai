import {
  ProviderV3,
  SkillsManagerV1File,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { ProviderOptions } from '@ai-sdk/provider-utils';
import { UpdateSkillResult } from './update-skill-result';

export async function experimental_updateSkill({
  provider,
  skillId,
  files,
  providerOptions,
}: {
  provider: ProviderV3;
  skillId: string;
  files: SkillsManagerV1File[];
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
