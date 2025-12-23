import type { ImageModelV3, SharedV3Warning } from "@ai-sdk/provider";
import type { InferSchema, Resolvable } from "@ai-sdk/provider-utils";
import {
	combineHeaders,
	createJsonErrorResponseHandler,
	type FetchFunction,
	lazySchema,
	parseProviderOptions,
	postToApi,
	resolve,
	zodSchema,
} from "@ai-sdk/provider-utils";
import { z } from "zod/v4";
import type { ProdiaImageModelId } from "./prodia-image-settings";

export class ProdiaImageModel implements ImageModelV3 {
	readonly specificationVersion = "v3";
	readonly maxImagesPerCall = 1;

	get provider(): string {
		return this.config.provider;
	}

	constructor(
		readonly modelId: ProdiaImageModelId,
		private readonly config: ProdiaImageModelConfig,
	) {}

	private async getArgs({
		prompt,
		size,
		seed,
		providerOptions,
	}: Parameters<ImageModelV3["doGenerate"]>[0]) {
		const warnings: Array<SharedV3Warning> = [];

		const prodiaOptions = await parseProviderOptions({
			provider: "prodia",
			providerOptions,
			schema: prodiaImageProviderOptionsSchema,
		});

		let width: number | undefined;
		let height: number | undefined;
		if (size) {
			const [widthStr, heightStr] = size.split("x");
			width = Number(widthStr);
			height = Number(heightStr);
			if (!Number.isFinite(width) || !Number.isFinite(height)) {
				warnings.push({
					type: "unsupported",
					feature: "size",
					details: `Invalid size format: ${size}. Expected format: WIDTHxHEIGHT (e.g., 1024x1024)`,
				});
				width = undefined;
				height = undefined;
			}
		}

		const jobConfig: Record<string, unknown> = {
			prompt,
		};

		if (prodiaOptions?.width !== undefined) {
			jobConfig.width = prodiaOptions.width;
		} else if (width !== undefined) {
			jobConfig.width = width;
		}

		if (prodiaOptions?.height !== undefined) {
			jobConfig.height = prodiaOptions.height;
		} else if (height !== undefined) {
			jobConfig.height = height;
		}

		if (seed !== undefined) {
			jobConfig.seed = seed;
		}
		if (prodiaOptions?.steps !== undefined) {
			jobConfig.steps = prodiaOptions.steps;
		}
		if (prodiaOptions?.safetyTolerance !== undefined) {
			jobConfig.safety_tolerance = prodiaOptions.safetyTolerance;
		}

		const body = {
			type: this.modelId,
			config: jobConfig,
		};

		return { body, warnings };
	}

	async doGenerate(
		options: Parameters<ImageModelV3["doGenerate"]>[0],
	): Promise<Awaited<ReturnType<ImageModelV3["doGenerate"]>>> {
		const { body, warnings } = await this.getArgs(options);

		const currentDate = this.config._internal?.currentDate?.() ?? new Date();
		const combinedHeaders = combineHeaders(
			await resolve(this.config.headers),
			options.headers,
		);

		const { value: imageBytes, responseHeaders } = await postToApi({
			url: `${this.config.baseURL}/job`,
			headers: {
				...combinedHeaders,
				Accept: "image/png",
				"Content-Type": "application/json",
			},
			body: {
				content: JSON.stringify(body),
				values: body,
			},
			failedResponseHandler: prodiaFailedResponseHandler,
			successfulResponseHandler: createBinaryResponseHandler(),
			abortSignal: options.abortSignal,
			fetch: this.config.fetch,
		});

		return {
			images: [imageBytes],
			warnings,
			response: {
				modelId: this.modelId,
				timestamp: currentDate,
				headers: responseHeaders,
			},
		};
	}
}

export const prodiaImageProviderOptionsSchema = lazySchema(() =>
	zodSchema(
		z.object({
			/**
			 * Number of inference steps. Higher values may produce better quality but take longer.
			 */
			steps: z.number().int().min(1).max(50).optional(),
			/**
			 * Output width in pixels. Must be a multiple of 16.
			 */
			width: z.number().int().min(64).max(4096).optional(),
			/**
			 * Output height in pixels. Must be a multiple of 16.
			 */
			height: z.number().int().min(64).max(4096).optional(),
			/**
			 * Safety filter tolerance level. 0 is strict, 5 is permissive.
			 */
			safetyTolerance: z.number().int().min(0).max(5).optional(),
		}),
	),
);

export type ProdiaImageProviderOptions = InferSchema<
	typeof prodiaImageProviderOptionsSchema
>;

interface ProdiaImageModelConfig {
	provider: string;
	baseURL: string;
	headers?: Resolvable<Record<string, string | undefined>>;
	fetch?: FetchFunction;
	_internal?: {
		currentDate?: () => Date;
	};
}

function createBinaryResponseHandler() {
	return async ({
		response,
	}: {
		response: Response;
	}): Promise<{
		value: Uint8Array;
		responseHeaders: Record<string, string>;
	}> => {
		const arrayBuffer = await response.arrayBuffer();
		const responseHeaders: Record<string, string> = {};
		response.headers.forEach((value, key) => {
			responseHeaders[key] = value;
		});
		return {
			value: new Uint8Array(arrayBuffer),
			responseHeaders,
		};
	};
}

const prodiaErrorSchema = z.object({
	message: z.string().optional(),
	detail: z.unknown().optional(),
	error: z.string().optional(),
});

const prodiaFailedResponseHandler = createJsonErrorResponseHandler({
	errorSchema: prodiaErrorSchema,
	errorToMessage: (error) => {
		const parsed = prodiaErrorSchema.safeParse(error);
		if (!parsed.success) return "Unknown Prodia error";
		const { message, detail, error: errorField } = parsed.data;
		if (typeof detail === "string") return detail;
		if (detail != null) {
			try {
				return JSON.stringify(detail);
			} catch {
				// ignore
			}
		}
		return errorField ?? message ?? "Unknown Prodia error";
	},
});
