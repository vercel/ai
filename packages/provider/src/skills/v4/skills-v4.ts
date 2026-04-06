import { SharedV4ProviderOptions } from '../../shared/v4/shared-v4-provider-options';
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

export interface SkillsV4Skill {
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
}

export interface SkillsV4CreateParams {
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

export interface SkillsV4CreateResult {
  /**
   * The created skill.
   */
  skill: SkillsV4Skill;

  /**
   * Warnings for the call, e.g. unsupported settings.
   */
  warnings: SharedV4Warning[];
}

export interface SkillsV4ListParams {
  /**
   * Additional provider-specific options.
   */
  providerOptions?: SharedV4ProviderOptions;
}

export interface SkillsV4ListResult {
  /**
   * The list of skills.
   */
  skills: SkillsV4Skill[];

  /**
   * Warnings for the call, e.g. unsupported settings.
   */
  warnings: SharedV4Warning[];
}

export interface SkillsV4RetrieveParams {
  /**
   * The ID of the skill to retrieve.
   */
  skillId: string;

  /**
   * Additional provider-specific options.
   */
  providerOptions?: SharedV4ProviderOptions;
}

export interface SkillsV4RetrieveResult {
  /**
   * The retrieved skill.
   */
  skill: SkillsV4Skill;

  /**
   * Warnings for the call, e.g. unsupported settings.
   */
  warnings: SharedV4Warning[];
}

export interface SkillsV4UpdateParams {
  /**
   * The ID of the skill to update.
   */
  skillId: string;

  /**
   * The updated files that make up the skill.
   */
  files: SkillsV4File[];

  /**
   * Additional provider-specific options.
   */
  providerOptions?: SharedV4ProviderOptions;
}

export interface SkillsV4UpdateResult {
  /**
   * The updated skill.
   */
  skill: SkillsV4Skill;

  /**
   * Warnings for the call, e.g. unsupported settings.
   */
  warnings: SharedV4Warning[];
}

export interface SkillsV4DeleteParams {
  /**
   * The ID of the skill to delete.
   */
  skillId: string;

  /**
   * Additional provider-specific options.
   */
  providerOptions?: SharedV4ProviderOptions;
}

export interface SkillsV4DeleteResult {
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
   * Creates a new skill from the given files.
   */
  create(params: SkillsV4CreateParams): Promise<SkillsV4CreateResult>;

  /**
   * Lists all available skills.
   */
  list(params?: SkillsV4ListParams): Promise<SkillsV4ListResult>;

  /**
   * Retrieves a skill by its ID.
   */
  retrieve(params: SkillsV4RetrieveParams): Promise<SkillsV4RetrieveResult>;

  /**
   * Updates an existing skill with new files.
   */
  update(params: SkillsV4UpdateParams): Promise<SkillsV4UpdateResult>;

  /**
   * Deletes a skill by its ID.
   */
  delete(params: SkillsV4DeleteParams): Promise<SkillsV4DeleteResult>;
}
