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

describe("streamSimple topP", () => {
	it("maps OpenAI-compatible topP to top_p", async () => {
		const baseModel = getModel("openai", "gpt-4o-mini");
		const model: Model<"openai-completions"> = {
			...baseModel,
			api: "openai-completions",
			baseUrl: "http://127.0.0.1:9",
		};

		const payload = await capturePayload<{ top_p?: unknown }>(model, {
			apiKey: "fake-key",
			topP: 0.8,
		});

		expect(payload.top_p).toBe(0.8);
	});

	it("maps OpenAI Responses topP to top_p", async () => {
		const model: Model<"openai-responses"> = {
			...getModel("openai", "gpt-5.4-mini"),
			baseUrl: "http://127.0.0.1:9",
		};

		const payload = await capturePayload<{ top_p?: unknown }>(model, {
			apiKey: "fake-key",
			topP: 0.8,
		});

		expect(payload.top_p).toBe(0.8);
	});

	it("maps Azure OpenAI Responses topP to top_p", async () => {
		const model: Model<"azure-openai-responses"> = {
			...getModel("azure-openai-responses", "gpt-5.4-mini"),
			baseUrl: "https://example.openai.azure.com",
		};

		const payload = await capturePayload<{ top_p?: unknown }>(model, {
			apiKey: "fake-key",
			azureDeploymentName: "gpt-5.4-mini",
			topP: 0.8,
		} as SimpleStreamOptions);

		expect(payload.top_p).toBe(0.8);
	});

	it("maps Bedrock topP to inferenceConfig topP", async () => {
		const payload = await capturePayload<{
			inferenceConfig?: { topP?: unknown };
		}>(getModel("amazon-bedrock", "global.anthropic.claude-sonnet-4-5-20250929-v1:0"), {
			topP: 0.8,
		});

		expect(payload.inferenceConfig?.topP).toBe(0.8);
	});

	it("maps Google topP to config topP", async () => {
		const payload = await capturePayload<{
			config?: { topP?: unknown };
		}>(getModel("google", "gemini-2.5-flash"), {
			apiKey: "fake-key",
			topP: 0.8,
		});

		expect(payload.config?.topP).toBe(0.8);
	});

	it("maps Google Vertex topP to config topP", async () => {
		const payload = await capturePayload<{
			config?: { topP?: unknown };
		}>(getModel("google-vertex", "gemini-2.5-flash"), {
			apiKey: "fake-key",
			topP: 0.8,
		});

		expect(payload.config?.topP).toBe(0.8);
	});

	it("maps Mistral topP directly", async () => {
		const model: Model<"mistral-conversations"> = {
			...getModel("mistral", "mistral-small-2603"),
			baseUrl: "http://127.0.0.1:9",
		};

		const payload = await capturePayload<{ topP?: unknown }>(model, {
			apiKey: "fake-key",
			topP: 0.8,
		});

		expect(payload.topP).toBe(0.8);
	});

	it("rejects Anthropic topP", async () => {
		const model: Model<"anthropic-messages"> = {
			...getModel("anthropic", "claude-sonnet-4-5"),
			baseUrl: "http://127.0.0.1:9",
		};

		const message = await streamSimple(model, makeContext(), {
			apiKey: "fake-key",
			topP: 0.8,
		}).result();

		expect(message.stopReason).toBe("error");
		expect(message.errorMessage).toContain("Anthropic streamSimple does not support topP");
	});
});
