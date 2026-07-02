import { convertToModelMessages } from './packages/ai/src/ui/convert-to-model-messages';
import { convertToAnthropicPrompt } from './packages/anthropic/src/convert-to-anthropic-prompt';
import { createToolNameMapping } from './packages/provider-utils/src/create-tool-name-mapping';

function findOrphans(messages:any[]) {
  const orphans:any[] = [];
  for (let i=0;i<messages.length;i++) {
    const msg = messages[i];
    if (msg.role !== 'assistant') continue;
    const toolUses = msg.content.filter((p:any)=>p.type==='tool_use').map((p:any)=>p.id);
    if (toolUses.length === 0) continue;
    const next = messages[i+1];
    const results = new Set(next?.role === 'user' ? next.content.filter((p:any)=>p.type==='tool_result').map((p:any)=>p.tool_use_id) : []);
    for (const id of toolUses) if (!results.has(id)) orphans.push({messageIndex:i,id,next});
  }
  return orphans;
}
async function main() {
const uiMessages:any = [
  { role: 'user', parts: [{type:'text', text:'start'}] },
  { role: 'assistant', parts: [
    { type: 'text', text: 'before A' },
    { type: 'tool-edit', state: 'output-error', toolCallId: 'toolu_01R4gLPydCvYg7gc5G9rCkKp', input: {}, errorText: 'Tool execution aborted' },
    { type: 'text', text: 'between' },
    { type: 'tool-edit', state: 'output-available', toolCallId: 'toolu_B', input: { path: 'x' }, output: 'ok' },
  ]}
];
const modelMessages = await convertToModelMessages(uiMessages);
console.log('modelMessages', JSON.stringify(modelMessages, null, 2));
const warnings:any[] = [];
const result = await convertToAnthropicPrompt({
  prompt: modelMessages as any,
  sendReasoning: true,
  warnings,
  toolNameMapping: createToolNameMapping({tools: [], providerToolNames: {}}),
});
console.log('anthropicPrompt', JSON.stringify(result.prompt, null, 2));
console.log('orphans', JSON.stringify(findOrphans(result.prompt.messages), null, 2));
console.log('warnings', warnings);
}
main().catch(e=>{console.error(e);process.exit(1)});
