import { weatherApprovalGrokBuildHarnessAgent } from '../../agents/grok-build/weather-approval-agent';
import { runTUI } from '../../lib/run-tui';

await runTUI({
  agent: weatherApprovalGrokBuildHarnessAgent,
  entrypointUrl: import.meta.url,
  title: 'Grok Build — Weather Approval',
});
