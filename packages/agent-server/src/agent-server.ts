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
import { StreamManager } from './stream-manager';
import { stream } from 'hono/streaming';
import 'dotenv/config';

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
    const submitJob = jobs.push.bind(jobs);
    const dataStore = new DataStore({
      dataPath: path.join(process.cwd(), '.data'),
    });
    const streamManager = new StreamManager();
    const runManager = new RunManager({
      dataStore,
      moduleLoader,
      submitJob,
      streamManager,
      logger,
    });

    // setup workers
    // the workers run in the same process in this prototype,
    // so if they perform CPU-bound tasks, they will block
    // TODO multiple workers
    jobs.startWorker(
      createWorker({
        dataStore,
        moduleLoader,
        streamManager,
        submitJob,
        logger,
      }),
    );

    // Hono setup
    const app = new Hono();
    app.use(requestId());
    app.use(
      honoLogger((message, ...rest) => {
        logger.info(message, ...rest);
      }),
    );

    // routes setup
    // OPTIONS for CORS preflight:
    app.options('/agent/:agent/start', async c => {
      const agent = await moduleLoader.loadAgent({
        agent: c.req.param('agent'),
      });

      Object.entries(agent.headers ?? {}).forEach(([key, value]) => {
        c.header(key, value);
      });

      return c.text('ok');
    });

    // POST to start an agent run:
    app.post('/agent/:agent/start', async c => {
      const { runId, headers } = await runManager.startAgent({
        agent: c.req.param('agent'),
        request: c.req.raw,
      });

      const runStream = streamManager.getStream(runId);

      // headers
      c.header('X-Agent-Run-Id', runId);
      Object.entries(headers ?? {}).forEach(([key, value]) => {
        c.header(key, value);
      });

      return stream(c, stream =>
        stream.pipe(runStream.pipeThrough(new TextEncoderStream())),
      );
    });

    // GET join an agent run stream
    app.get('/run/:runId/stream', async c => {
      const runStream = streamManager.getStream(c.req.param('runId'));

      // TODO set correct agent stream headers

      return stream(c, stream =>
        stream.pipe(runStream.pipeThrough(new TextEncoderStream())),
      );
    });

    const server = serve({ fetch: app.fetch, hostname: host, port });

    return {
      async shutdown() {
        server.close(); // wait for requests to be finished
      },
    };
  },
});
