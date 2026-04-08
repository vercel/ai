import { ProviderV4, SkillsV4, SkillsV4File } from '@ai-sdk/provider';
import { ProviderOptions } from '@ai-sdk/provider-utils';
import { UploadSkillResult } from './upload-skill-result';

export async function uploadSkill({
  api,
  files,
  displayTitle,
  providerOptions,
}: {
  api: SkillsV4 | ProviderV4;
  files: SkillsV4File[];
  displayTitle?: string;
  providerOptions?: ProviderOptions;
}): Promise<UploadSkillResult> {
  const skillsApi: SkillsV4 =
    'uploadSkill' in api
      ? api
      : typeof api.skills === 'function'
        ? api.skills()
        : (() => {
            throw new Error(
              'The provider does not support skills. Make sure it exposes a skills() method.',
            );
          })();

  const result = await skillsApi.uploadSkill({
    files,
    displayTitle,
    providerOptions,
  });

  return result;
}
