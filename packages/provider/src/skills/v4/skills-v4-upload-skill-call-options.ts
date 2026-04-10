import { SharedV4ProviderOptions } from '../../shared/v4/shared-v4-provider-options';

export interface SkillsV4File {
  /**
   * The path of the file relative to the skill root.
   */
  path: string;

  /**
   * The content of the file, either as a base64 string or binary data.
   */
  content: string | Uint8Array;
}

export interface SkillsV4UploadSkillCallOptions {
  /**
   * The files that make up the skill.
   */
  files: SkillsV4File[];

  /**
   * Optional human-readable title for the skill.
   */
  displayTitle?: string;

  /**
   * Additional provider-specific options.
   */
  providerOptions?: SharedV4ProviderOptions;
}
