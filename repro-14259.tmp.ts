import { convertToAnthropicPrompt } from './packages/anthropic/src/convert-to-anthropic-prompt';
import { createToolNameMapping } from './packages/provider-utils/src/create-tool-name-mapping';

async function main() {
const prompt:any = [
  { role: 'user', content: [{ type: 'text', text: 'start' }] },
  { role: 'assistant', content: [
    { type: 'text', text: 'before A' },
    { type: 'tool-call', toolCallId: 'toolu_01R4gLPydCvYg7gc5G9rCkKp', toolName: 'edit', input: {} },
    { type: 'text', text: 'between' },
    { type: 'tool-call', toolCallId: 'toolu_B', toolName: 'edit', input: { path: 'x' } },
  ]},
  { role: 'tool', content: [
    { type: 'tool-result', toolCallId: 'toolu_01R4gLPydCvYg7gc5G9rCkKp', toolName: 'edit', output: { type: 'error-text', value: 'Tool execution aborted' } },
    { type: 'tool-result', toolCallId: 'toolu_B', toolName: 'edit', output: { type: 'text', value: 'ok' } },
  ]},
];
const warnings:any[] = [];
const result = await convertToAnthropicPrompt({
  prompt,
  sendReasoning: true,
  warnings,
  toolNameMapping: createToolNameMapping({tools: [], providerToolNames: {}}),
});
console.log(JSON.stringify(result.prompt, null, 2));
console.log('warnings', warnings);
}
main().catch(e=>{console.error(e);process.exit(1)});
