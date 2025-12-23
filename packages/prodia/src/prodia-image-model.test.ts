import type { FetchFunction } from "@ai-sdk/provider-utils";
import { createTestServer } from "@ai-sdk/test-server/with-vitest";
import { describe, expect, it } from "vitest";
import { ProdiaImageModel } from "./prodia-image-model";

const prompt = "A cute baby sea otter";

function createBasicModel({
	headers,
	fetch,
	currentDate,
}: {
	headers?: () => Record<string, string | undefined>;
	fetch?: FetchFunction;
	currentDate?: () => Date;
} = {}) {
	return new ProdiaImageModel("inference.flux-fast.schnell.txt2img.v2", {
		provider: "prodia.image",
		baseURL: "https://api.example.com/v2",
		headers: headers ?? (() => ({ Authorization: "Bearer test-key" })),
		fetch,
		_internal: {
			currentDate,
		},
	});
}

describe("ProdiaImageModel", () => {
	const server = createTestServer({
		"https://api.example.com/v2/job": {
			response: {
				type: "binary",
				body: Buffer.from("test-binary-content"),
			},
		},
	});

	describe("doGenerate", () => {
		it("passes the correct parameters including providerOptions", async () => {
			const model = createBasicModel();

			await model.doGenerate({
				prompt,
				files: undefined,
				mask: undefined,
				n: 1,
				size: undefined,
				aspectRatio: undefined,
				seed: 12345,
				providerOptions: {
					prodia: {
						steps: 30,
					},
				},
			});

			expect(await server.calls[0].requestBodyJson).toStrictEqual({
				type: "inference.flux-fast.schnell.txt2img.v2",
				config: {
					prompt,
					seed: 12345,
					steps: 30,
				},
			});
		});

		it("includes width and height when size is provided", async () => {
			const model = createBasicModel();

			await model.doGenerate({
				prompt,
				files: undefined,
				mask: undefined,
				n: 1,
				size: "1024x768",
				aspectRatio: undefined,
				seed: undefined,
				providerOptions: {},
			});

			expect(await server.calls[0].requestBodyJson).toStrictEqual({
				type: "inference.flux-fast.schnell.txt2img.v2",
				config: {
					prompt,
					width: 1024,
					height: 768,
				},
			});
		});

		it("provider options width/height take precedence over size", async () => {
			const model = createBasicModel();

			await model.doGenerate({
				prompt,
				files: undefined,
				mask: undefined,
				n: 1,
				size: "1024x768",
				aspectRatio: undefined,
				seed: undefined,
				providerOptions: {
					prodia: {
						width: 512,
						height: 512,
					},
				},
			});

			expect(await server.calls[0].requestBodyJson).toStrictEqual({
				type: "inference.flux-fast.schnell.txt2img.v2",
				config: {
					prompt,
					width: 512,
					height: 512,
				},
			});
		});

		it("includes safety_tolerance when safetyTolerance is provided", async () => {
			const model = createBasicModel();

			await model.doGenerate({
				prompt,
				files: undefined,
				mask: undefined,
				n: 1,
				size: undefined,
				aspectRatio: undefined,
				seed: undefined,
				providerOptions: {
					prodia: {
						safetyTolerance: 3,
					},
				},
			});

			expect(await server.calls[0].requestBodyJson).toStrictEqual({
				type: "inference.flux-fast.schnell.txt2img.v2",
				config: {
					prompt,
					safety_tolerance: 3,
				},
			});
		});

		it("calls the correct endpoint", async () => {
			const model = createBasicModel();

			await model.doGenerate({
				prompt,
				files: undefined,
				mask: undefined,
				n: 1,
				size: undefined,
				aspectRatio: undefined,
				seed: undefined,
				providerOptions: {},
			});

			expect(server.calls[0].requestMethod).toBe("POST");
			expect(server.calls[0].requestUrl).toBe("https://api.example.com/v2/job");
		});

		it("sends Accept: image/png header", async () => {
			const model = createBasicModel();

			await model.doGenerate({
				prompt,
				files: undefined,
				mask: undefined,
				n: 1,
				size: undefined,
				aspectRatio: undefined,
				seed: undefined,
				providerOptions: {},
			});

			expect(server.calls[0].requestHeaders.accept).toBe("image/png");
		});

		it("merges provider and request headers", async () => {
			const modelWithHeaders = createBasicModel({
				headers: () => ({
					"Custom-Provider-Header": "provider-header-value",
					Authorization: "Bearer test-key",
				}),
			});

			await modelWithHeaders.doGenerate({
				prompt,
				files: undefined,
				mask: undefined,
				n: 1,
				providerOptions: {},
				headers: {
					"Custom-Request-Header": "request-header-value",
				},
				size: undefined,
				seed: undefined,
				aspectRatio: undefined,
			});

			expect(server.calls[0].requestHeaders).toMatchObject({
				"content-type": "application/json",
				"custom-provider-header": "provider-header-value",
				"custom-request-header": "request-header-value",
				authorization: "Bearer test-key",
				accept: "image/png",
			});
		});

		it("returns image bytes from synchronous response", async () => {
			const model = createBasicModel();

			const result = await model.doGenerate({
				prompt,
				files: undefined,
				mask: undefined,
				n: 1,
				size: undefined,
				seed: undefined,
				aspectRatio: undefined,
				providerOptions: {},
			});

			expect(result.images).toHaveLength(1);
			const image = result.images[0];
			expect(image).toBeInstanceOf(Uint8Array);
			// image is Uint8Array based on the check above
			expect(Buffer.from(image as Uint8Array<ArrayBufferLike>).toString()).toBe(
				"test-binary-content",
			);
		});

		it("warns on invalid size format", async () => {
			const model = createBasicModel();

			const result = await model.doGenerate({
				prompt,
				files: undefined,
				mask: undefined,
				n: 1,
				size: "invalid" as `${number}x${number}`,
				seed: undefined,
				aspectRatio: undefined,
				providerOptions: {},
			});

			expect(result.warnings).toMatchInlineSnapshot(`
        [
          {
            "details": "Invalid size format: invalid. Expected format: WIDTHxHEIGHT (e.g., 1024x1024)",
            "feature": "size",
            "type": "unsupported",
          },
        ]
      `);
		});

		it("handles API errors", async () => {
			server.urls["https://api.example.com/v2/job"].response = {
				type: "error",
				status: 400,
				body: JSON.stringify({
					message: "Invalid prompt",
					detail: "Prompt cannot be empty",
				}),
			};

			const model = createBasicModel();

			await expect(
				model.doGenerate({
					prompt,
					files: undefined,
					mask: undefined,
					n: 1,
					providerOptions: {},
					size: undefined,
					seed: undefined,
					aspectRatio: undefined,
				}),
			).rejects.toMatchObject({
				message: "Prompt cannot be empty",
				statusCode: 400,
				url: "https://api.example.com/v2/job",
			});
		});

		it("includes timestamp, headers, and modelId in response metadata", async () => {
			server.urls["https://api.example.com/v2/job"].response = {
				type: "binary",
				body: Buffer.from("test-binary-content"),
			};

			const testDate = new Date("2025-01-01T00:00:00Z");
			const model = createBasicModel({
				currentDate: () => testDate,
			});

			const result = await model.doGenerate({
				prompt,
				files: undefined,
				mask: undefined,
				n: 1,
				providerOptions: {},
				size: undefined,
				seed: undefined,
				aspectRatio: undefined,
			});

			expect(result.response).toStrictEqual({
				timestamp: testDate,
				modelId: "inference.flux-fast.schnell.txt2img.v2",
				headers: expect.any(Object),
			});
		});
	});

	describe("constructor", () => {
		it("exposes correct provider and model information", () => {
			const model = createBasicModel();

			expect(model.provider).toBe("prodia.image");
			expect(model.modelId).toBe("inference.flux-fast.schnell.txt2img.v2");
			expect(model.specificationVersion).toBe("v3");
			expect(model.maxImagesPerCall).toBe(1);
		});
	});
});
