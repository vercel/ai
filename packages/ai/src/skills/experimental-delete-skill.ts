import { ProviderV3, UnsupportedFunctionalityError } from '@ai-sdk/provider';
import { ProviderOptions } from '@ai-sdk/provider-utils';
import { DeleteSkillResult } from './delete-skill-result';

export async function experimental_deleteSkill({
  provider,
  skillId,
  providerOptions,
}: {
  provider: ProviderV3;
  skillId: string;
  providerOptions?: ProviderOptions;
}): Promise<DeleteSkillResult> {
  const skillsManager = provider.skillsManager?.();

  if (!skillsManager) {
    throw new UnsupportedFunctionalityError({
      functionality: 'skillsManager',
    });
  }

  const result = await skillsManager.delete({
    skillId,
    providerOptions,
  });

  return {
    warnings: result.warnings,
  };
}
