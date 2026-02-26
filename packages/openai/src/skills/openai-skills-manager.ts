import {
  SkillsManagerV1,
  SkillsManagerV1CreateParams,
  SkillsManagerV1CreateResult,
  SkillsManagerV1DeleteParams,
  SkillsManagerV1DeleteResult,
  SkillsManagerV1ListParams,
  SkillsManagerV1ListResult,
  SkillsManagerV1RetrieveParams,
  SkillsManagerV1RetrieveResult,
  SkillsManagerV1Skill,
  SkillsManagerV1UpdateParams,
  SkillsManagerV1UpdateResult,
  SharedV3Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  createJsonResponseHandler,
  deleteFromApi,
  FetchFunction,
  getFromApi,
  postFormDataToApi,
} from '@ai-sdk/provider-utils';
import { openaiFailedResponseHandler } from '../openai-error';
import {
  openaiSkillDeleteResponseSchema,
  openaiSkillListResponseSchema,
  openaiSkillResponseSchema,
  openaiSkillVersionListResponseSchema,
  openaiSkillVersionResponseSchema,
} from './openai-skills-api';

interface OpenAISkillsManagerConfig {
  provider: string;
  url: (options: { path: string }) => string;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
}

export class OpenAISkillsManager implements SkillsManagerV1 {
  readonly specificationVersion = 'v1';

  get provider(): string {
    return this.config.provider;
  }

  constructor(private readonly config: OpenAISkillsManagerConfig) {}

  private async fetchLatestVersionMetadata({
    skillId,
    headers,
  }: {
    skillId: string;
    headers: Record<string, string | undefined>;
  }): Promise<{ name?: string; description?: string }> {
    const { value: response } = await getFromApi({
      url: `${this.config.url({ path: `/skills/${skillId}/versions` })}?order=desc&limit=1`,
      headers,
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        openaiSkillVersionListResponseSchema,
      ),
      fetch: this.config.fetch,
    });

    const latest = response.data[0];
    if (latest == null) {
      return {};
    }

    return {
      ...(latest.name != null && { name: latest.name }),
      ...(latest.description != null && { description: latest.description }),
    };
  }

  async create(
    params: SkillsManagerV1CreateParams,
  ): Promise<SkillsManagerV1CreateResult> {
    const warnings: SharedV3Warning[] = [];

    if (params.displayTitle != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'displayTitle',
      });
    }

    const formData = new FormData();

    for (const file of params.files) {
      const content =
        typeof file.content === 'string'
          ? convertBase64ToUint8Array(file.content)
          : file.content;

      formData.append('files[]', new Blob([content]), file.path);
    }

    const headers = combineHeaders(this.config.headers());

    const { value: response } = await postFormDataToApi({
      url: this.config.url({ path: '/skills' }),
      headers,
      formData,
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        openaiSkillResponseSchema,
      ),
      fetch: this.config.fetch,
    });

    const versionMetadata = await this.fetchLatestVersionMetadata({
      skillId: response.id,
      headers,
    });

    return {
      skill: mapOpenAISkill(response, versionMetadata),
      warnings,
    };
  }

  // TODO: Add auto-pagination support to fetch beyond the initial 100 skills.
  async list(
    _params?: SkillsManagerV1ListParams,
  ): Promise<SkillsManagerV1ListResult> {
    const { value: response } = await getFromApi({
      url: `${this.config.url({ path: '/skills' })}?limit=100`,
      headers: combineHeaders(this.config.headers()),
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        openaiSkillListResponseSchema,
      ),
      fetch: this.config.fetch,
    });

    return {
      skills: response.data.map(skill => mapOpenAISkill(skill)),
      warnings: [],
    };
  }

  async retrieve(
    params: SkillsManagerV1RetrieveParams,
  ): Promise<SkillsManagerV1RetrieveResult> {
    const headers = combineHeaders(this.config.headers());

    const { value: response } = await getFromApi({
      url: this.config.url({ path: `/skills/${params.skillId}` }),
      headers,
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        openaiSkillResponseSchema,
      ),
      fetch: this.config.fetch,
    });

    const versionMetadata = await this.fetchLatestVersionMetadata({
      skillId: params.skillId,
      headers,
    });

    return {
      skill: mapOpenAISkill(response, versionMetadata),
      warnings: [],
    };
  }

  async update(
    params: SkillsManagerV1UpdateParams,
  ): Promise<SkillsManagerV1UpdateResult> {
    const formData = new FormData();

    for (const file of params.files) {
      const content =
        typeof file.content === 'string'
          ? convertBase64ToUint8Array(file.content)
          : file.content;

      formData.append('files[]', new Blob([content]), file.path);
    }

    const headers = combineHeaders(this.config.headers());

    const { value: versionResponse } = await postFormDataToApi({
      url: this.config.url({ path: `/skills/${params.skillId}/versions` }),
      headers,
      formData,
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        openaiSkillVersionResponseSchema,
      ),
      fetch: this.config.fetch,
    });

    const { value: skillResponse } = await getFromApi({
      url: this.config.url({ path: `/skills/${params.skillId}` }),
      headers,
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        openaiSkillResponseSchema,
      ),
      fetch: this.config.fetch,
    });

    return {
      skill: mapOpenAISkill(skillResponse, {
        ...(versionResponse.name != null && { name: versionResponse.name }),
        ...(versionResponse.description != null && {
          description: versionResponse.description,
        }),
      }),
      warnings: [],
    };
  }

  async delete(
    params: SkillsManagerV1DeleteParams,
  ): Promise<SkillsManagerV1DeleteResult> {
    await deleteFromApi({
      url: this.config.url({ path: `/skills/${params.skillId}` }),
      headers: combineHeaders(this.config.headers()),
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        openaiSkillDeleteResponseSchema,
      ),
      fetch: this.config.fetch,
    });

    return {
      warnings: [],
    };
  }
}

function mapOpenAISkill(
  response: {
    id: string;
    name?: string | null;
    description?: string | null;
    created_at: number;
    updated_at?: number | null;
  },
  versionMetadata?: { name?: string; description?: string },
): SkillsManagerV1Skill {
  const name = versionMetadata?.name ?? response.name;
  const description = versionMetadata?.description ?? response.description;
  return {
    id: response.id,
    ...(name != null && { name }),
    ...(description != null && { description }),
    source: 'upload',
    createdAt: new Date(response.created_at * 1000),
    updatedAt: new Date((response.updated_at ?? response.created_at) * 1000),
  };
}
