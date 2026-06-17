// @ts-nocheck
import type { CoreTool } from 'ai';

interface Config {
  tool: CoreTool;
}

const myTool: CoreTool = {
  description: 'test',
  parameters: {}
};
