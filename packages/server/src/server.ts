#!/usr/bin/env node

import { Option } from 'commander';
import zod from 'zod';
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
    console.log('Server started', { host, port });

    return {
      async shutdown() {
        // await server.close(); // wait for requests to be finished
      },
    };
  },
});
