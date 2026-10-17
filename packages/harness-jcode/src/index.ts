import { createJcode } from './jcode-harness';

export const jcode = createJcode();

export { createJcode } from './jcode-harness';
export { getJcodeBootstrap, JCODE_BOOTSTRAP_DIR } from './jcode-bootstrap';
export { VERSION } from './version';
export type { JcodeHarnessSettings } from './jcode-harness';
export type { JcodeClientFactory, JcodeSdkClient } from './jcode-client';
export {
  createJcodeTranslatorState,
  translateJcodeEvent,
} from './jcode-translate';
export type { JcodeTranslatorState } from './jcode-translate';
