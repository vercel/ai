/**
 * Creates the authentication token a bridge-backed harness adapter uses to
 * secure its sandbox bridge channel for one session. Defaults to a random
 * 32-byte hexadecimal token when omitted.
 */
export type HarnessV1MintBridgeTokenCallback = (sandboxId: string) => string;
