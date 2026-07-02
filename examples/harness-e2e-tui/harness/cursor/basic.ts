import { cursorHarnessAgent } from '../../agents/cursor/basic-agent';
import { runTUI } from '../../lib/run-tui';

await runTUI({
  agent: cursorHarnessAgent,
  entrypointUrl: import.meta.url,
  title: 'Cursor — Basic',
});
