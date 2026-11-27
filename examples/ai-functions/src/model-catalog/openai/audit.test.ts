import { openaiModelCatalog } from '@ai-sdk/openai/internal';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  capabilityCells,
  matchesRequest,
  uncoveredCapabilities,
  type Reporter,
} from './audit';
import { compareModelPage, parseModelPage } from './check-docs';
import { checkLive } from './check-live';
import { languageProbes } from './language-probes';
import { allProbes } from './probes';
import { mediaProbes } from './media-probes';

beforeEach(() => {
  vi.stubEnv('OPENAI_API_KEY', 'test-api-key');
  vi.stubGlobal('AI_SDK_LOG_WARNINGS', false);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const page = `# Model
Model ID: \`gpt-6.2-astra\`
## Model details
- Input modalities: text, image
- Reasoning token support
## Supported features
- structured_outputs
- function_calling
- streaming
- future_feature
## Unsupported features
- fine_tuning
## Supported tools
- web_search
- future_tool
## Endpoints
| Endpoint | Route | Support |
| --- | --- | --- |
| Responses | \`v1/responses\` | Supported |
`;

describe('model documentation audit', () => {
  it('reports every unrepresented feature and tool, including unsupported ones', () => {
    const report = vi.fn<Reporter>();
    compareModelPage(
      'gpt-6.2-astra',
      openaiModelCatalog['gpt-6.2-astra'],
      page,
      report,
    );
    expect(
      report.mock.calls
        .filter(([status]) => status === 'MISSING')
        .map(call => call[2]),
    ).toEqual([
      'docs/feature/streaming',
      'docs/feature/future_feature',
      'docs/feature/fine_tuning',
      'docs/tool/web_search',
      'docs/tool/future_tool',
    ]);
    expect(
      report.mock.calls.find(
        call => call[2] === 'docs/feature/fine_tuning',
      )?.[3],
    ).toContain('OpenAI docs=unsupported');
    expect(
      report.mock.calls.find(
        call => call[2] === 'docs/feature/structured_outputs',
      )?.[0],
    ).toBe('MATCH');
  });
  it('does not infer that an omitted feature is unsupported', () => {
    const parsed = parseModelPage('gpt-6.2-astra', page);
    expect(parsed.features.get('prompt_caching')).toBeUndefined();
    expect(parsed.features.get('fine_tuning')).toBe(false);
  });
  it('rejects another model page and contradictory declarations', () => {
    expect(() => parseModelPage('gpt-4.1', page)).toThrow('Expected Model ID');
    expect(() =>
      parseModelPage(
        'gpt-6.2-astra',
        page.replace('- fine_tuning', '- structured_outputs'),
      ),
    ).toThrow('Conflicting features');
  });
  it('reports a catalog discrepancy rather than treating absence as false', () => {
    const report = vi.fn<Reporter>();
    compareModelPage(
      'gpt-5-chat-latest',
      openaiModelCatalog['gpt-5-chat-latest'],
      page.replace('gpt-6.2-astra', 'gpt-5-chat-latest'),
      report,
    );
    expect(
      report.mock.calls.find(
        call => call[2] === 'docs/feature/structured_outputs',
      )?.[0],
    ).toBe('MISMATCH');
  });
});

describe('complete capability coverage', () => {
  it('registers probes for EVERY capability of EVERY catalog entry', async () => {
    for (const [id, entry] of Object.entries(openaiModelCatalog)) {
      const probes = await allProbes(id, entry);
      const covered = new Set(probes.flatMap(probe => [...probe.covers]));
      expect(uncoveredCapabilities(entry, covered), id).toEqual([]);
    }
  });
  it('keeps conditional cells and lists intact and detects future fields', () => {
    expect(
      capabilityCells({
        efforts: ['none', 'low'],
        temperature: { condition: 'Only with none.' },
        future: true,
      }),
    ).toEqual([
      ['efforts', ['none', 'low']],
      ['temperature', { condition: 'Only with none.' }],
      ['future', true],
    ]);
  });
  it('fails when a new catalog capability has no registered SDK probe', async () => {
    const entry = {
      ...openaiModelCatalog['gpt-6.2-astra'],
      capabilities: {
        ...openaiModelCatalog['gpt-6.2-astra'].capabilities,
        futureCapability: true,
      },
    };
    await expect(allProbes('gpt-6.2-astra', entry)).rejects.toThrow(
      'futureCapability',
    );
  });
  it('includes unsupported efforts and none+sampling combinations', async () => {
    const probes = await languageProbes(
      'gpt-6.2-astra',
      openaiModelCatalog['gpt-6.2-astra'],
    );
    expect(
      probes.find(probe => probe.name === 'responses/reasoningEfforts/none')
        ?.expected,
    ).toBe(false);
    const sampling = probes.filter(probe =>
      probe.name.startsWith('responses/samplingAtReasoningEffortNone/'),
    );
    expect(sampling).toHaveLength(3);
    expect(sampling.every(probe => probe.expected === false)).toBe(true);
    const temperature = sampling.find(probe =>
      probe.name.includes('temperature'),
    )!;
    expect(matchesRequest('{"temperature":0.5}', temperature.sent)).toBe(false);
    expect(
      matchesRequest(
        '{"temperature":0.5,"reasoning":{"effort":"none"}}',
        temperature.sent,
      ),
    ).toBe(true);
  });
});

describe('SDK probes with independent API evidence', () => {
  it('sends an image count above the catalog limit in ONE provider API call', async () => {
    const modelId = 'dall-e-3';
    const probe = mediaProbes(modelId, openaiModelCatalog[modelId]).find(
      probe => probe.name === 'image/maxImagesPerCall/n=2',
    )!;
    const report = vi.fn<Reporter>();
    const fetchAPI = vi.fn<typeof fetch>(async (_url, init) => {
      expect(init?.body).toContain('"n":2');
      return Response.json(
        {
          error: {
            message: 'n must be 1 for this model.',
            param: 'n',
            type: 'invalid_request_error',
            code: 'invalid_value',
          },
        },
        { status: 400 },
      );
    });
    await checkLive(modelId, probe, report, fetchAPI);
    expect(fetchAPI).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0][0]).toBe('MATCH');
  });
  it.each([false, true])(
    'tests API async support even when the target catalog blocks it (API supports=%s)',
    async supported => {
      const modelId = 'gpt-4.1-mini';
      const probe = (
        await languageProbes(modelId, openaiModelCatalog[modelId])
      ).find(probe => probe.name === 'responses/asyncTools')!;
      const report = vi.fn<Reporter>();
      const fetchAPI = vi.fn<typeof fetch>(async (_url, init) => {
        expect(init?.body).toContain(`"model":"${modelId}"`);
        expect(init?.body).toContain('"async":true');
        if (!supported)
          return Response.json(
            {
              error: {
                message: 'Async tools are not supported with gpt-4.1-mini.',
                type: 'invalid_request_error',
                param: 'tools[0].async',
                code: 'unsupported_parameter',
              },
            },
            { status: 400 },
          );
        return Response.json({
          id: 'resp_test',
          model: modelId,
          created_at: 1,
          status: 'completed',
          output: [
            {
              type: 'function_call',
              id: 'fc_test',
              call_id: 'call_test',
              name: 'report',
              arguments: '{"ok":true}',
              status: 'completed',
            },
          ],
          usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
        });
      });
      await checkLive(modelId, probe, report, fetchAPI);
      expect(fetchAPI).toHaveBeenCalledTimes(1);
      expect(report).toHaveBeenCalledWith(
        supported ? 'MISMATCH' : 'MATCH',
        modelId,
        'live/responses/asyncTools',
        expect.stringContaining(`API target=${modelId}`),
      );
    },
  );
  it('keeps model access failures unverified', async () => {
    const modelId = 'gpt-6.2-astra';
    const probe = (
      await languageProbes(modelId, openaiModelCatalog[modelId])
    ).find(probe => probe.name === 'responses/reasoning')!;
    const report = vi.fn<Reporter>();
    await checkLive(modelId, probe, report, async () =>
      Response.json(
        {
          error: {
            message: 'You do not have access to this model.',
            type: 'invalid_request_error',
            code: 'model_not_found',
          },
        },
        { status: 404 },
      ),
    );
    expect(report.mock.calls[0][0]).toBe('UNVERIFIED');
  });
  it('uses the API error parameter when the rejection message only names the value', async () => {
    const modelId = 'gpt-6.2-astra';
    const probe = (
      await languageProbes(modelId, openaiModelCatalog[modelId])
    ).find(probe => probe.name === 'responses/reasoningEfforts/none')!;
    const report = vi.fn<Reporter>();
    await checkLive(modelId, probe, report, async () =>
      Response.json(
        {
          error: {
            message:
              "Unsupported value: 'none' is not supported with this model.",
            param: 'reasoning.effort',
            type: 'invalid_request_error',
            code: 'unsupported_value',
          },
        },
        { status: 400 },
      ),
    );
    expect(report.mock.calls[0][0]).toBe('MATCH');
  });
  it('never calls the API when either part of a combination was omitted', async () => {
    const modelId = 'gpt-6.2-astra';
    const probe = (
      await languageProbes(modelId, openaiModelCatalog[modelId])
    ).find(probe => probe.name === 'responses/sampling/temperature/low')!;
    const report = vi.fn<Reporter>();
    const fetchAPI = vi.fn<typeof fetch>();
    await checkLive(modelId, probe, report, fetchAPI);
    expect(fetchAPI).not.toHaveBeenCalled();
    expect(report.mock.calls[0][0]).toBe('UNVERIFIED');
  });
});
