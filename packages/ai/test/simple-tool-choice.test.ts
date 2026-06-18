import { Type } from "typebox";
import { describe, expect, it } from "vitest";
import { getModel } from "../src/models.ts";
import { streamSimple } from "../src/stream.ts";
import type { Context, Model, SimpleStreamOptions, Tool } from "../src/types.ts";
import { captureSimplePayload } from "./simple-options-test-helpers.ts";

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

describe("streamSimple toolChoice", () => {
	it("maps OpenAI-compatible any to required", async () => {
		const baseModel = getModel("openai", "gpt-4o-mini");
		const model: Model<"openai-completions"> = {
			...baseModel,
			api: "openai-completions",
			baseUrl: "http://127.0.0.1:9",
		};

		const payload = await captureSimplePayload<{ tool_choice?: unknown }>(
			model,
			{
				apiKey: "fake-key",
				toolChoice: "any",
			},
			makeContext(),
		);

		expect(payload.tool_choice).toBe("required");
	});

	it("maps Anthropic required to any", async () => {
		const model: Model<"anthropic-messages"> = {
			...getModel("anthropic", "claude-sonnet-4-5"),
			baseUrl: "http://127.0.0.1:9",
		};

		const payload = await captureSimplePayload<{ tool_choice?: unknown }>(
			model,
			{
				apiKey: "fake-key",
				toolChoice: "required",
			},
			makeContext(),
		);

		expect(payload.tool_choice).toEqual({ type: "any" });
	});

	it("maps Anthropic specific functions to tool choices", async () => {
		const model: Model<"anthropic-messages"> = {
			...getModel("anthropic", "claude-sonnet-4-5"),
			baseUrl: "http://127.0.0.1:9",
		};

		const payload = await captureSimplePayload<{ tool_choice?: unknown }>(
			model,
			{
				apiKey: "fake-key",
				toolChoice: { type: "function", function: { name: "ping" } },
			},
			makeContext(),
		);

		expect(payload.tool_choice).toEqual({ type: "tool", name: "ping" });
	});

	it("maps Bedrock required to any", async () => {
		const payload = await captureSimplePayload<{
			toolConfig?: { toolChoice?: unknown };
		}>(
			getModel("amazon-bedrock", "global.anthropic.claude-sonnet-4-5-20250929-v1:0"),
			{
				toolChoice: "required",
			},
			makeContext(),
		);

		expect(payload.toolConfig?.toolChoice).toEqual({ any: {} });
	});

	it("maps Mistral specific functions directly", async () => {
		const model: Model<"mistral-conversations"> = {
			...getModel("mistral", "mistral-small-2603"),
			baseUrl: "http://127.0.0.1:9",
		};

		const payload = await captureSimplePayload<{ toolChoice?: unknown }>(
			model,
			{
				apiKey: "fake-key",
				toolChoice: { type: "function", function: { name: "ping" } },
			},
			makeContext(),
		);

		expect(payload.toolChoice).toEqual({ type: "function", function: { name: "ping" } });
	});

	it("maps Google required to any", async () => {
		const model: Model<"google-generative-ai"> = {
			...getModel("google", "gemini-2.5-flash"),
		};

		const payload = await captureSimplePayload<{
			config?: { toolConfig?: { functionCallingConfig?: { mode?: unknown } } };
		}>(
			model,
			{
				apiKey: "fake-key",
				toolChoice: "required",
			},
			makeContext(),
		);

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

		const payload = await captureSimplePayload<{ tool_choice?: unknown }>(
			model,
			{
				apiKey: "fake-key",
				toolChoice: { type: "function", function: { name: "ping" } },
			},
			makeContext(),
		);

		expect(payload.tool_choice).toEqual({ type: "function", name: "ping" });
	});

	it("maps Azure OpenAI Responses any to required", async () => {
		const model: Model<"azure-openai-responses"> = {
			...getModel("azure-openai-responses", "gpt-5.4-mini"),
			baseUrl: "https://example.openai.azure.com",
		};

		const payload = await captureSimplePayload<{ tool_choice?: unknown }>(
			model,
			{
				apiKey: "fake-key",
				azureDeploymentName: "gpt-5.4-mini",
				toolChoice: "any",
			} as SimpleStreamOptions,
			makeContext(),
		);

		expect(payload.tool_choice).toBe("required");
	});
});
