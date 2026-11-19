import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import type { NextConfig } from 'next';
import { discoverDurableHarnessAgentModules } from './discover-durable-agent-modules';
import {
  findNextAppDir,
  findOwnQueueHandlerRouteFile,
  getQueueHandlerRouteDir,
  QUEUE_HANDLER_ROUTE_MARKER,
} from './queue-handler-route-file';

export type WithDurableHarnessAgentOptions = {
  /**
   * Modules that create durable agents, relative to the project root.
   * Replaces automatic detection.
   */
  agents?: string[];
};

/**
 * Wraps a Next.js config for durable HarnessAgents.
 *
 * When the dev server starts and on a production build, it writes the queue
 * handler route, `<app>/.well-known/harness-agent/v1/flow/route.js` (or at
 * the path `AI_SDK_DURABLE_HARNESS_AGENT_QUEUE_HANDLER_ROUTE` names): it
 * imports every module that creates a durable agent, so that their agents
 * are in the durable agent registry, and serves
 * `createDurableHarnessAgentQueueHandler()`. A `.gitignore` keeps it out of
 * git. An app's own route at that path (one without the generated marker) is
 * left alone. Agent modules added while the dev server runs need a restart
 * of the dev server.
 *
 * It sets `AI_SDK_DURABLE_HARNESS_AGENT_QUEUE_DELIVERY` to `route` in the
 * config's `env`, so that the World delivers every queue job over HTTP to
 * that route, which reaches every durable agent of the app, instead of only
 * the agents whose modules the process already loaded. A value the app sets
 * for either variable, in its environment while building or in its own
 * `env` config, is kept.
 *
 * ```ts
 * // next.config.ts
 * import { withDurableHarnessAgent } from '@ai-sdk/harness/next';
 *
 * export default withDurableHarnessAgent({});
 * ```
 */
export function withDurableHarnessAgent(
  nextConfig?:
    | NextConfig
    | ((
        phase: string,
        ctx: { defaultConfig: NextConfig },
      ) => NextConfig | Promise<NextConfig>),
  options?: WithDurableHarnessAgentOptions,
): (phase: string, ctx: { defaultConfig: NextConfig }) => Promise<NextConfig> {
  return async (phase, ctx) => {
    const config =
      typeof nextConfig === 'function'
        ? await nextConfig(phase, ctx)
        : (nextConfig ?? {});
    if (
      phase === 'phase-development-server' ||
      phase === 'phase-production-build'
    ) {
      writeQueueHandlerRoute({
        projectDir: process.cwd(),
        agents: options?.agents,
      });
    }
    return {
      ...config,
      env: {
        AI_SDK_DURABLE_HARNESS_AGENT_QUEUE_DELIVERY:
          process.env.AI_SDK_DURABLE_HARNESS_AGENT_QUEUE_DELIVERY || 'route',
        ...(process.env.AI_SDK_DURABLE_HARNESS_AGENT_QUEUE_HANDLER_ROUTE && {
          AI_SDK_DURABLE_HARNESS_AGENT_QUEUE_HANDLER_ROUTE:
            process.env.AI_SDK_DURABLE_HARNESS_AGENT_QUEUE_HANDLER_ROUTE,
        }),
        ...config.env,
      },
    };
  };
}

/**
 * Writes the queue handler route and its `.gitignore`, unless the app has no
 * app directory or a route of its own at the route's path. Leaves files
 * whose content would not change untouched, so that the dev server does not
 * reload.
 */
export function writeQueueHandlerRoute(options: {
  projectDir: string;
  agents?: string[];
}): void {
  const { projectDir } = options;
  const appDir = findNextAppDir({ projectDir });
  if (appDir == null) {
    console.warn(
      `[@ai-sdk/harness/next] No Next.js app directory (app or src/app) in ${projectDir}, so no queue handler route is written.`,
    );
    return;
  }
  if (findOwnQueueHandlerRouteFile({ appDir }) != null) return;

  const routeDir = getQueueHandlerRouteDir({ appDir });
  const modules =
    options.agents?.map(agent => resolve(projectDir, agent)) ??
    discoverDurableHarnessAgentModules({ projectDir });
  if (modules.length === 0) {
    console.warn(
      '[@ai-sdk/harness/next] No module that exports a HarnessAgent was found, so the queue handler finds no durable agent. Pass `agents` to withDurableHarnessAgent if your agents are created elsewhere.',
    );
  }

  const imports = modules.map(file => {
    let specifier = relative(routeDir, file).split(sep).join('/');
    specifier = specifier.slice(
      0,
      specifier.length - extname(specifier).length,
    );
    if (!specifier.startsWith('.')) specifier = `./${specifier}`;
    return `import '${specifier}';\n`;
  });
  writeFileIfChanged({
    file: join(routeDir, 'route.js'),
    content: [
      `// ${QUEUE_HANDLER_ROUTE_MARKER}. Do not edit: it is written again on every build and dev server start.\n`,
      ...imports,
      `import { createDurableHarnessAgentQueueHandler } from '@ai-sdk/harness/agent';\n`,
      `\n`,
      `export const POST = createDurableHarnessAgentQueueHandler();\n`,
    ].join(''),
  });
  writeFileIfChanged({
    file: join(dirname(dirname(routeDir)), '.gitignore'),
    content: `# ${QUEUE_HANDLER_ROUTE_MARKER}\n*\n`,
  });
}

function writeFileIfChanged(options: { file: string; content: string }): void {
  const { file, content } = options;
  if (existsSync(file) && readFileSync(file, 'utf8') === content) return;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}
