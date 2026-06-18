import { aiSdkCodingGrokBuildHarnessAgent } from '../../agents/grok-build/ai-sdk-coding-agent';
import { runTUI } from '../../lib/run-tui';

await runTUI({
  agent: aiSdkCodingGrokBuildHarnessAgent,
  entrypointUrl: import.meta.url,
  title: 'Grok Build — AI SDK Coding',
});
