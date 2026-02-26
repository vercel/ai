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
  Resolvable,
  resolve,
} from '@ai-sdk/provider-utils';
import { anthropicFailedResponseHandler } from '../anthropic-error';
import {
  anthropicSkillDeleteResponseSchema,
  anthropicSkillListResponseSchema,
  anthropicSkillResponseSchema,
  anthropicSkillVersionDeleteResponseSchema,
  anthropicSkillVersionListResponseSchema,
  anthropicSkillVersionResponseSchema,
} from './anthropic-skills-api';

interface AnthropicSkillsManagerConfig {
  provider: string;
  baseURL: string;
  headers: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
}

export class AnthropicSkillsManager implements SkillsManagerV1 {
  readonly specificationVersion = 'v1';

  get provider(): string {
    return this.config.provider;
  }

  constructor(private readonly config: AnthropicSkillsManagerConfig) {}

  private async getHeaders(): Promise<Record<string, string | undefined>> {
    return combineHeaders(await resolve(this.config.headers), {
      'anthropic-beta': 'skills-2025-10-02',
    });
  }

  private async fetchVersionMetadata({
    skillId,
    version,
    headers,
  }: {
    skillId: string;
    version: string;
    headers: Record<string, string | undefined>;
  }): Promise<{ name?: string; description?: string }> {
    const { value: versionResponse } = await getFromApi({
      url: `${this.config.baseURL}/skills/${skillId}/versions/${version}`,
      headers,
      failedResponseHandler: anthropicFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        anthropicSkillVersionResponseSchema,
      ),
      fetch: this.config.fetch,
    });

    return {
      ...(versionResponse.name != null && { name: versionResponse.name }),
      ...(versionResponse.description != null && {
        description: versionResponse.description,
      }),
    };
  }

  async create(
    params: SkillsManagerV1CreateParams,
  ): Promise<SkillsManagerV1CreateResult> {
    const warnings: SharedV3Warning[] = [];

    const formData = new FormData();

    if (params.displayTitle != null) {
      formData.append('display_title', params.displayTitle);
    }

    for (const file of params.files) {
      const content =
        typeof file.content === 'string'
          ? convertBase64ToUint8Array(file.content)
          : file.content;

      formData.append('files[]', new Blob([content]), file.path);
    }

    const headers = await this.getHeaders();

    const { value: response } = await postFormDataToApi({
      url: `${this.config.baseURL}/skills`,
      headers,
      formData,
      failedResponseHandler: anthropicFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        anthropicSkillResponseSchema,
      ),
      fetch: this.config.fetch,
    });

    const versionMetadata =
      response.latest_version != null
        ? await this.fetchVersionMetadata({
            skillId: response.id,
            version: response.latest_version,
            headers,
          })
        : {};

    return {
      skill: mapAnthropicSkill(response, versionMetadata),
      warnings,
    };
  }

  /*
   * TODO: Add auto-pagination support to fetch beyond the initial 100 skills.
   * TODO: The Anthropic skill response does not include `name` or
   * `description`. These fields are only available via the versions endpoint.
   * For `list`, fetching the latest version per skill would be expensive.
   * Investigate whether a batch approach or expanded response is possible.
   */
  async list(
    _params?: SkillsManagerV1ListParams,
  ): Promise<SkillsManagerV1ListResult> {
    const { value: response } = await getFromApi({
      url: `${this.config.baseURL}/skills?limit=100`,
      headers: await this.getHeaders(),
      failedResponseHandler: anthropicFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        anthropicSkillListResponseSchema,
      ),
      fetch: this.config.fetch,
    });

    return {
      skills: response.data.map(skill => mapAnthropicSkill(skill)),
      warnings: [],
    };
  }

  async retrieve(
    params: SkillsManagerV1RetrieveParams,
  ): Promise<SkillsManagerV1RetrieveResult> {
    const headers = await this.getHeaders();

    const { value: response } = await getFromApi({
      url: `${this.config.baseURL}/skills/${params.skillId}`,
      headers,
      failedResponseHandler: anthropicFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        anthropicSkillResponseSchema,
      ),
      fetch: this.config.fetch,
    });

    const versionMetadata =
      response.latest_version != null
        ? await this.fetchVersionMetadata({
            skillId: params.skillId,
            version: response.latest_version,
            headers,
          })
        : {};

    return {
      skill: mapAnthropicSkill(response, versionMetadata),
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

    const headers = await this.getHeaders();

    const { value: versionResponse } = await postFormDataToApi({
      url: `${this.config.baseURL}/skills/${params.skillId}/versions`,
      headers,
      formData,
      failedResponseHandler: anthropicFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        anthropicSkillVersionResponseSchema,
      ),
      fetch: this.config.fetch,
    });

    const { value: skillResponse } = await getFromApi({
      url: `${this.config.baseURL}/skills/${params.skillId}`,
      headers,
      failedResponseHandler: anthropicFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        anthropicSkillResponseSchema,
      ),
      fetch: this.config.fetch,
    });

    return {
      skill: mapAnthropicSkill(skillResponse, {
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
    const headers = await this.getHeaders();

    const { value: versionsResponse } = await getFromApi({
      url: `${this.config.baseURL}/skills/${params.skillId}/versions`,
      headers,
      failedResponseHandler: anthropicFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        anthropicSkillVersionListResponseSchema,
      ),
      fetch: this.config.fetch,
    });

    for (const version of versionsResponse.data) {
      await deleteFromApi({
        url: `${this.config.baseURL}/skills/${params.skillId}/versions/${version.version}`,
        headers,
        failedResponseHandler: anthropicFailedResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(
          anthropicSkillVersionDeleteResponseSchema,
        ),
        fetch: this.config.fetch,
      });
    }

    await deleteFromApi({
      url: `${this.config.baseURL}/skills/${params.skillId}`,
      headers,
      failedResponseHandler: anthropicFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        anthropicSkillDeleteResponseSchema,
      ),
      fetch: this.config.fetch,
    });

    return {
      warnings: [],
    };
  }
}

function mapAnthropicSkill(
  response: {
    id: string;
    display_title?: string | null;
    name?: string | null;
    description?: string | null;
    source: string;
    created_at: string;
    updated_at: string;
  },
  versionMetadata?: { name?: string; description?: string },
): SkillsManagerV1Skill {
  const name = response.name ?? versionMetadata?.name;
  const description = response.description ?? versionMetadata?.description;
  return {
    id: response.id,
    ...(response.display_title != null && {
      displayTitle: response.display_title,
    }),
    ...(name != null && { name }),
    ...(description != null && { description }),
    source: response.source,
    createdAt: new Date(response.created_at),
    updatedAt: new Date(response.updated_at),
  };
}
