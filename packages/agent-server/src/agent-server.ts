#!/usr/bin/env node

import { serve } from '@hono/node-server';
import { Option } from 'commander';
import { Hono } from 'hono';
import { logger as honoLogger } from 'hono/logger';
import { requestId } from 'hono/request-id';
import * as path from 'node:path';
import zod from 'zod';
import { DataStore } from './data-store';
import { ModuleLoader } from './module-loader';
import { RunManager } from './run-manager';
import { JobQueue } from './util/job-queue';
import { startService } from './util/start-service';
import { createWorker } from './worker';

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
    const moduleLoader = new ModuleLoader({
      modulePath: path.join(process.cwd(), '.agents'),
    });
    const jobs = new JobQueue<{ runId: string }>();
    const dataStore = new DataStore({
      dataPath: path.join(process.cwd(), '.data'),
    });
    const runManager = new RunManager({
      dataStore,
      moduleLoader,
      submitJob: jobs.push.bind(jobs),
    });

    // setup workers
    // the workers run in the same process in this prototype,
    // so if they perform CPU-bound tasks, they will block
    // TODO multiple workers
    jobs.startWorker(createWorker({ dataStore, moduleLoader }));

    // Hono setup
    const app = new Hono();
    app.use(requestId());
    app.use(
      honoLogger((message, ...rest) => {
        logger.info(message, ...rest);
      }),
    );

    // routes setup
    app.post('/agent/:agent/start', async c => {
      const { runId } = await runManager.startAgent({
        agent: c.req.param('agent'),
        request: c.req.raw,
      });

      return c.json({ runId });
    });

    const server = serve({ fetch: app.fetch, hostname: host, port });

    return {
      async shutdown() {
        server.close(); // wait for requests to be finished
      },
    };
  },
});
