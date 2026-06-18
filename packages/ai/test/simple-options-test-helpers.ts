import { streamSimple } from "../src/stream.ts";
import type { Api, Context, Model, SimpleStreamOptions } from "../src/types.ts";

class PayloadCaptured extends Error {
	constructor() {
		super("payload captured");
		this.name = "PayloadCaptured";
	}
}

export function makeSimpleContext(content = "Say hello."): Context {
	return {
		messages: [{ role: "user", content, timestamp: Date.now() }],
	};
}

export async function captureSimplePayload<TPayload>(
	model: Model<Api>,
	options: SimpleStreamOptions,
	context: Context = makeSimpleContext(),
): Promise<TPayload> {
	let capturedPayload: TPayload | undefined;

	const stream = streamSimple(model, context, {
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
