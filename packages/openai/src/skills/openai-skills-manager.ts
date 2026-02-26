import {
  Experimental_SkillsManagerV1,
  Experimental_SkillsManagerV1Skill,
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
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { openaiFailedResponseHandler } from '../openai-error';
import {
  openaiSkillDeleteResponseSchema,
  openaiSkillListResponseSchema,
  openaiSkillResponseSchema,
  openaiSkillVersionResponseSchema,
} from './openai-skills-api';

interface OpenAISkillsManagerConfig {
  provider: string;
  url: (options: { path: string }) => string;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
}

export class OpenAISkillsManager implements Experimental_SkillsManagerV1 {
  readonly specificationVersion = 'v1';

  get provider(): string {
    return this.config.provider;
  }

  constructor(private readonly config: OpenAISkillsManagerConfig) {}

  /*
   * Unlike Anthropic, OpenAI returns name and description directly on the
   * skill response, so no version enrichment is needed for create/retrieve.
   * OpenAI's version list/retrieve endpoints are currently non-functional
   * (list returns empty, retrieve returns 404).
   */
  async create(
    params: Parameters<Experimental_SkillsManagerV1['create']>[0],
  ): Promise<Awaited<ReturnType<Experimental_SkillsManagerV1['create']>>> {
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

    const { value: response } = await postFormDataToApi({
      url: this.config.url({ path: '/skills' }),
      headers: combineHeaders(this.config.headers()),
      formData,
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        openaiSkillResponseSchema,
      ),
      fetch: this.config.fetch,
    });

    return {
      skill: mapOpenAISkill(response),
      warnings,
    };
  }

  // TODO: Add auto-pagination support to fetch beyond the initial 100 skills.
  async list(
    _params?: Parameters<Experimental_SkillsManagerV1['list']>[0],
  ): Promise<Awaited<ReturnType<Experimental_SkillsManagerV1['list']>>> {
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
    params: Parameters<Experimental_SkillsManagerV1['retrieve']>[0],
  ): Promise<Awaited<ReturnType<Experimental_SkillsManagerV1['retrieve']>>> {
    const { value: response } = await getFromApi({
      url: this.config.url({ path: `/skills/${params.skillId}` }),
      headers: combineHeaders(this.config.headers()),
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        openaiSkillResponseSchema,
      ),
      fetch: this.config.fetch,
    });

    return {
      skill: mapOpenAISkill(response),
      warnings: [],
    };
  }

  /*
   * Update creates a new version, then promotes it to default_version.
   * OpenAI does not auto-promote new versions, so we must explicitly POST
   * to the skill endpoint to set default_version. The version create
   * response contains the freshest name/description (parsed from SKILL.md
   * frontmatter), which may not yet be reflected in the skill response,
   * so we prefer version metadata when mapping.
   */
  async update(
    params: Parameters<Experimental_SkillsManagerV1['update']>[0],
  ): Promise<Awaited<ReturnType<Experimental_SkillsManagerV1['update']>>> {
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

    const { value: skillResponse } = await postJsonToApi({
      url: this.config.url({ path: `/skills/${params.skillId}` }),
      headers,
      body: {
        default_version: versionResponse.version,
      },
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
    params: Parameters<Experimental_SkillsManagerV1['delete']>[0],
  ): Promise<Awaited<ReturnType<Experimental_SkillsManagerV1['delete']>>> {
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
): Experimental_SkillsManagerV1Skill {
  const name = versionMetadata?.name ?? response.name;
  const description = versionMetadata?.description ?? response.description;
  return {
    id: response.id,
    ...(name != null && { name }),
    ...(description != null && { description }),
    source: 'user',
    createdAt: new Date(response.created_at * 1000),
    updatedAt: new Date((response.updated_at ?? response.created_at) * 1000),
  };
}
