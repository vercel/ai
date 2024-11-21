#!/usr/bin/env node

import { serve } from '@hono/node-server';
import { Option } from 'commander';
import { Hono } from 'hono';
import { logger as honoLogger } from 'hono/logger';
import { requestId } from 'hono/request-id';
import * as path from 'node:path';
import zod from 'zod';
import { startService } from './util/start-service';
import { Agent } from './types/agent';

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
    app.post('/agent/:agent/start', async context => {
      const agent = context.req.param('agent');

      const agentPath = path.join(process.cwd(), 'agents', agent);
      const agentModulePath = path.join(agentPath, 'agent.js');

      try {
        const agentModule: Agent = (await import(agentModulePath)).default;
        logger.info(`Successfully loaded agent module: ${agent}`);

        await agentModule.init();

        return context.json({
          success: true,
          agent: agent,
          module: agentModule,
        });
      } catch (error) {
        logger.error(`Failed to load agent module: ${error}`);
        return context.json(
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
