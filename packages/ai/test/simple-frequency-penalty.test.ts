import { describe, expect, it } from "vitest";
import { getModel } from "../src/models.ts";
import { streamSimple } from "../src/stream.ts";
import type { Api, Context, Model, SimpleStreamOptions } from "../src/types.ts";

class PayloadCaptured extends Error {
	constructor() {
		super("payload captured");
		this.name = "PayloadCaptured";
	}
}

function makeContext(): Context {
	return {
		messages: [{ role: "user", content: "Say hello.", timestamp: Date.now() }],
	};
}

async function capturePayload<TPayload>(model: Model<Api>, options: SimpleStreamOptions): Promise<TPayload> {
	let capturedPayload: TPayload | undefined;

	const stream = streamSimple(model, makeContext(), {
		...options,
		onPayload: (payload) => {
			capturedPayload = payload as TPayload;
			throw new PayloadCaptured();
		},
	});

	await stream.result();

	if (!capturedPayload) {
		throw new Error("Expected payload to be captured before provider request");
	}
	return capturedPayload;
}

describe("streamSimple frequencyPenalty", () => {
	it("maps OpenAI-compatible frequencyPenalty to frequency_penalty", async () => {
		const baseModel = getModel("openai", "gpt-4o-mini");
		const model: Model<"openai-completions"> = {
			...baseModel,
			api: "openai-completions",
			baseUrl: "http://127.0.0.1:9",
		};

		const payload = await capturePayload<{ frequency_penalty?: unknown }>(model, {
			apiKey: "fake-key",
			frequencyPenalty: 0.2,
		});

		expect(payload.frequency_penalty).toBe(0.2);
	});

	it("maps Google frequencyPenalty to config frequencyPenalty", async () => {
		const payload = await capturePayload<{
			config?: { frequencyPenalty?: unknown };
		}>(getModel("google", "gemini-2.5-flash"), {
			apiKey: "fake-key",
			frequencyPenalty: 0.2,
		});

		expect(payload.config?.frequencyPenalty).toBe(0.2);
	});

	it("maps Google Vertex frequencyPenalty to config frequencyPenalty", async () => {
		const payload = await capturePayload<{
			config?: { frequencyPenalty?: unknown };
		}>(getModel("google-vertex", "gemini-2.5-flash"), {
			apiKey: "fake-key",
			frequencyPenalty: 0.2,
		});

		expect(payload.config?.frequencyPenalty).toBe(0.2);
	});

	it("maps Mistral frequencyPenalty directly", async () => {
		const model: Model<"mistral-conversations"> = {
			...getModel("mistral", "mistral-small-2603"),
			baseUrl: "http://127.0.0.1:9",
		};

		const payload = await capturePayload<{ frequencyPenalty?: unknown }>(model, {
			apiKey: "fake-key",
			frequencyPenalty: 0.2,
		});

		expect(payload.frequencyPenalty).toBe(0.2);
	});

	it("rejects OpenAI Responses frequencyPenalty", async () => {
		const model: Model<"openai-responses"> = {
			...getModel("openai", "gpt-5.4-mini"),
			baseUrl: "http://127.0.0.1:9",
		};

		const message = await streamSimple(model, makeContext(), {
			apiKey: "fake-key",
			frequencyPenalty: 0.2,
		}).result();

		expect(message.stopReason).toBe("error");
		expect(message.errorMessage).toContain("OpenAI Responses streamSimple does not support frequencyPenalty");
	});

	it("rejects Azure OpenAI Responses frequencyPenalty", async () => {
		const model: Model<"azure-openai-responses"> = {
			...getModel("azure-openai-responses", "gpt-5.4-mini"),
			baseUrl: "https://example.openai.azure.com",
		};

		const message = await streamSimple(model, makeContext(), {
			apiKey: "fake-key",
			azureDeploymentName: "gpt-5.4-mini",
			frequencyPenalty: 0.2,
		} as SimpleStreamOptions).result();

		expect(message.stopReason).toBe("error");
		expect(message.errorMessage).toContain("Azure OpenAI Responses streamSimple does not support frequencyPenalty");
	});

	it("rejects Anthropic frequencyPenalty", async () => {
		const model: Model<"anthropic-messages"> = {
			...getModel("anthropic", "claude-sonnet-4-5"),
			baseUrl: "http://127.0.0.1:9",
		};

		const message = await streamSimple(model, makeContext(), {
			apiKey: "fake-key",
			frequencyPenalty: 0.2,
		}).result();

		expect(message.stopReason).toBe("error");
		expect(message.errorMessage).toContain("Anthropic streamSimple does not support frequencyPenalty");
	});

	it("rejects Bedrock frequencyPenalty", async () => {
		const message = await streamSimple(
			getModel("amazon-bedrock", "global.anthropic.claude-sonnet-4-5-20250929-v1:0"),
			makeContext(),
			{ frequencyPenalty: 0.2 },
		).result();

		expect(message.stopReason).toBe("error");
		expect(message.errorMessage).toContain("Amazon Bedrock streamSimple does not support frequencyPenalty");
	});
});
