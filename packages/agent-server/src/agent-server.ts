#!/usr/bin/env node

import { serve } from '@hono/node-server';
import { Option } from 'commander';
import { Hono } from 'hono';
import { logger as honoLogger } from 'hono/logger';
import { requestId } from 'hono/request-id';
import * as path from 'node:path';
import zod from 'zod';
import { Agent } from './types/agent';
import { startService } from './util/start-service';

startService({
  name: '@ai-sdk/server',
  configurationOptions: [
    new Option('--port <number>', 'port number')
      .env('PORT')
      .argParser(value => +value)
      .makeOptionMandatory(),
    new Option('--host <string>', 'host name')
      .env('HOST')
      .makeOptionMandatory(),
  ],
  configurationSchema: zod.object({
    host: zod.string(),
    port: zod.number(),
  }),
  async initialize({ host, port }, logger) {
    const app = new Hono();

    // middleware setup
    app.use(requestId());
    app.use(
      honoLogger((message, ...rest) => {
        logger.info(message, ...rest);
      }),
    );

    // routes setup
    app.post('/agent/:agent/start', async c => {
      const agentName = c.req.param('agent');

      const agentPath = path.join(process.cwd(), 'agents', agentName);
      const agentModulePath = path.join(agentPath, 'agent.js');

      try {
        const agent: Agent<any> = (await import(agentModulePath)).default;
        logger.info(`Successfully loaded agent module: ${agentName}`);

        const startResult = await agent.start({
          request: c.req.raw,
          metadata: { agentName },
        });

        const context = startResult.context;

        const state = await agent.nextState({
          currentState: 'START',
          context,
        });

        return c.json({
          success: true,
          agentName,
          context,
          state,
        });
      } catch (error) {
        logger.error(`Failed to load agent module: ${error}`);
        return c.json(
          {
            success: false,
            error: `Failed to load agent: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`,
          },
          400,
        );
      }
    });

    const server = serve({ fetch: app.fetch, hostname: host, port });

    return {
      async shutdown() {
        server.close(); // wait for requests to be finished
      },
    };
  },
});
