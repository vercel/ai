import { ProviderV3, UnsupportedFunctionalityError } from '@ai-sdk/provider';
import { ProviderOptions } from '@ai-sdk/provider-utils';
import { ListSkillsResult } from './list-skills-result';

export async function experimental_listSkills({
  provider,
  providerOptions,
}: {
  provider: ProviderV3;
  providerOptions?: ProviderOptions;
}): Promise<ListSkillsResult> {
  const skillsManager = provider.skillsManager?.();

  if (!skillsManager) {
    throw new UnsupportedFunctionalityError({
      functionality: 'skillsManager',
    });
  }

  const result = await skillsManager.list({
    providerOptions,
  });

  return {
    skills: result.skills,
    warnings: result.warnings,
  };
}
