import { SkillsV4UploadResult } from '@ai-sdk/provider';
import { ProviderReference } from '../types/provider-reference';
import { Warning } from '../types/warning';

export type UploadSkillResult = Omit<
  SkillsV4UploadResult,
  'providerReference' | 'warnings'
> & {
  readonly providerReference: ProviderReference;
  readonly warnings: Warning[];
};
