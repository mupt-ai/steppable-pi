import { Type } from "typebox";
import { describe, expect, it } from "vitest";
import { streamSimple } from "../src/compat.ts";
import type { Context, Model, Tool } from "../src/types.ts";

class PayloadCaptured extends Error {}

interface AnthropicPayload {
	betas?: string[];
	tools?: Array<{ name: string; type?: string; description?: string; defer_loading?: boolean }>;
}

function tool(name: string, extra: Partial<Tool> = {}): Tool {
	return { name, description: `${name} tool`, parameters: Type.Object({}), ...extra };
}

function model(id: string, compat: Model<"anthropic-messages">["compat"] = {}): Model<"anthropic-messages"> {
	return {
		id,
		name: id,
		api: "anthropic-messages",
		provider: "anthropic",
		baseUrl: "http://127.0.0.1:9",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 100000,
		maxTokens: 1000,
		compat,
	};
}

async function capturePayload(target: Model<"anthropic-messages">, context: Context): Promise<AnthropicPayload> {
	let captured: AnthropicPayload | undefined;
	const stream = streamSimple(target, context, {
		apiKey: "test-key",
		onPayload: (payload) => {
			captured = payload as AnthropicPayload;
			throw new PayloadCaptured();
		},
	});
	await stream.result();
	if (!captured) throw new Error("Expected payload capture");
	return captured;
}

const userMessage = { role: "user" as const, content: "hi", timestamp: 1 };
const deferred = tool("client_deferred", { deferLoading: true });

describe("client-deferred Anthropic tools", () => {
	it("defers caller-marked tools", async () => {
		const payload = await capturePayload(model("claude-opus-4-6"), {
			messages: [userMessage],
			tools: [tool("base_tool"), deferred],
		});

		expect(payload.tools).toMatchObject([{ name: "base_tool" }, { name: "client_deferred", defer_loading: true }]);
		expect(payload.tools?.[0]?.defer_loading).toBeUndefined();
	});

	it("keeps a caller-marked tool the transcript already called immediate", async () => {
		const payload = await capturePayload(model("claude-opus-4-6"), {
			messages: [
				userMessage,
				{
					role: "assistant",
					content: [{ type: "toolCall", id: "toolu_1", name: "client_deferred", arguments: {} }],
					api: "anthropic-messages",
					provider: "anthropic",
					model: "claude-opus-4-6",
					usage: {
						input: 0,
						output: 0,
						cacheRead: 0,
						cacheWrite: 0,
						totalTokens: 0,
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
					},
					stopReason: "toolUse",
					timestamp: 2,
				},
			],
			tools: [tool("base_tool"), deferred],
		});

		expect(payload.tools?.find((entry) => entry.name === "client_deferred")?.defer_loading).toBeUndefined();
	});

	it("keeps every tool immediate when all are caller-marked", async () => {
		const payload = await capturePayload(model("claude-opus-4-6"), { messages: [userMessage], tools: [deferred] });

		expect(payload.tools?.[0]?.defer_loading).toBeUndefined();
	});

	it("does not defer for models without deferred tool support", async () => {
		const payload = await capturePayload(model("claude-haiku-4-5"), {
			messages: [userMessage],
			tools: [tool("base_tool"), deferred],
		});

		expect(payload.tools?.every((entry) => entry.defer_loading === undefined)).toBe(true);
	});

	it("emits server tools without function-tool fields", async () => {
		const payload = await capturePayload(model("claude-opus-4-6"), {
			messages: [userMessage],
			tools: [
				tool("tool_search_tool_regex", { serverTool: true, type: "tool_search_tool_regex_20251119" }),
				deferred,
			],
		});
		const emitted = payload.tools?.find((entry) => entry.name === "tool_search_tool_regex");

		expect(emitted).toMatchObject({ type: "tool_search_tool_regex_20251119" });
		expect(emitted && "description" in emitted).toBe(false);
	});

	it("keeps client-deferred tools deferred alongside native tool changes", async () => {
		const payload = await capturePayload(
			model("claude-opus-5", { supportsMidConvoSystemMessages: true, supportsMidConvoToolChanges: true }),
			{
				messages: [
					{ role: "system", content: "", toolsAdded: [tool("base_tool"), deferred], timestamp: 0 },
					userMessage,
					{ role: "system", content: "", toolsAdded: [tool("late_tool")], timestamp: 2 },
				],
			},
		);

		expect(payload.betas).toContain("mid-conversation-tool-changes-2026-07-01");
		expect(payload.tools?.map((entry) => [entry.name, entry.defer_loading === true])).toEqual([
			["base_tool", false],
			["__pi_deferred_placeholder__", true],
			["client_deferred", true],
			["late_tool", true],
		]);
	});

	it("does not use native tool changes for providers without deferred tool support", async () => {
		const payload = await capturePayload(
			{
				...model("claude-opus-5", { supportsMidConvoSystemMessages: true, supportsMidConvoToolChanges: true }),
				provider: "azure",
			},
			{
				messages: [
					{ role: "system", content: "", toolsAdded: [tool("base_tool")], timestamp: 0 },
					userMessage,
					{ role: "system", content: "", toolsAdded: [tool("late_tool")], timestamp: 2 },
				],
			},
		);

		expect(payload.betas ?? []).not.toContain("mid-conversation-tool-changes-2026-07-01");
		expect(payload.tools?.map((entry) => entry.name)).toEqual(["base_tool", "late_tool"]);
	});
});
