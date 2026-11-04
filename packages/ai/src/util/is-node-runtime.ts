export function isNodeRuntime(): boolean {
  // Access the optional global directly so Edge bundlers do not treat this
  // runtime check as an unsupported use of the Node.js process API.
  return globalThis.process?.release?.name === 'node';
}
