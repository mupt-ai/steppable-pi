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
		messages: [{ role: "user", content: "Say hello and stop when instructed.", timestamp: Date.now() }],
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

describe("streamSimple stop", () => {
	it("maps OpenAI-compatible stop directly", async () => {
		const baseModel = getModel("openai", "gpt-4o-mini");
		const model: Model<"openai-completions"> = {
			...baseModel,
			api: "openai-completions",
			baseUrl: "http://127.0.0.1:9",
		};

		const payload = await capturePayload<{ stop?: unknown }>(model, {
			apiKey: "fake-key",
			stop: ["END"],
		});

		expect(payload.stop).toEqual(["END"]);
	});

	it("maps Anthropic stop to stop_sequences", async () => {
		const model: Model<"anthropic-messages"> = {
			...getModel("anthropic", "claude-sonnet-4-5"),
			baseUrl: "http://127.0.0.1:9",
		};

		const payload = await capturePayload<{ stop_sequences?: unknown }>(model, {
			apiKey: "fake-key",
			stop: "END",
		});

		expect(payload.stop_sequences).toEqual(["END"]);
	});

	it("maps Bedrock stop to inferenceConfig stopSequences", async () => {
		const payload = await capturePayload<{
			inferenceConfig?: { stopSequences?: unknown };
		}>(getModel("amazon-bedrock", "global.anthropic.claude-sonnet-4-5-20250929-v1:0"), {
			stop: ["END"],
		});

		expect(payload.inferenceConfig?.stopSequences).toEqual(["END"]);
	});

	it("maps Google stop to config stopSequences", async () => {
		const payload = await capturePayload<{
			config?: { stopSequences?: unknown };
		}>(getModel("google", "gemini-2.5-flash"), {
			apiKey: "fake-key",
			stop: "END",
		});

		expect(payload.config?.stopSequences).toEqual(["END"]);
	});

	it("maps Google Vertex stop to config stopSequences", async () => {
		const payload = await capturePayload<{
			config?: { stopSequences?: unknown };
		}>(getModel("google-vertex", "gemini-2.5-flash"), {
			apiKey: "fake-key",
			stop: "END",
		});

		expect(payload.config?.stopSequences).toEqual(["END"]);
	});

	it("maps Mistral stop directly", async () => {
		const model: Model<"mistral-conversations"> = {
			...getModel("mistral", "mistral-small-2603"),
			baseUrl: "http://127.0.0.1:9",
		};

		const payload = await capturePayload<{ stop?: unknown }>(model, {
			apiKey: "fake-key",
			stop: ["END"],
		});

		expect(payload.stop).toEqual(["END"]);
	});

	it("rejects OpenAI Responses stop", async () => {
		const model: Model<"openai-responses"> = {
			...getModel("openai", "gpt-5.4-mini"),
			baseUrl: "http://127.0.0.1:9",
		};

		const message = await streamSimple(model, makeContext(), {
			apiKey: "fake-key",
			stop: "END",
		}).result();

		expect(message.stopReason).toBe("error");
		expect(message.errorMessage).toContain("OpenAI Responses streamSimple does not support stop sequences");
	});

	it("rejects Azure OpenAI Responses stop", async () => {
		const model: Model<"azure-openai-responses"> = {
			...getModel("azure-openai-responses", "gpt-5.4-mini"),
			baseUrl: "https://example.openai.azure.com",
		};

		const message = await streamSimple(model, makeContext(), {
			apiKey: "fake-key",
			azureDeploymentName: "gpt-5.4-mini",
			stop: "END",
		} as SimpleStreamOptions).result();

		expect(message.stopReason).toBe("error");
		expect(message.errorMessage).toContain("Azure OpenAI Responses streamSimple does not support stop sequences");
	});
});
