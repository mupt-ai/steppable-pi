import { describe, expect, it } from "vitest";
import { getModel } from "../src/models.ts";
import { streamSimple } from "../src/stream.ts";
import type { Api, Context, Model, ResponseFormat, SimpleStreamOptions } from "../src/types.ts";

class PayloadCaptured extends Error {
	constructor() {
		super("payload captured");
		this.name = "PayloadCaptured";
	}
}

const schema = {
	type: "object",
	properties: {
		ok: { type: "boolean" },
	},
	required: ["ok"],
	additionalProperties: false,
};

const jsonSchemaFormat: ResponseFormat = {
	type: "json_schema",
	jsonSchema: {
		name: "ok_result",
		description: "A tiny result object",
		schema,
		strict: true,
	},
};

function makeContext(): Context {
	return {
		messages: [{ role: "user", content: "Return JSON with ok=true.", timestamp: Date.now() }],
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

describe("streamSimple responseFormat", () => {
	it("maps OpenAI-compatible json_schema to response_format", async () => {
		const baseModel = getModel("openai", "gpt-4o-mini");
		const model: Model<"openai-completions"> = {
			...baseModel,
			api: "openai-completions",
			baseUrl: "http://127.0.0.1:9",
		};

		const payload = await capturePayload<{ response_format?: unknown }>(model, {
			apiKey: "fake-key",
			responseFormat: jsonSchemaFormat,
		});

		expect(payload.response_format).toEqual({
			type: "json_schema",
			json_schema: {
				name: "ok_result",
				description: "A tiny result object",
				schema,
				strict: true,
			},
		});
	});

	it("maps OpenAI Responses json_schema to text format", async () => {
		const model: Model<"openai-responses"> = {
			...getModel("openai", "gpt-5.4-mini"),
			baseUrl: "http://127.0.0.1:9",
		};

		const payload = await capturePayload<{ text?: { format?: unknown } }>(model, {
			apiKey: "fake-key",
			responseFormat: jsonSchemaFormat,
		});

		expect(payload.text?.format).toEqual({
			type: "json_schema",
			name: "ok_result",
			description: "A tiny result object",
			schema,
			strict: true,
		});
	});

	it("maps Azure OpenAI Responses json_schema to text format", async () => {
		const model: Model<"azure-openai-responses"> = {
			...getModel("azure-openai-responses", "gpt-5.4-mini"),
			baseUrl: "https://example.openai.azure.com",
		};

		const payload = await capturePayload<{ text?: { format?: unknown } }>(model, {
			apiKey: "fake-key",
			azureDeploymentName: "gpt-5.4-mini",
			responseFormat: jsonSchemaFormat,
		} as SimpleStreamOptions);

		expect(payload.text?.format).toEqual({
			type: "json_schema",
			name: "ok_result",
			description: "A tiny result object",
			schema,
			strict: true,
		});
	});

	it("maps Anthropic json_schema to output_config format", async () => {
		const model: Model<"anthropic-messages"> = {
			...getModel("anthropic", "claude-sonnet-4-5"),
			baseUrl: "http://127.0.0.1:9",
		};

		const payload = await capturePayload<{ output_config?: { format?: unknown } }>(model, {
			apiKey: "fake-key",
			responseFormat: jsonSchemaFormat,
		});

		expect(payload.output_config?.format).toEqual({
			type: "json_schema",
			schema,
		});
	});

	it("rejects Anthropic json_object", async () => {
		const model: Model<"anthropic-messages"> = {
			...getModel("anthropic", "claude-sonnet-4-5"),
			baseUrl: "http://127.0.0.1:9",
		};

		const message = await streamSimple(model, makeContext(), {
			apiKey: "fake-key",
			responseFormat: { type: "json_object" },
		}).result();

		expect(message.stopReason).toBe("error");
		expect(message.errorMessage).toContain("Anthropic streamSimple does not support responseFormat json_object");
	});

	it("maps Bedrock json_schema to outputConfig textFormat", async () => {
		const payload = await capturePayload<{
			outputConfig?: {
				textFormat?: {
					type?: unknown;
					structure?: { jsonSchema?: { name?: unknown; schema?: unknown; description?: unknown } };
				};
			};
		}>(getModel("amazon-bedrock", "global.anthropic.claude-sonnet-4-5-20250929-v1:0"), {
			responseFormat: jsonSchemaFormat,
		});

		expect(payload.outputConfig?.textFormat?.type).toBe("json_schema");
		expect(payload.outputConfig?.textFormat?.structure?.jsonSchema).toEqual({
			name: "ok_result",
			description: "A tiny result object",
			schema: JSON.stringify(schema),
		});
	});

	it("rejects Bedrock json_object", async () => {
		const message = await streamSimple(
			getModel("amazon-bedrock", "global.anthropic.claude-sonnet-4-5-20250929-v1:0"),
			makeContext(),
			{ responseFormat: { type: "json_object" } },
		).result();

		expect(message.stopReason).toBe("error");
		expect(message.errorMessage).toContain("Amazon Bedrock streamSimple does not support responseFormat json_object");
	});

	it("maps Google json_object to JSON MIME type", async () => {
		const payload = await capturePayload<{
			config?: { responseMimeType?: unknown };
		}>(getModel("google", "gemini-2.5-flash"), {
			apiKey: "fake-key",
			responseFormat: { type: "json_object" },
		});

		expect(payload.config?.responseMimeType).toBe("application/json");
	});

	it("maps Google json_schema to responseJsonSchema", async () => {
		const payload = await capturePayload<{
			config?: { responseMimeType?: unknown; responseJsonSchema?: unknown };
		}>(getModel("google", "gemini-2.5-flash"), {
			apiKey: "fake-key",
			responseFormat: jsonSchemaFormat,
		});

		expect(payload.config?.responseMimeType).toBe("application/json");
		expect(payload.config?.responseJsonSchema).toEqual(schema);
	});

	it("maps Google Vertex json_schema to responseJsonSchema", async () => {
		const payload = await capturePayload<{
			config?: { responseMimeType?: unknown; responseJsonSchema?: unknown };
		}>(getModel("google-vertex", "gemini-2.5-flash"), {
			apiKey: "fake-key",
			responseFormat: jsonSchemaFormat,
		});

		expect(payload.config?.responseMimeType).toBe("application/json");
		expect(payload.config?.responseJsonSchema).toEqual(schema);
	});

	it("maps Mistral json_schema to responseFormat", async () => {
		const model: Model<"mistral-conversations"> = {
			...getModel("mistral", "mistral-small-2603"),
			baseUrl: "http://127.0.0.1:9",
		};

		const payload = await capturePayload<{ responseFormat?: unknown }>(model, {
			apiKey: "fake-key",
			responseFormat: jsonSchemaFormat,
		});

		expect(payload.responseFormat).toEqual({
			type: "json_schema",
			jsonSchema: {
				name: "ok_result",
				description: "A tiny result object",
				schemaDefinition: schema,
				strict: true,
			},
		});
	});
});
