// TODO: Remove in the next major version.
/**
 * @deprecated Sandbox bridge authentication now uses adapter-generated
 * Ed25519 keys. Passing this callback has no effect and emits a warning.
 */
export type HarnessV1MintBridgeTokenCallback = (sandboxId: string) => string;
