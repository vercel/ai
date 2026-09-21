import { createOpenCode } from '@ai-sdk/harness-opencode';

const openCode = createOpenCode({
  reconnect: {
    maxElapsedMs: 120_000,
    initialDelayMs: 100,
    maxDelayMs: 5_000,
  },
});

console.log(`Configured reconnect timing for ${openCode.harnessId}.`);
