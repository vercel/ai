import { createGrok } from "./grok-harness.js";

export const grok = createGrok();

export { createGrok } from "./grok-harness.js";
export type { GrokHarnessSettings } from "./grok-harness.js";
export type { GrokAuthOptions } from "./grok-auth.js";
export {
  ensureGrokSandboxOAuth,
  formatGrokLoginQuestion,
  grokAuthFileExists,
  parseGrokDeviceLoginOutput,
  runGrokDeviceLogin,
} from "./grok-oauth.js";
export { VERSION } from "./version.js";