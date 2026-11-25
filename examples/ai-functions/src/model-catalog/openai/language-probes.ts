import { generateText, Output, streamText, tool, type ModelMessage } from 'ai';
import { readFile } from 'node:fs/promises';
import { z } from 'zod/v4';
import type { ModelCapability } from '@ai-sdk/provider';
import { encodingModel, type Entry, type Probe } from './audit';

type Settings = Pick<
  Parameters<typeof generateText>[0],
  | 'temperature'
  | 'topP'
  | 'providerOptions'
  | 'tools'
  | 'toolChoice'
  | 'output'
  | 'maxOutputTokens'
> & {
  prompt?: string;
  messages?: ModelMessage[];
  instructions?: string;
};
const options = (openai: NonNullable<Settings['providerOptions']>[string]) => ({
  providerOptions: { openai },
});
let media: Promise<[Buffer, Buffer]> | undefined;

export async function languageProbes(
  modelId: string,
  entry: Entry,
): Promise<Probe[]> {
  const c = entry.capabilities.language;
  if (!c) return [];
  const probes: Probe[] = [];
  const [image, audio] = await (media ??= Promise.all([
    readFile(new URL('../../../data/comic-cat.png', import.meta.url)),
    readFile(new URL('../../../data/galileo.mp3', import.meta.url)),
  ]));
  const schema = z.object({ ok: z.boolean() });
  const tools = {
    report: tool({ description: 'Report success.', inputSchema: schema }),
  };
  const efforts = new Set([
    'none',
    'minimal',
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
    ...(c.reasoning.efforts ?? []),
  ]);
  const reasoningEffort =
    c.reasoning.efforts?.find(effort => effort !== 'none') ?? 'low';

  for (const endpoint of ['responses', 'chat'] as const) {
    const add = (
      probe: Omit<Probe, 'name' | 'execute'> & { name: string },
      settings: Settings,
      verify?: (result: Awaited<ReturnType<typeof generateText>>) => boolean,
    ) =>
      probes.push({
        ...probe,
        name: `${endpoint}/${probe.name}`,
        execute: async openai => {
          const { messages, prompt, ...rest } = settings;
          const result = await generateText({
            model: openai[endpoint](modelId),
            ...(messages
              ? { messages }
              : { prompt: prompt ?? 'Reply with OK.' }),
            maxOutputTokens: 1024,
            maxRetries: 0,
            timeout: 60_000,
            ...rest,
          });
          // Acceptance probes also work when reasoning uses the output budget.
          return verify ? verify(result) : true;
        },
      });
    const effortPattern = (effort: string) =>
      new RegExp(
        `"${endpoint === 'chat' ? 'reasoning_effort' : 'effort'}":"${effort}"`,
      );
    add({ name: 'baseline', covers: [], expected: true, sent: /"model":/ }, {});
    for (const [kind, bytes, mediaType, sent] of [
      ['image', image, 'image/png', /"(?:input_image|image_url)"/],
      ['audio', audio, 'audio/mpeg', /"(?:input_audio|input_file)"/],
    ] as const)
      add(
        {
          name: `${kind}-input`,
          covers: [`language.inputs.${kind}`],
          expected: c.inputs[kind],
          sent,
          parameter: new RegExp(`${kind}|file`),
        },
        {
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Describe this input briefly.' },
                { type: 'file', data: bytes, mediaType },
              ],
            },
          ],
        },
      );
    add(
      {
        name: 'structured-output',
        covers: ['language.objectGeneration'],
        expected: c.objectGeneration,
        sent: /"type":"json_schema"/,
        parameter: /json_schema|response_format|text\.format/,
      },
      {
        prompt: 'Return JSON with ok set to true.',
        output: Output.object({ schema }),
      },
      result => result.output != null,
    );
    const toolSettings = {
      prompt: 'Call report with ok=true.',
      tools,
      toolChoice: 'required' as const,
      ...(c.reasoning.efforts?.includes('none')
        ? options({ reasoningEffort: 'none' })
        : {}),
    };
    add(
      {
        name: 'function-calling',
        covers: ['language.tools.usage'],
        expected: c.tools.usage,
        sent: /"type":"function"/,
        parameter: /tools|function|tool_choice/,
      },
      toolSettings,
      result => result.toolCalls.some(call => call.toolName === 'report'),
    );
    probes.push({
      name: `${endpoint}/tool-streaming`,
      covers: ['language.tools.streaming'],
      expected: c.tools.streaming,
      sent: [/"stream":true/, /"type":"function"/],
      parameter: /stream|tools|function/,
      execute: async openai => {
        const result = streamText({
          model: openai[endpoint](modelId),
          ...toolSettings,
          prompt: 'Call report with ok=true.',
          maxOutputTokens: 1024,
          maxRetries: 0,
          timeout: 60_000,
        });
        let called = false;
        for await (const part of result.fullStream) {
          if (part.type === 'error') throw part.error;
          if (part.type === 'tool-call') called = true;
        }
        return called;
      },
    });
    add(
      {
        name: 'reasoning',
        covers: ['language.reasoning.support'],
        expected: c.reasoning.support,
        sent: effortPattern(reasoningEffort),
        parameter: /reasoning|effort/,
        encodingModelId: encodingModel(
          language =>
            language.reasoning.efforts?.includes(reasoningEffort) === true,
        ),
      },
      options({ reasoningEffort }),
    );
    for (const effort of efforts)
      add(
        {
          name: `reasoningEfforts/${effort}`,
          covers: ['language.reasoning.efforts'],
          expected:
            c.reasoning.efforts?.includes(effort) ?? c.reasoning.support,
          sent: effortPattern(effort),
          parameter: /reasoning|effort/,
          encodingModelId: encodingModel(
            language => language.reasoning.efforts?.includes(effort) === true,
          ),
        },
        options({ reasoningEffort: effort }),
      );

    // Deliberately include unsupported contexts. Skipping them would hide false
    // negatives in the catalog. Require BOTH effort and sampling on the wire.
    for (const effort of [undefined, 'none', reasoningEffort] as const) {
      for (const setting of ['temperature', 'topP', 'logprobs'] as const) {
        const atNone = effort === 'none';
        const declared = c.sampling[setting];
        const expected: ModelCapability = atNone
          ? c.reasoning.sampling === 'reasoning-effort-none'
          : typeof declared === 'object'
            ? effort == null
              ? 'unknown'
              : setting === 'logprobs' && endpoint === 'responses'
                ? 'unknown'
                : false
            : declared;
        const sent =
          setting === 'temperature'
            ? /"temperature":0.5/
            : setting === 'topP'
              ? /"top_p":0.5/
              : endpoint === 'chat'
                ? /"logprobs":true/
                : /"top_logprobs":1/;
        const encodingModelId = atNone
          ? encodingModel(
              language =>
                language.reasoning.sampling === 'reasoning-effort-none',
            )
          : setting === 'logprobs' && endpoint === 'responses'
            ? encodingModel(
                language =>
                  language.reasoning.efforts?.includes(
                    effort ?? reasoningEffort,
                  ) === true &&
                  !language.endpoints.responses.logprobsRequireNonReasoning,
              )
            : effort == null
              ? encodingModel(
                  language =>
                    language.reasoning.support === false &&
                    language.sampling[setting] === true,
                )
              : undefined;
        // Chat's forceReasoning controls SDK encoding, not the wire effort.
        // Keep the requested effort explicit so unsupported combinations reach
        // the API without the SDK removing sampling first.
        const samplingOptions = options({
          reasoningEffort: effort,
          ...(setting === 'logprobs' ? { logprobs: 1 } : {}),
          ...(endpoint === 'chat'
            ? { forceReasoning: false, maxCompletionTokens: 1024 }
            : {}),
        });
        add(
          {
            name: `${atNone ? 'samplingAtReasoningEffortNone' : endpoint === 'responses' && setting === 'logprobs' && effort != null ? 'responsesLogprobsRequireNonReasoning' : 'sampling'}/${setting}/${effort ?? 'default'}`,
            covers: [
              `language.sampling.${setting}`,
              ...(atNone ? ['language.reasoning.sampling'] : []),
              ...(setting === 'logprobs' &&
              endpoint === 'responses' &&
              effort != null &&
              !atNone
                ? ['language.endpoints.responses.logprobsRequireNonReasoning']
                : []),
            ],
            expected,
            sent: effort == null ? sent : [sent, effortPattern(effort)],
            parameter: new RegExp(
              `${setting === 'topP' ? 'top_p' : setting}|reasoning|effort`,
              'i',
            ),
            encodingModelId,
          },
          {
            ...samplingOptions,
            ...(setting === 'logprobs' ? {} : { [setting]: 0.5 }),
            ...(endpoint === 'chat' ? { maxOutputTokens: undefined } : {}),
          },
          setting === 'logprobs'
            ? result =>
                Array.isArray(
                  result.finalStep.providerMetadata?.openai?.logprobs,
                ) &&
                result.finalStep.providerMetadata.openai.logprobs.length > 0
            : undefined,
        );
      }
    }
    if (endpoint === 'chat') {
      add(
        {
          name: 'chatTemperature',
          covers: ['language.endpoints.chat.temperatureWithoutReasoning'],
          expected:
            c.reasoning.support === true
              ? 'unknown'
              : c.endpoints.chat.temperatureWithoutReasoning,
          sent: /"temperature":0.5/,
          parameter: /temperature/,
        },
        { ...options({ forceReasoning: false }), temperature: 0.5 },
      );
      add(
        {
          name: 'chatFunctionToolsWithReasoning',
          covers: ['language.endpoints.chat.functionToolsWithReasoning'],
          expected:
            c.reasoning.support === true
              ? c.endpoints.chat.functionToolsWithReasoning
              : 'unknown',
          sent: [/"type":"function"/, effortPattern(reasoningEffort)],
          parameter: /tools|function|reasoning|tool_choice/,
          encodingModelId: encodingModel(
            language =>
              language.endpoints.chat.functionToolsWithReasoning &&
              language.reasoning.efforts?.includes(reasoningEffort) === true,
          ),
        },
        {
          ...options({ reasoningEffort }),
          tools,
          toolChoice: 'required',
          prompt: 'Call report with ok=true.',
        },
        result => result.toolCalls.length > 0,
      );
    }
    for (const tier of ['flex', 'priority'] as const)
      add(
        {
          name: `${tier}Processing`,
          covers: [`language.serviceTiers.${tier}`],
          expected: c.serviceTiers[tier],
          sent: new RegExp(`"service_tier":"${tier}"`),
          parameter: /service_tier/,
          encodingModelId: encodingModel(
            language => language.serviceTiers[tier],
          ),
        },
        options({ serviceTier: tier }),
      );
    add(
      {
        name: 'promptCacheRetention',
        covers: ['language.promptCache.retention'],
        expected: c.promptCache.retention,
        sent: /"prompt_cache_retention":"24h"/,
        parameter: /prompt_cache_retention/,
        encodingModelId: encodingModel(
          language => language.promptCache.retention,
        ),
      },
      options({ promptCacheRetention: '24h' }),
    );
    for (const ttl of ['30m', '12h'])
      add(
        {
          name: `promptCacheOptions/${ttl}`,
          covers: ['language.promptCache.options'],
          expected: c.promptCache.options,
          sent: new RegExp(`"ttl":"${ttl}"`),
          parameter: /prompt_cache_options/,
        },
        options({ promptCacheOptions: { ttl } }),
      );
    if (endpoint === 'responses') {
      for (const carrier of ['request', 'message'] as const)
        add(
          {
            name: `configurationUpdates/${carrier}`,
            covers: ['language.configurationUpdates'],
            expected: c.configurationUpdates,
            sent: [
              /"type":"configuration_update"/,
              effortPattern(reasoningEffort),
            ],
            parameter: /configuration_update|reasoning/,
            encodingModelId: encodingModel(
              language =>
                language.configurationUpdates &&
                language.reasoning.efforts?.includes(reasoningEffort) === true,
            ),
          },
          carrier === 'request'
            ? options({ reasoningEffortUpdate: reasoningEffort })
            : {
                messages: [
                  {
                    role: 'system',
                    content: '',
                    providerOptions: {
                      openai: { reasoningEffortUpdate: reasoningEffort },
                    },
                  },
                  { role: 'user', content: 'Reply with OK.' },
                ],
              },
        );
      add(
        {
          name: 'asyncTools',
          covers: ['language.tools.async'],
          expected: c.tools.async,
          sent: [/"type":"function"/, /"async":true/],
          parameter: /async/,
          encodingModelId: encodingModel(language => language.tools.async),
        },
        {
          prompt: 'Call report with ok=true.',
          toolChoice: 'required',
          tools: {
            report: tool({
              inputSchema: schema,
              providerOptions: { openai: { async: true } },
            }),
          },
        },
        result => result.toolCalls.length > 0,
      );
    }
  }
  return probes;
}
