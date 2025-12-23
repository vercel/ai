import { createTestServer } from "@ai-sdk/test-server/with-vitest";
import { describe, expect, it } from "vitest";
import { createProdia } from "./prodia-provider";

const server = createTestServer({
	"https://api.example.com/v2/job": {
		response: {
			type: "binary",
			body: Buffer.from([1, 2, 3]),
		},
	},
});

describe("Prodia provider", () => {
	it("creates image models via .image and .imageModel", () => {
		const provider = createProdia();

		const imageModel = provider.image("inference.flux-fast.schnell.txt2img.v2");
		const imageModel2 = provider.imageModel(
			"inference.flux.schnell.txt2img.v2",
		);

		expect(imageModel.provider).toBe("prodia.image");
		expect(imageModel.modelId).toBe("inference.flux-fast.schnell.txt2img.v2");
		expect(imageModel2.modelId).toBe("inference.flux.schnell.txt2img.v2");
		expect(imageModel.specificationVersion).toBe("v3");
	});

	it("configures baseURL and headers correctly", async () => {
		const provider = createProdia({
			apiKey: "test-api-key",
			baseURL: "https://api.example.com/v2",
			headers: {
				"x-extra-header": "extra",
			},
		});

		const model = provider.image("inference.flux-fast.schnell.txt2img.v2");

		await model.doGenerate({
			prompt: "A serene mountain landscape at sunset",
			files: undefined,
			mask: undefined,
			n: 1,
			size: undefined,
			seed: undefined,
			aspectRatio: undefined,
			providerOptions: {},
		});

		expect(server.calls[0].requestUrl).toBe("https://api.example.com/v2/job");
		expect(server.calls[0].requestMethod).toBe("POST");
		expect(server.calls[0].requestHeaders.authorization).toBe(
			"Bearer test-api-key",
		);
		expect(server.calls[0].requestHeaders["x-extra-header"]).toBe("extra");
		expect(server.calls[0].requestHeaders.accept).toBe("image/png");
		expect(await server.calls[0].requestBodyJson).toMatchObject({
			type: "inference.flux-fast.schnell.txt2img.v2",
			config: {
				prompt: "A serene mountain landscape at sunset",
			},
		});

		expect(server.calls[0].requestUserAgent).toContain("ai-sdk/prodia/");
	});

	it("throws NoSuchModelError for unsupported model types", () => {
		const provider = createProdia();

		expect(() => provider.languageModel("some-id")).toThrowError(
			"No such languageModel",
		);
		expect(() => provider.embeddingModel("some-id")).toThrowError(
			"No such embeddingModel",
		);
	});
});
