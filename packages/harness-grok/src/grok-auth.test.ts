import { describe, expect, it } from "vitest";

import { parseGrokDeviceLoginOutput } from "./grok-oauth.js";
import { resolveGrokAuthMethodId, resolveGrokEnv } from "./grok-auth.js";

describe("resolveGrokAuthMethodId", () => {
  it("uses api_key when XAI_API_KEY is set", () => {
    expect(resolveGrokAuthMethodId({ apiKey: "xai-test" })).toBe("xai.api_key");
  });

  it("uses oauth when no api key", () => {
    expect(resolveGrokAuthMethodId({})).toBe("xai.oauth");
  });
});

describe("resolveGrokEnv", () => {
  it("forwards api key to sandbox env", () => {
    expect(resolveGrokEnv({ apiKey: "secret" })).toEqual({ XAI_API_KEY: "secret" });
  });

  it("returns empty env for oauth mode", () => {
    expect(resolveGrokEnv({})).toEqual({});
  });
});

describe("parseGrokDeviceLoginOutput", () => {
  it("parses device login URL and code", () => {
    const parsed = parseGrokDeviceLoginOutput(
      "Visit https://x.ai/oauth/device?code=ABC-123\nEnter code: ABC-123",
    );
    expect(parsed?.url).toContain("https://x.ai/oauth");
    expect(parsed?.userCode).toBe("ABC-123");
  });
});