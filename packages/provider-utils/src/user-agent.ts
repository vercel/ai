/**
 * Parts used to construct a User-Agent string.
 */
export type UserAgentParts = {
    aiVersion?: string;
    providerVersion?: string;
    providerUtilsVersion: string;
    gatewayVersion?: string;
    runtime?: string;
    runtimeVersion?: string;
    platform?: string;
    arch?: string;
    extra?: string;
  };
  
  /**
   * Builds a normalized User-Agent string from package/runtime metadata.
   * @param parts - Version and environment components.
   * @returns The composed User-Agent string, e.g. "ai/5.0.30 @ai-sdk/provider/2.0.0 @ai-sdk/provider-utils/3.0.7 node/20.11.1 os/darwin arch/arm64".
   */
  export function buildUserAgent(parts: UserAgentParts): string {
    const segs: string[] = [];
    if (parts.aiVersion) segs.push(`ai/${parts.aiVersion}`);
    if (parts.providerVersion)
      segs.push(`@ai-sdk/provider/${parts.providerVersion}`);
    segs.push(`@ai-sdk/provider-utils/${parts.providerUtilsVersion}`);
    if (parts.gatewayVersion)
      segs.push(`@ai-sdk/gateway/${parts.gatewayVersion}`);
    if (parts.runtime)
      segs.push(`${parts.runtime}/${parts.runtimeVersion ?? 'unknown'}`);
    if (parts.platform) segs.push(`os/${parts.platform}`);
    if (parts.arch) segs.push(`arch/${parts.arch}`);
    if (parts.extra) segs.push(parts.extra);
    return segs.join(' ');
  }
  
  /**
   * Merges a base User-Agent into request headers, appending any user-provided suffix.
   *
   * - Normalizes the header key to `User-Agent`.
   * - If `extra` is provided, or if headers already include `User-Agent`/`user-agent`, it is appended to the base string.
   */
  export function mergeUserAgentHeader(
    headers: Record<string, string> | undefined,
    baseUA: string,
    extra?: string,
  ): Record<string, string> {
    const h: Record<string, string> = { ...(headers ?? {}) };
    const provided = h['User-Agent'] ?? (h as any)['user-agent'];
    const suffix = extra ?? (typeof provided === 'string' ? provided : undefined);
    const finalUA = suffix ? `${baseUA} ${suffix}` : baseUA;
    delete (h as any)['user-agent'];
    h['User-Agent'] = finalUA;
    return h;
  }
  
  /**
   * Determines whether the environment permits setting a `User-Agent` header (Node only).
   */
  export function canSetUserAgent(): boolean {
    const g: any = globalThis as any;
    return !!g?.process?.versions?.node;
  }