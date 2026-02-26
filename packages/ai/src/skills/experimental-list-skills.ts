import {
  ProviderV3,
  Experimental_SkillsManagerV1Skill,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { ProviderOptions } from '@ai-sdk/provider-utils';
import { Warning } from '../types/warning';

export interface ListSkillsResult {
  readonly skills: Experimental_SkillsManagerV1Skill[];
  readonly warnings: Warning[];
}

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
