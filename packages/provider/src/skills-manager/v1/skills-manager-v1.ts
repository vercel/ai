import { SharedV3ProviderOptions } from '../../shared/v3/shared-v3-provider-options';
import { SharedV3Warning } from '../../shared/v3/shared-v3-warning';

export interface SkillsManagerV1File {
  path: string;
  content: string | Uint8Array;
}

export interface SkillsManagerV1Skill {
  id: string;
  displayTitle?: string;
  name?: string;
  description?: string;
  source: 'user' | 'provider';
  createdAt: Date;
  updatedAt: Date;
}

export interface SkillsManagerV1CreateParams {
  files: SkillsManagerV1File[];
  displayTitle?: string;
  providerOptions?: SharedV3ProviderOptions;
}

export interface SkillsManagerV1CreateResult {
  skill: SkillsManagerV1Skill;
  warnings: SharedV3Warning[];
}

export interface SkillsManagerV1ListParams {
  providerOptions?: SharedV3ProviderOptions;
}

export interface SkillsManagerV1ListResult {
  skills: SkillsManagerV1Skill[];
  warnings: SharedV3Warning[];
}

export interface SkillsManagerV1RetrieveParams {
  skillId: string;
  providerOptions?: SharedV3ProviderOptions;
}

export interface SkillsManagerV1RetrieveResult {
  skill: SkillsManagerV1Skill;
  warnings: SharedV3Warning[];
}

export interface SkillsManagerV1UpdateParams {
  skillId: string;
  files: SkillsManagerV1File[];
  providerOptions?: SharedV3ProviderOptions;
}

export interface SkillsManagerV1UpdateResult {
  skill: SkillsManagerV1Skill;
  warnings: SharedV3Warning[];
}

export interface SkillsManagerV1DeleteParams {
  skillId: string;
  providerOptions?: SharedV3ProviderOptions;
}

export interface SkillsManagerV1DeleteResult {
  warnings: SharedV3Warning[];
}

export interface SkillsManagerV1 {
  readonly specificationVersion: 'v1';
  readonly provider: string;

  create(
    params: SkillsManagerV1CreateParams,
  ): Promise<SkillsManagerV1CreateResult>;

  list(params?: SkillsManagerV1ListParams): Promise<SkillsManagerV1ListResult>;

  retrieve(
    params: SkillsManagerV1RetrieveParams,
  ): Promise<SkillsManagerV1RetrieveResult>;

  update(
    params: SkillsManagerV1UpdateParams,
  ): Promise<SkillsManagerV1UpdateResult>;

  delete(
    params: SkillsManagerV1DeleteParams,
  ): Promise<SkillsManagerV1DeleteResult>;
}
