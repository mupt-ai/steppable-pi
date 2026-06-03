import { Type } from "typebox";
import { describe, expect, it } from "vitest";
import { getModel } from "../src/models.ts";
import { streamSimple } from "../src/stream.ts";
import type { Api, Context, Model, SimpleStreamOptions, Tool } from "../src/types.ts";

class PayloadCaptured extends Error {
	constructor() {
		super("payload captured");
		this.name = "PayloadCaptured";
	}
}

const tool: Tool = {
	name: "ping",
	description: "Ping tool",
	parameters: Type.Object({
		ok: Type.Boolean(),
	}),
};

function makeContext(): Context {
	return {
		messages: [{ role: "user", content: "Call ping with ok=true", timestamp: Date.now() }],
		tools: [tool],
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

describe("streamSimple toolChoice", () => {
	it("maps OpenAI-compatible any to required", async () => {
		const baseModel = getModel("openai", "gpt-4o-mini");
		const model: Model<"openai-completions"> = {
			...baseModel,
			api: "openai-completions",
			baseUrl: "http://127.0.0.1:9",
		};

		const payload = await capturePayload<{ tool_choice?: unknown }>(model, {
			apiKey: "fake-key",
			toolChoice: "any",
		});

		expect(payload.tool_choice).toBe("required");
	});

	it("maps Anthropic required to any", async () => {
		const model: Model<"anthropic-messages"> = {
			...getModel("anthropic", "claude-sonnet-4-5"),
			baseUrl: "http://127.0.0.1:9",
		};

		const payload = await capturePayload<{ tool_choice?: unknown }>(model, {
			apiKey: "fake-key",
			toolChoice: "required",
		});

		expect(payload.tool_choice).toEqual({ type: "any" });
	});

	it("maps Anthropic specific functions to tool choices", async () => {
		const model: Model<"anthropic-messages"> = {
			...getModel("anthropic", "claude-sonnet-4-5"),
			baseUrl: "http://127.0.0.1:9",
		};

		const payload = await capturePayload<{ tool_choice?: unknown }>(model, {
			apiKey: "fake-key",
			toolChoice: { type: "function", function: { name: "ping" } },
		});

		expect(payload.tool_choice).toEqual({ type: "tool", name: "ping" });
	});

	it("maps Bedrock required to any", async () => {
		const payload = await capturePayload<{
			toolConfig?: { toolChoice?: unknown };
		}>(getModel("amazon-bedrock", "global.anthropic.claude-sonnet-4-5-20250929-v1:0"), {
			toolChoice: "required",
		});

		expect(payload.toolConfig?.toolChoice).toEqual({ any: {} });
	});

	it("maps Mistral specific functions directly", async () => {
		const model: Model<"mistral-conversations"> = {
			...getModel("mistral", "mistral-small-2603"),
			baseUrl: "http://127.0.0.1:9",
		};

		const payload = await capturePayload<{ toolChoice?: unknown }>(model, {
			apiKey: "fake-key",
			toolChoice: { type: "function", function: { name: "ping" } },
		});

		expect(payload.toolChoice).toEqual({ type: "function", function: { name: "ping" } });
	});

	it("maps Google required to any", async () => {
		const model: Model<"google-generative-ai"> = {
			...getModel("google", "gemini-2.5-flash"),
		};

		const payload = await capturePayload<{
			config?: { toolConfig?: { functionCallingConfig?: { mode?: unknown } } };
		}>(model, {
			apiKey: "fake-key",
			toolChoice: "required",
		});

		expect(payload.config?.toolConfig?.functionCallingConfig?.mode).toBe("ANY");
	});

	it("rejects Google specific function choices", async () => {
		const model: Model<"google-generative-ai"> = {
			...getModel("google", "gemini-2.5-flash"),
		};

		const message = await streamSimple(model, makeContext(), {
			apiKey: "fake-key",
			toolChoice: { type: "function", function: { name: "ping" } },
		}).result();

		expect(message.stopReason).toBe("error");
		expect(message.errorMessage).toContain(
			"Google streamSimple does not support forcing a specific tool with toolChoice",
		);
	});

	it("maps OpenAI Responses specific functions", async () => {
		const model: Model<"openai-responses"> = {
			...getModel("openai", "gpt-5.4-mini"),
			baseUrl: "http://127.0.0.1:9",
		};

		const payload = await capturePayload<{ tool_choice?: unknown }>(model, {
			apiKey: "fake-key",
			toolChoice: { type: "function", function: { name: "ping" } },
		});

		expect(payload.tool_choice).toEqual({ type: "function", name: "ping" });
	});

	it("maps Azure OpenAI Responses any to required", async () => {
		const model: Model<"azure-openai-responses"> = {
			...getModel("azure-openai-responses", "gpt-5.4-mini"),
			baseUrl: "https://example.openai.azure.com",
		};

		const payload = await capturePayload<{ tool_choice?: unknown }>(model, {
			apiKey: "fake-key",
			azureDeploymentName: "gpt-5.4-mini",
			toolChoice: "any",
		} as SimpleStreamOptions);

		expect(payload.tool_choice).toBe("required");
	});
});
