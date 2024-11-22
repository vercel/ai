#!/usr/bin/env node

import { serve } from '@hono/node-server';
import { Option } from 'commander';
import { Hono } from 'hono';
import { logger as honoLogger } from 'hono/logger';
import { requestId } from 'hono/request-id';
import * as path from 'node:path';
import zod from 'zod';
import { Agent } from './types/agent';
import { loadModule } from './util/load-module';
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

    // base paths
    const agentsPath = path.join(process.cwd(), '.agents');

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

      const agent = await loadModule<Agent<any>>({
        path: path.join(agentsPath, agentName, 'agent.js'),
      });

      const startResult = await agent.start({
        request: c.req.raw,
        metadata: { agentName },
      });

      const context = startResult.context;

      const state = await agent.nextState({
        currentState: 'START',
        context,
      });

      // durability: store run metadata (id, agent, created at), context, state,etc

      // TODO what should be returned? run id?
      return c.json({
        agentName,
        context,
        state,
      });
    });

    const server = serve({ fetch: app.fetch, hostname: host, port });

    return {
      async shutdown() {
        server.close(); // wait for requests to be finished
      },
    };
  },
});