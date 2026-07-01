import { eveHarnessAgent } from '../../agents/eve/basic-agent';
import { runTUI } from '../../lib/run-tui';

await runTUI({
  agent: eveHarnessAgent,
  entrypointUrl: import.meta.url,
  title: 'Eve — Basic',
});
