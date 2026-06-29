import { weatherGrokBuildHarnessAgent } from '../../agents/grok-build/weather-agent';
import { runTUI } from '../../lib/run-tui';

await runTUI({
  agent: weatherGrokBuildHarnessAgent,
  entrypointUrl: import.meta.url,
  title: 'Grok Build — Weather',
});
