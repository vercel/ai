---
title: generateVideo
description: API Reference for durable video generation in workflows.
---

# `generateVideo()`

Generates videos durably inside a workflow. The helper starts an asynchronous
video generation job with a Workflow webhook URL, suspends the workflow until
the provider sends a terminal notification, and then retrieves the completed
result with one status request.

Unlike [`experimental_generateVideo`](/docs/reference/ai-sdk-core/generate-video)
from `ai`, this helper does not download provider-hosted videos. URL results
remain URLs so your workflow can decide whether to persist, copy, or process
them in another step without serializing the video bytes through workflow step
boundaries.

```ts
import { experimental_generateVideo as generateVideo } from '@ai-sdk/workflow/video';

export async function videoWorkflow(prompt: string) {
  'use workflow';

  // The workflow suspends while the video renders, consuming no compute.
  const result = await generateVideo({
    model: 'klingai/kling-v3.0-t2v',
    prompt,
  });

  return result.videos;
}
```

The selected model must support asynchronous start and status operations and
provider webhooks. The helper must be called from a Workflow SDK workflow.

## Import

<Snippet
  text={`import { experimental_generateVideo as generateVideo } from "@ai-sdk/workflow/video"`}
  prompt={false}
/>

## Parameters

The helper accepts the same parameters as `experimental_startVideo` from `ai`,
except `webhookUrl` and `abortSignal`. It creates and manages the webhook URL.

<PropertiesTable
  content={[
    {
      name: 'model',
      type: 'VideoModel',
      isRequired: true,
      description:
        'The asynchronous video model to use. A string compatible with Vercel AI Gateway or a serializable provider model.',
    },
    {
      name: 'prompt',
      type: 'string | GenerateVideoPrompt',
      isRequired: true,
      description: 'The prompt or image prompt used to generate the video.',
    },
    {
      name: 'n',
      type: 'number',
      isOptional: true,
      description: 'Number of videos to generate. Default: 1.',
    },
    {
      name: 'aspectRatio',
      type: '`${number}:${number}` | "adaptive"',
      isOptional: true,
      description: 'Aspect ratio of the generated videos.',
    },
    {
      name: 'resolution',
      type: '`${number}x${number}`',
      isOptional: true,
      description: 'Resolution of the generated videos.',
    },
    {
      name: 'duration',
      type: 'number',
      isOptional: true,
      description: 'Duration of each generated video in seconds.',
    },
    {
      name: 'maxVideosPerCall',
      type: 'number',
      isOptional: true,
      description: 'Maximum number of videos that may be started in one call.',
    },
    {
      name: 'fps',
      type: 'number',
      isOptional: true,
      description: 'Frames per second for the generated videos.',
    },
    {
      name: 'seed',
      type: 'number',
      isOptional: true,
      description: 'Seed used for deterministic generation when supported.',
    },
    {
      name: 'frameImages',
      type: 'Array<{ image: DataContent; frameType: VideoModelV4FrameType }>',
      isOptional: true,
      description: 'Role-tagged first and last frame images.',
    },
    {
      name: 'inputReferences',
      type: 'Array<DataContent | { data: DataContent; mediaType?: string }>',
      isOptional: true,
      description: 'Reference images or videos for the generation.',
    },
    {
      name: 'generateAudio',
      type: 'boolean',
      isOptional: true,
      description: 'Whether to generate audio with the video.',
    },
    {
      name: 'providerOptions',
      type: 'ProviderOptions',
      isOptional: true,
      description: 'Additional provider-specific options.',
    },
    {
      name: 'headers',
      type: 'Record<string, string>',
      isOptional: true,
      description: 'Additional HTTP headers for start and status requests.',
    },
    {
      name: 'maxRetries',
      type: 'number',
      isOptional: true,
      description:
        'Maximum number of AI SDK retries for each start and status request. Default: 2.',
    },
  ]}
/>

## Returns

Returns the completed status result from the provider. `videos` contains raw
provider video data discriminated by `type`:

- `url`: A provider-hosted URL and media type
- `base64`: Base64-encoded video data and media type
- `binary`: A `Uint8Array` and media type

Hosted URLs can expire. Handle any video you need to retain in a separate
workflow step.
