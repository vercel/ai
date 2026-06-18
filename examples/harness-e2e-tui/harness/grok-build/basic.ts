import { grokBuildHarnessAgent } from '../../agents/grok-build/basic-agent';
import { runTUI } from '../../lib/run-tui';

await runTUI({
  agent: grokBuildHarnessAgent,
  entrypointUrl: import.meta.url,
  title: 'Grok Build — Basic',
});
