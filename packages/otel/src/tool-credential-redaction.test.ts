import { describe, expect, it } from 'vitest';
import { generateText, streamText, jsonSchema } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { LegacyOpenTelemetry } from './legacy-open-telemetry';
import { OpenTelemetry } from './open-telemetry';
import { MockTracer } from './mock-tracer';

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};
const finishReason = { unified: 'stop' as const, raw: 'stop' };

describe.each([LegacyOpenTelemetry, OpenTelemetry])(
  '%s tool credentials',
  Integration => {
    it.each(['generateText', 'streamText'] as const)(
      'redacts unannotated provider definitions in %s without changing model arguments',
      async operation => {
        const tracer = new MockTracer();
        const sample = 'sample-value';
        const networkPolicy = {
          type: 'allowlist',
          allowedDomains: ['example.com'],
          domainSecrets: [
            { domain: 'example.com', name: 'EXAMPLE', value: sample },
          ],
        };
        const tools = {
          remote: {
            type: 'provider' as const,
            isProviderExecuted: true as const,
            inputSchema: jsonSchema({ type: 'object', properties: {} }),
            id: 'openai.mcp' as const,
            args: {
              serverLabel: 'example',
              serverUrl: 'https://example.com/mcp',
              authorization: sample,
              headers: { 'X-Example': sample },
            },
          },
          python: {
            type: 'provider' as const,
            isProviderExecuted: true as const,
            inputSchema: jsonSchema({ type: 'object', properties: {} }),
            id: 'openai.code_interpreter' as const,
            args: { container: { networkPolicy } },
          },
          terminal: {
            type: 'provider' as const,
            isProviderExecuted: true as const,
            inputSchema: jsonSchema({ type: 'object', properties: {} }),
            id: 'openai.shell' as const,
            args: { environment: { type: 'containerAuto', networkPolicy } },
          },
        };
        const original = Object.entries(tools).map(([name, tool]) => ({
          type: tool.type,
          id: tool.id,
          args: structuredClone(tool.args),
          name,
        }));
        const model = new MockLanguageModelV4({
          doGenerate: {
            content: [{ type: 'text', text: 'OK' }],
            finishReason,
            usage,
            warnings: [],
          },
          doStream: {
            stream: convertArrayToReadableStream([
              { type: 'stream-start', warnings: [] },
              { type: 'text-start', id: '0' },
              { type: 'text-delta', id: '0', delta: 'OK' },
              { type: 'text-end', id: '0' },
              { type: 'finish', finishReason, usage },
            ]),
          },
        });
        const options = {
          model,
          prompt: 'Reply OK.',
          tools,
          toolChoice: 'none' as const,
          telemetry: { integrations: new Integration({ tracer }) },
        };
        const result =
          operation === 'generateText'
            ? await generateText(options)
            : streamText(options);
        if ('consumeStream' in result) await result.consumeStream();
        expect(await result.text).toBe('OK');

        const attribute =
          Integration === LegacyOpenTelemetry
            ? 'ai.prompt.tools'
            : 'gen_ai.tool.definitions';
        const definitions = tracer.spans
          .map(span => span.attributes[attribute])
          .filter(value => value != null);
        expect(definitions).toHaveLength(1);
        const serialized = JSON.stringify(definitions);
        expect(serialized).not.toContain(sample);
        expect(serialized).toContain('[redacted]');
        expect(serialized).toContain('example.com');
        expect(serialized).toContain('X-Example');
        expect(serialized).toContain('remote');
        expect(Object.values(tools).map(tool => tool.args)).toEqual(
          original.map(tool => tool.args),
        );
        const calls =
          operation === 'generateText'
            ? model.doGenerateCalls
            : model.doStreamCalls;
        expect(calls[0].tools).toEqual(original);
      },
    );
  },
);
