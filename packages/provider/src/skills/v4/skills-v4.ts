import { SharedV4ProviderOptions } from '../../shared/v4/shared-v4-provider-options';
import { SharedV4ProviderMetadata } from '../../shared/v4/shared-v4-provider-metadata';
import { SharedV4ProviderReference } from '../../shared/v4/shared-v4-provider-reference';
import { SharedV4Warning } from '../../shared/v4/shared-v4-warning';

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

export interface SkillsV4UploadParams {
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

export interface SkillsV4UploadResult {
  /**
   * A provider reference mapping provider names to provider-specific skill identifiers.
   */
  providerReference: SharedV4ProviderReference;

  /**
   * Optional human-readable title for the uploaded skill.
   */
  displayTitle?: string;

  /**
   * Optional name of the uploaded skill.
   */
  name?: string;

  /**
   * Optional description of what the uploaded skill does.
   */
  description?: string;

  /**
   * Optional latest version identifier of the uploaded skill.
   */
  latestVersion?: string;

  /**
   * Additional provider-specific metadata.
   */
  providerMetadata?: SharedV4ProviderMetadata;

  /**
   * Warnings for the call, e.g. unsupported settings.
   */
  warnings: SharedV4Warning[];
}

/**
 * Skills manager specification version 4.
 */
export interface SkillsV4 {
  /**
   * The skills manager must specify which skills manager interface
   * version it implements. This will allow us to evolve the skills
   * manager interface and retain backwards compatibility. The different
   * implementation versions can be handled as a discriminated union
   * on our side.
   */
  readonly specificationVersion: 'v4';

  /**
   * Name of the provider for logging purposes.
   */
  readonly provider: string;

  /**
   * Uploads a new skill from the given files.
   */
  upload(params: SkillsV4UploadParams): Promise<SkillsV4UploadResult>;
}
