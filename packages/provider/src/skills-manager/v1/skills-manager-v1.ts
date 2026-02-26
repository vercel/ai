import { SharedV3ProviderOptions } from '../../shared/v3/shared-v3-provider-options';
import { SharedV3Warning } from '../../shared/v3/shared-v3-warning';

export interface SkillsManagerV1File {
  /**
   * The path of the file relative to the skill root.
   */
  path: string;

  /**
   * The content of the file, either as a base64 string or binary data.
   */
  content: string | Uint8Array;
}

export interface SkillsManagerV1Skill {
  /**
   * Unique identifier of the skill.
   */
  id: string;

  /**
   * Optional human-readable title for the skill.
   */
  displayTitle?: string;

  /**
   * Optional name of the skill.
   */
  name?: string;

  /**
   * Optional description of what the skill does.
   */
  description?: string;

  /**
   * The source of the skill, either user-created or provider-created.
   */
  source: 'user' | 'provider';

  /**
   * Timestamp when the skill was created.
   */
  createdAt: Date;

  /**
   * Timestamp when the skill was last updated.
   */
  updatedAt: Date;
}

export interface SkillsManagerV1CreateParams {
  /**
   * The files that make up the skill.
   */
  files: SkillsManagerV1File[];

  /**
   * Optional human-readable title for the skill.
   */
  displayTitle?: string;

  /**
   * Additional provider-specific options.
   */
  providerOptions?: SharedV3ProviderOptions;
}

export interface SkillsManagerV1CreateResult {
  /**
   * The created skill.
   */
  skill: SkillsManagerV1Skill;

  /**
   * Warnings for the call, e.g. unsupported settings.
   */
  warnings: SharedV3Warning[];
}

export interface SkillsManagerV1ListParams {
  /**
   * Additional provider-specific options.
   */
  providerOptions?: SharedV3ProviderOptions;
}

export interface SkillsManagerV1ListResult {
  /**
   * The list of skills.
   */
  skills: SkillsManagerV1Skill[];

  /**
   * Warnings for the call, e.g. unsupported settings.
   */
  warnings: SharedV3Warning[];
}

export interface SkillsManagerV1RetrieveParams {
  /**
   * The ID of the skill to retrieve.
   */
  skillId: string;

  /**
   * Additional provider-specific options.
   */
  providerOptions?: SharedV3ProviderOptions;
}

export interface SkillsManagerV1RetrieveResult {
  /**
   * The retrieved skill.
   */
  skill: SkillsManagerV1Skill;

  /**
   * Warnings for the call, e.g. unsupported settings.
   */
  warnings: SharedV3Warning[];
}

export interface SkillsManagerV1UpdateParams {
  /**
   * The ID of the skill to update.
   */
  skillId: string;

  /**
   * The updated files that make up the skill.
   */
  files: SkillsManagerV1File[];

  /**
   * Additional provider-specific options.
   */
  providerOptions?: SharedV3ProviderOptions;
}

export interface SkillsManagerV1UpdateResult {
  /**
   * The updated skill.
   */
  skill: SkillsManagerV1Skill;

  /**
   * Warnings for the call, e.g. unsupported settings.
   */
  warnings: SharedV3Warning[];
}

export interface SkillsManagerV1DeleteParams {
  /**
   * The ID of the skill to delete.
   */
  skillId: string;

  /**
   * Additional provider-specific options.
   */
  providerOptions?: SharedV3ProviderOptions;
}

export interface SkillsManagerV1DeleteResult {
  /**
   * Warnings for the call, e.g. unsupported settings.
   */
  warnings: SharedV3Warning[];
}

/**
 * Skills manager specification version 1.
 */
export interface SkillsManagerV1 {
  /**
   * The skills manager must specify which skills manager interface
   * version it implements. This will allow us to evolve the skills
   * manager interface and retain backwards compatibility. The different
   * implementation versions can be handled as a discriminated union
   * on our side.
   */
  readonly specificationVersion: 'v1';

  /**
   * Name of the provider for logging purposes.
   */
  readonly provider: string;

  /**
   * Creates a new skill from the given files.
   */
  create(
    params: SkillsManagerV1CreateParams,
  ): Promise<SkillsManagerV1CreateResult>;

  /**
   * Lists all available skills.
   */
  list(params?: SkillsManagerV1ListParams): Promise<SkillsManagerV1ListResult>;

  /**
   * Retrieves a skill by its ID.
   */
  retrieve(
    params: SkillsManagerV1RetrieveParams,
  ): Promise<SkillsManagerV1RetrieveResult>;

  /**
   * Updates an existing skill with new files.
   */
  update(
    params: SkillsManagerV1UpdateParams,
  ): Promise<SkillsManagerV1UpdateResult>;

  /**
   * Deletes a skill by its ID.
   */
  delete(
    params: SkillsManagerV1DeleteParams,
  ): Promise<SkillsManagerV1DeleteResult>;
}
