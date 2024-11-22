#!/usr/bin/env node

import { serve } from '@hono/node-server';
import { Option } from 'commander';
import { Hono } from 'hono';
import { logger as honoLogger } from 'hono/logger';
import { requestId } from 'hono/request-id';
import * as path from 'node:path';
import zod from 'zod';
import { RunManager } from './run-manager';
import { startService } from './util/start-service';
import { DataStore } from './data-store';
import { JobQueue } from './util/job-queue';

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
    const jobs = new JobQueue<{ runId: string }>();
    const dataStore = new DataStore({
      dataPath: path.join(process.cwd(), '.data'),
    });
    const runManager = new RunManager({
      agentsPath: path.join(process.cwd(), '.agents'),
      dataStore,
      submitJob: jobs.push.bind(jobs),
    });

    // setup workers
    // the workers run in the same process in this prototype,
    // so if they perform CPU-bound tasks, they will block
    // TODO multiple workers
    // TODO extract worker logic
    jobs.startWorker(async ({ runId }) => {
      // load information from data store

      // load module for state

      // execute module with context

      // wait for updated context

      // store updated context

      // submit next job

      console.log('TODO process job', runId);
    });

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
