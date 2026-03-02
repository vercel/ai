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
  OpenAISkillResponse,
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
   * Update creates a new version, then promotes it to the default version.
   * OpenAI does not auto-promote new versions, so without the explicit
   * promote call the skill-level name/description remain stale and
   * inference continues using the old version.
   *
   * The promote endpoint (POST /skills/{id}) may fail with a 404 if the
   * newly created version has not yet propagated. When that happens, the
   * method retries with exponential backoff.
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

    const { value: skillResponse } = await promoteVersionWithRetry({
      url: this.config.url({ path: `/skills/${params.skillId}` }),
      headers,
      version: versionResponse.version ?? '1',
      failedResponseHandler: openaiFailedResponseHandler,
      fetch: this.config.fetch,
    });

    return {
      skill: mapOpenAISkill(skillResponse),
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

const PROMOTE_MAX_RETRIES = 5;
const PROMOTE_INITIAL_DELAY_MS = 2000;

async function promoteVersionWithRetry({
  url,
  headers,
  version,
  failedResponseHandler,
  fetch,
}: {
  url: string;
  headers: Record<string, string | undefined>;
  version: string;
  failedResponseHandler: typeof openaiFailedResponseHandler;
  fetch?: FetchFunction;
}) {
  for (let attempt = 0; attempt <= PROMOTE_MAX_RETRIES; attempt++) {
    try {
      return await postJsonToApi({
        url,
        headers,
        body: { default_version: version },
        failedResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(
          openaiSkillResponseSchema,
        ),
        fetch,
      });
    } catch (error: unknown) {
      const isRetryable =
        error instanceof Error &&
        'statusCode' in error &&
        (error as { statusCode: number }).statusCode === 404;

      if (!isRetryable || attempt === PROMOTE_MAX_RETRIES) {
        throw error;
      }

      await new Promise(resolve =>
        setTimeout(resolve, PROMOTE_INITIAL_DELAY_MS * 2 ** attempt),
      );
    }
  }

  throw new Error('Unreachable');
}

function mapOpenAISkill(
  response: Pick<OpenAISkillResponse, 'id' | 'name' | 'description'>,
): Experimental_SkillsManagerV1Skill {
  return {
    id: response.id,
    ...(response.name != null && { name: response.name }),
    ...(response.description != null && { description: response.description }),
    source: 'user',
  };
}
