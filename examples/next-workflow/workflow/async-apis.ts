import { createFal, type FalVideoModelOptions } from '@ai-sdk/fal';
import { experimental_generateVideo as generateVideo } from 'ai';
import { createWebhook, getWritable, sleep } from 'workflow';

const MAX_GITHUB_SEARCH_PAGES = 10;
const MAX_MAINTAINERS = 3;
const MAX_AVATAR_BYTES = 10 * 1024 * 1024;
const FAL_WEBHOOK_TIMEOUT_MS = 10 * 60 * 1000;
const FAL_VIDEO_MODEL_ID = 'luma-dream-machine/ray-2/image-to-video' as const;
const fal = createFal();

export interface AsyncApisMaintainer {
  login: string;
  profileUrl: string;
  avatarUrl: string;
  mergedPullRequests: number;
}

export interface AsyncApisRepository {
  nameWithOwner: string;
  url: string;
  mergedPullRequests: number;
}

export type AsyncApisProgressUpdate =
  | {
      type: 'status';
      stage: 'loading-repository';
      message: string;
    }
  | {
      type: 'maintainers';
      repository: AsyncApisRepository;
      maintainers: AsyncApisMaintainer[];
    }
  | {
      type: 'avatar';
      status: 'downloading' | 'downloaded';
      maintainer: AsyncApisMaintainer;
    }
  | {
      type: 'video';
      status: 'generating';
      maintainer: AsyncApisMaintainer;
    }
  | {
      type: 'video';
      status: 'completed';
      maintainer: AsyncApisMaintainer;
      videoUrl: string;
      warnings: string[];
    }
  | {
      type: 'complete';
      repository: AsyncApisRepository;
      videoCount: number;
    }
  | {
      type: 'error';
      message: string;
    };

interface DownloadedMaintainer extends AsyncApisMaintainer {
  image: Uint8Array;
  mediaType: string;
}

type FalVideoModel = ReturnType<ReturnType<typeof createFal>['video']>;
type FalVideoStartOptions = Parameters<
  NonNullable<FalVideoModel['doStart']>
>[0];
type FalVideoStatusOptions = Parameters<
  NonNullable<FalVideoModel['doStatus']>
>[0];

interface GitHubSearchResponse {
  data?: {
    repository: {
      nameWithOwner: string;
      url: string;
    } | null;
    search: {
      issueCount: number;
      nodes: Array<{
        mergedAt: string | null;
        mergedBy: {
          __typename: string;
          login: string;
          avatarUrl: string;
          url: string;
        } | null;
      } | null>;
      pageInfo: {
        endCursor: string | null;
        hasNextPage: boolean;
      };
    };
  };
  errors?: Array<{ message: string }>;
}

async function writeProgress(update: AsyncApisProgressUpdate) {
  'use step';

  const writer = getWritable<AsyncApisProgressUpdate>().getWriter();
  try {
    await writer.write(update);
  } finally {
    writer.releaseLock();
  }
}

async function findMaintainers(repositoryUrl: string): Promise<{
  repository: AsyncApisRepository;
  maintainers: AsyncApisMaintainer[];
}> {
  'use step';

  const { owner, name } = parseGitHubRepositoryUrl(repositoryUrl);
  const githubToken = process.env.GITHUB_TOKEN;
  if (githubToken == null || githubToken.length === 0) {
    throw new Error(
      'GITHUB_TOKEN is required to look up recently merged pull requests.',
    );
  }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const query = `repo:${owner}/${name} is:pr is:merged merged:>=${since}`;
  const maintainers = new Map<string, AsyncApisMaintainer>();

  let repository: AsyncApisRepository | undefined;
  let cursor: string | null = null;
  let page = 0;
  let hasNextPage = true;

  while (hasNextPage && page < MAX_GITHUB_SEARCH_PAGES) {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${githubToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'vercel-ai-next-workflow-example',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        query: `
          query RecentMergers(
            $owner: String!
            $name: String!
            $searchQuery: String!
            $cursor: String
          ) {
            repository(owner: $owner, name: $name) {
              nameWithOwner
              url
            }
            search(
              query: $searchQuery
              type: ISSUE
              first: 100
              after: $cursor
            ) {
              issueCount
              nodes {
                ... on PullRequest {
                  mergedAt
                  mergedBy {
                    __typename
                    login
                    avatarUrl
                    url
                  }
                }
              }
              pageInfo {
                endCursor
                hasNextPage
              }
            }
          }
        `,
        variables: {
          owner,
          name,
          searchQuery: query,
          cursor,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(
        `GitHub request failed (${response.status} ${response.statusText}).`,
      );
    }

    const payload = (await response.json()) as GitHubSearchResponse;
    if (payload.errors?.length) {
      throw new Error(payload.errors.map(error => error.message).join('; '));
    }
    if (payload.data == null) {
      throw new Error('GitHub returned an empty response.');
    }
    if (payload.data.repository == null) {
      throw new Error(`GitHub repository ${owner}/${name} was not found.`);
    }

    repository ??= {
      nameWithOwner: payload.data.repository.nameWithOwner,
      url: payload.data.repository.url,
      mergedPullRequests: payload.data.search.issueCount,
    };

    for (const pullRequest of payload.data.search.nodes) {
      if (pullRequest?.mergedAt == null) continue;

      const mergedBy = pullRequest.mergedBy;
      if (mergedBy == null || mergedBy.__typename !== 'User') continue;

      const current = maintainers.get(mergedBy.login);
      maintainers.set(mergedBy.login, {
        login: mergedBy.login,
        profileUrl: mergedBy.url,
        avatarUrl: mergedBy.avatarUrl,
        mergedPullRequests: (current?.mergedPullRequests ?? 0) + 1,
      });
    }

    cursor = payload.data.search.pageInfo.endCursor;
    hasNextPage = payload.data.search.pageInfo.hasNextPage;
    page++;
  }

  if (repository == null) {
    throw new Error(`GitHub repository ${owner}/${name} was not found.`);
  }

  const rankedMaintainers = Array.from(maintainers.values())
    .sort(
      (a, b) =>
        b.mergedPullRequests - a.mergedPullRequests ||
        a.login.localeCompare(b.login),
    )
    .slice(0, MAX_MAINTAINERS);

  if (rankedMaintainers.length === 0) {
    throw new Error(
      `${repository.nameWithOwner} has no pull requests merged by GitHub users in the last 30 days.`,
    );
  }

  return { repository, maintainers: rankedMaintainers };
}

async function downloadAvatar(
  maintainer: AsyncApisMaintainer,
): Promise<DownloadedMaintainer> {
  'use step';

  const avatarUrl = new URL(maintainer.avatarUrl);
  const trustedHost =
    avatarUrl.hostname === 'github.com' ||
    avatarUrl.hostname === 'avatars.githubusercontent.com' ||
    avatarUrl.hostname.endsWith('.githubusercontent.com');
  if (avatarUrl.protocol !== 'https:' || !trustedHost) {
    throw new Error(`Refusing to download an untrusted avatar URL.`);
  }

  const response = await fetch(avatarUrl, {
    headers: { 'User-Agent': 'vercel-ai-next-workflow-example' },
  });
  if (!response.ok) {
    throw new Error(
      `Could not download @${maintainer.login}'s avatar (${response.status}).`,
    );
  }

  const mediaType = response.headers.get('content-type')?.split(';')[0];
  if (mediaType == null || !mediaType.startsWith('image/')) {
    throw new Error(`@${maintainer.login}'s avatar is not an image.`);
  }

  const contentLength = Number(response.headers.get('content-length') ?? '0');
  if (contentLength > MAX_AVATAR_BYTES) {
    throw new Error(`@${maintainer.login}'s avatar is larger than 10 MB.`);
  }

  const image = new Uint8Array(await response.arrayBuffer());
  if (image.byteLength > MAX_AVATAR_BYTES) {
    throw new Error(`@${maintainer.login}'s avatar is larger than 10 MB.`);
  }

  return { ...maintainer, image, mediaType };
}

async function startFalVideo(options: FalVideoStartOptions) {
  'use step';

  return fal.video(FAL_VIDEO_MODEL_ID).doStart!(options);
}

async function getFalVideoStatus(options: FalVideoStatusOptions) {
  'use step';

  return fal.video(FAL_VIDEO_MODEL_ID).doStatus!(options);
}

function createDurableFalVideoModel({
  useWebhook,
}: {
  useWebhook: boolean;
}): FalVideoModel {
  const model = fal.video(FAL_VIDEO_MODEL_ID);

  return {
    specificationVersion: model.specificationVersion,
    provider: model.provider,
    modelId: model.modelId,
    maxVideosPerCall: model.maxVideosPerCall,
    doStart: options => startFalVideo(options),
    doStatus: options => getFalVideoStatus(options),
    ...(useWebhook
      ? {
          handleWebhookOption: async ({ webhook: webhookFactory }) => {
            const { url, received } = await webhookFactory();
            return { webhookUrl: url, received };
          },
        }
      : {}),
  };
}

function waitWithoutSchedulingTimeout(): Promise<void> {
  return new Promise(() => {
    // The durable webhook owns the wait. A competing Workflow sleep would be
    // left uncommitted when the webhook wins the race.
  });
}

async function downloadGeneratedVideo(url: string): Promise<{
  data: Uint8Array;
  mediaType: string | undefined;
}> {
  'use step';

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Could not download generated video (${response.status} ${response.statusText}).`,
    );
  }

  return {
    data: new Uint8Array(await response.arrayBuffer()),
    mediaType: response.headers.get('content-type')?.split(';')[0],
  };
}

async function generateMaintainerVideo(
  maintainer: DownloadedMaintainer,
): Promise<{ videoUrl: string; warnings: string[] }> {
  const useWebhook = canReceiveFalWebhook();
  using webhook = useWebhook ? createWebhook() : undefined;

  const result = await generateVideo({
    model: createDurableFalVideoModel({ useWebhook }),
    prompt: {
      image: maintainer.image,
      text:
        'A natural, friendly close-up portrait. The person smiles warmly, ' +
        'looks into the camera, and gives a small wave with one hand. Keep ' +
        'their identity, facial features, clothing, and background consistent.',
    },
    duration: 5,
    aspectRatio: '9:16',
    providerOptions: {
      fal: {
        resolution: '540p',
      } satisfies FalVideoModelOptions,
    },
    maxRetries: 0,
    poll: {
      delay: useWebhook ? waitWithoutSchedulingTimeout : sleep,
      timeoutMs: FAL_WEBHOOK_TIMEOUT_MS,
    },
    download: ({ url }) => downloadGeneratedVideo(url.toString()),
    webhook:
      webhook == null
        ? undefined
        : async () => ({
            url: webhook.url,
            received: webhook.then(request => ({
              body: null,
              headers: Object.fromEntries(request.headers),
            })),
          }),
  });

  const falMetadata = result.providerMetadata.fal;
  const falVideos =
    falMetadata != null &&
    typeof falMetadata === 'object' &&
    'videos' in falMetadata &&
    Array.isArray(falMetadata.videos)
      ? falMetadata.videos
      : undefined;
  const firstVideo = falVideos?.[0];
  const videoUrl =
    firstVideo != null &&
    typeof firstVideo === 'object' &&
    'url' in firstVideo &&
    typeof firstVideo.url === 'string'
      ? firstVideo.url
      : undefined;
  if (videoUrl == null) {
    throw new Error(`FAL did not return a video URL for @${maintainer.login}.`);
  }

  return {
    videoUrl,
    warnings: result.warnings.map(formatWarning),
  };
}

function canReceiveFalWebhook(): boolean {
  const localBaseUrl = process.env.WORKFLOW_LOCAL_BASE_URL;
  if (localBaseUrl == null || localBaseUrl.length === 0) {
    return process.env.VERCEL === '1';
  }

  try {
    const url = new URL(localBaseUrl);
    const hostname = url.hostname.toLowerCase();
    return (
      url.protocol === 'https:' &&
      hostname !== 'localhost' &&
      hostname !== '127.0.0.1' &&
      hostname !== '::1' &&
      !hostname.endsWith('.localhost')
    );
  } catch {
    return false;
  }
}

export async function createMaintainerVideos(repositoryUrl: string) {
  'use workflow';

  try {
    await writeProgress({
      type: 'status',
      stage: 'loading-repository',
      message: 'Finding pull requests merged during the last 30 days…',
    });

    const { repository, maintainers } = await findMaintainers(repositoryUrl);
    await writeProgress({ type: 'maintainers', repository, maintainers });

    let videoCount = 0;
    for (const maintainer of maintainers) {
      await writeProgress({
        type: 'avatar',
        status: 'downloading',
        maintainer,
      });
      const downloadedMaintainer = await downloadAvatar(maintainer);
      await writeProgress({
        type: 'avatar',
        status: 'downloaded',
        maintainer,
      });

      await writeProgress({
        type: 'video',
        status: 'generating',
        maintainer,
      });
      const video = await generateMaintainerVideo(downloadedMaintainer);
      videoCount++;
      await writeProgress({
        type: 'video',
        status: 'completed',
        maintainer,
        ...video,
      });
    }

    await writeProgress({
      type: 'complete',
      repository,
      videoCount,
    });

    return { repository, maintainers, videoCount };
  } catch (error) {
    await writeProgress({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function parseGitHubRepositoryUrl(repositoryUrl: string): {
  owner: string;
  name: string;
} {
  let url: URL;
  try {
    url = new URL(repositoryUrl);
  } catch {
    throw new Error('Enter a valid GitHub repository URL.');
  }

  const segments = url.pathname.split('/').filter(Boolean);
  if (
    url.hostname.toLowerCase() !== 'github.com' ||
    segments.length !== 2 ||
    !/^[\w.-]+$/.test(segments[0]) ||
    !/^[\w.-]+$/.test(segments[1])
  ) {
    throw new Error(
      'Use a repository URL in the form https://github.com/owner/repository.',
    );
  }

  return {
    owner: segments[0],
    name: segments[1].replace(/\.git$/, ''),
  };
}

function formatWarning(warning: {
  type: string;
  feature?: string;
  setting?: string;
  details?: string;
  message?: string;
}): string {
  const subject = warning.feature ?? warning.setting;
  const message = warning.details ?? warning.message;
  return [subject, message].filter(Boolean).join(': ') || warning.type;
}
