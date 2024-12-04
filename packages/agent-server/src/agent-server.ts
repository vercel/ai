#!/usr/bin/env node

import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { serve } from '@hono/node-server';
import { Option } from 'commander';
import 'dotenv/config';
import { Hono } from 'hono';
import { logger as honoLogger } from 'hono/logger';
import { requestId } from 'hono/request-id';
import { stream } from 'hono/streaming';
import * as path from 'node:path';
import zod from 'zod';
import { DataStore } from './data-store';
import { ModuleLoader } from './module-loader';
import { RunManager } from './run-manager';
import { StreamManager } from './stream-manager';
import { createStitchableStream } from './util/create-stitchable-stream';
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
      modulePath: path.join(process.cwd(), '.workflows'),
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
    app.options('/workflow/:workflow/start', async c => {
      const workflow = await moduleLoader.loadWorkflow({
        workflow: c.req.param('workflow'),
      });

      Object.entries(workflow.headers ?? {}).forEach(([key, value]) => {
        c.header(key, value);
      });

      return c.text('ok');
    });

    // POST to start an workflow run:
    app.post('/workflow/:workflow/start', async c => {
      const { runId, headers } = await runManager.startWorkflow({
        workflow: c.req.param('workflow'),
        request: c.req.raw,
      });

      const runStream = streamManager.getStream(runId);

      // headers
      c.header('X-Workflow-Run-Id', runId);
      Object.entries(headers ?? {}).forEach(([key, value]) => {
        c.header(key, value);
      });

      return stream(c, stream =>
        stream.pipe(runStream.pipeThrough(new TextEncoderStream())),
      );
    });

    // GET join an workflow run stream
    app.get('/run/:runId/stream', async c => {
      const runId = c.req.param('runId');
      const runStream = streamManager.getStream(runId);

      // get workflow name from runId (TODO load from status file)
      const workflow = runId.substring(0, runId.lastIndexOf('-'));

      const workflowModule = await moduleLoader.loadWorkflow({ workflow });
      c.header('X-Workflow-Run-Id', runId);
      Object.entries(workflowModule.headers ?? {}).forEach(([key, value]) => {
        c.header(key, value);
      });

      const streamRecording = await dataStore.loadRunStreamRecording({ runId });
      const recordedStream = convertArrayToReadableStream(streamRecording);
      const stitchedStream = createStitchableStream();
      stitchedStream.addStream(recordedStream);
      stitchedStream.addStream(runStream);
      stitchedStream.close();

      return stream(c, stream =>
        stream.pipe(stitchedStream.stream.pipeThrough(new TextEncoderStream())),
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
