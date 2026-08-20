import { describe, expect, it } from 'vitest';
import {
  codeExecution,
  createSpaceXAI,
  createXai,
  imageGeneration,
  mcpServer,
  spacexai,
  spacexaiTools,
  VERSION,
  viewImage,
  viewXVideo,
  webSearch,
  xai,
  xaiTools,
  xSearch,
} from './index';

describe('@ai-sdk/xai', () => {
  it('preserves the legacy provider identifiers', () => {
    const provider = createXai({ apiKey: 'test-api-key' });

    expect({
      responses: provider('grok-4').provider,
      chat: provider.chat('grok-4').provider,
      image: provider.image('grok-imagine-image').provider,
      video: provider.video('grok-imagine-video').provider,
      realtime: provider.experimental_realtime('grok-voice').provider,
      speech: provider.speech().provider,
      transcription: provider.transcription().provider,
      files: provider.files().provider,
    }).toEqual({
      responses: 'xai.responses',
      chat: 'xai.chat',
      image: 'xai.image',
      video: 'xai.video',
      realtime: 'xai.realtime',
      speech: 'xai.speech',
      transcription: 'xai.transcription',
      files: 'xai.files',
    });
  });

  it('preserves the legacy provider-defined tool identifiers', () => {
    expect({
      codeExecution: codeExecution().id,
      fileSearch: xaiTools.fileSearch({ vectorStoreIds: ['store-1'] }).id,
      imageGeneration: imageGeneration().id,
      mcpServer: mcpServer({ serverUrl: 'https://mcp.example.com' }).id,
      viewImage: viewImage().id,
      viewXVideo: viewXVideo().id,
      webSearch: webSearch().id,
      xSearch: xSearch().id,
    }).toEqual({
      codeExecution: 'xai.code_execution',
      fileSearch: 'xai.file_search',
      imageGeneration: 'xai.image_generation',
      mcpServer: 'xai.mcp',
      viewImage: 'xai.view_image',
      viewXVideo: 'xai.view_x_video',
      webSearch: 'xai.web_search',
      xSearch: 'xai.x_search',
    });
  });

  it('preserves the legacy package user-agent', async () => {
    let requestHeaders: Headers | undefined;
    const provider = createXai({
      apiKey: 'test-api-key',
      fetch: async (
        _url: Parameters<typeof globalThis.fetch>[0],
        init?: Parameters<typeof globalThis.fetch>[1],
      ) => {
        requestHeaders = new Headers(init?.headers);
        return new Response(
          JSON.stringify({ data: [{ b64_json: 'dGVzdA==' }] }),
          {
            headers: { 'content-type': 'application/json' },
            status: 200,
          },
        );
      },
    });

    await provider.image('grok-imagine-image').doGenerate({
      prompt: 'A test image',
      files: undefined,
      mask: undefined,
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      providerOptions: {},
    });

    expect(requestHeaders?.get('user-agent')).toContain(
      `ai-sdk/xai/${VERSION}`,
    );
    expect(requestHeaders?.get('user-agent')).not.toContain('ai-sdk/spacexai/');
  });

  it('keeps the new spacexai exports on the new identity', () => {
    expect(createSpaceXAI).not.toBe(createXai);
    expect(xai).not.toBe(spacexai);
    expect(spacexai('grok-4').provider).toBe('spacexai.responses');
    expect(spacexaiTools.webSearch().id).toBe('spacexai.web_search');
  });
});
