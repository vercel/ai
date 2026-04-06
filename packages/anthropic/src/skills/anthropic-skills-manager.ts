import { SkillsV4, SkillsV4Skill, SharedV4Warning } from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  createJsonResponseHandler,
  FetchFunction,
  getFromApi,
  postFormDataToApi,
  Resolvable,
  resolve,
} from '@ai-sdk/provider-utils';
import { anthropicFailedResponseHandler } from '../anthropic-error';
import {
  AnthropicSkillResponse,
  anthropicSkillResponseSchema,
  anthropicSkillVersionResponseSchema,
} from './anthropic-skills-api';

interface AnthropicSkillsManagerConfig {
  provider: string;
  baseURL: string;
  headers: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
}

export class AnthropicSkillsManager implements SkillsV4 {
  readonly specificationVersion = 'v4';

  get provider(): string {
    return this.config.provider;
  }

  constructor(private readonly config: AnthropicSkillsManagerConfig) {}

  private async getHeaders(): Promise<Record<string, string | undefined>> {
    return combineHeaders(await resolve(this.config.headers), {
      'anthropic-beta': 'skills-2025-10-02',
    });
  }

  /*
   * Anthropic's skill response does not include `name` or `description`.
   * These fields are only available on the version object, so we fetch
   * the latest version to enrich the skill metadata.
   */
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
    params: Parameters<SkillsV4['create']>[0],
  ): Promise<Awaited<ReturnType<SkillsV4['create']>>> {
    const warnings: SharedV4Warning[] = [];

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
}

function mapAnthropicSkill(
  response: Pick<
    AnthropicSkillResponse,
    'id' | 'display_title' | 'name' | 'description' | 'source'
  >,
  versionMetadata?: { name?: string; description?: string },
): SkillsV4Skill {
  const name = versionMetadata?.name ?? response.name;
  const description = versionMetadata?.description ?? response.description;
  return {
    id: response.id,
    ...(response.display_title != null && {
      displayTitle: response.display_title,
    }),
    ...(name != null && { name }),
    ...(description != null && { description }),
    source: mapAnthropicSource(response.source),
  };
}

function mapAnthropicSource(source: string): SkillsV4Skill['source'] {
  switch (source) {
    case 'anthropic':
      return 'provider';
    default:
      return 'user';
  }
}
