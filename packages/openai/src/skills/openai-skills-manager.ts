import { SkillsV4, SkillsV4Skill, SharedV4Warning } from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  createJsonResponseHandler,
  FetchFunction,
  postFormDataToApi,
} from '@ai-sdk/provider-utils';
import { openaiFailedResponseHandler } from '../openai-error';
import {
  OpenAISkillResponse,
  openaiSkillResponseSchema,
} from './openai-skills-api';

interface OpenAISkillsManagerConfig {
  provider: string;
  url: (options: { path: string }) => string;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
}

export class OpenAISkillsManager implements SkillsV4 {
  readonly specificationVersion = 'v4';

  get provider(): string {
    return this.config.provider;
  }

  constructor(private readonly config: OpenAISkillsManagerConfig) {}

  async create(
    params: Parameters<SkillsV4['create']>[0],
  ): Promise<Awaited<ReturnType<SkillsV4['create']>>> {
    const warnings: SharedV4Warning[] = [];

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
}

function mapOpenAISkill(
  response: Pick<OpenAISkillResponse, 'id' | 'name' | 'description'>,
): SkillsV4Skill {
  return {
    id: response.id,
    ...(response.name != null && { name: response.name }),
    ...(response.description != null && { description: response.description }),
    source: 'user',
  };
}
