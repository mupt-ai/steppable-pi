import type {
	Api,
	Context,
	Model,
	SimpleStreamOptions,
	SimpleToolChoice,
	StopSequences,
	StreamOptions,
	ThinkingBudgets,
	ThinkingLevel,
} from "../types.ts";
import { estimateContextTokens } from "../utils/estimate.ts";

const CONTEXT_SAFETY_TOKENS = 4096;
const MIN_MAX_TOKENS = 1;

export function clampMaxTokensToContext(model: Model<Api>, context: Context, maxTokens: number): number {
	if (model.contextWindow <= 0) return Math.max(MIN_MAX_TOKENS, maxTokens);
	const available = model.contextWindow - estimateContextTokens(context).tokens - CONTEXT_SAFETY_TOKENS;
	return Math.min(maxTokens, Math.max(MIN_MAX_TOKENS, available));
}

export function buildBaseOptions(
	model: Model<Api>,
	context: Context,
	options?: SimpleStreamOptions,
	apiKey?: string,
): StreamOptions {
	return {
		temperature: options?.temperature,
		maxTokens: clampMaxTokensToContext(model, context, options?.maxTokens ?? model.maxTokens),
		topP: options?.topP,
		frequencyPenalty: options?.frequencyPenalty,
		responseFormat: options?.responseFormat,
		stop: options?.stop,
		signal: options?.signal,
		apiKey: apiKey || options?.apiKey,
		transport: options?.transport,
		cacheRetention: options?.cacheRetention,
		sessionId: options?.sessionId,
		headers: options?.headers,
		onPayload: options?.onPayload,
		onResponse: options?.onResponse,
		timeoutMs: options?.timeoutMs,
		websocketConnectTimeoutMs: options?.websocketConnectTimeoutMs,
		maxRetries: options?.maxRetries,
		maxRetryDelayMs: options?.maxRetryDelayMs,
		metadata: options?.metadata,
		env: options?.env,
	};
}

export function clampReasoning(effort: ThinkingLevel | undefined): Exclude<ThinkingLevel, "xhigh" | "max"> | undefined {
	return effort === "xhigh" || effort === "max" ? "high" : effort;
}

export function mapSimpleToolChoiceToFunctionChoice(
	choice: SimpleToolChoice | undefined,
): "auto" | "none" | "required" | { type: "function"; function: { name: string } } | undefined {
	if (choice === "any") return "required";
	if (choice === "auto" || choice === "none" || choice === "required") return choice;
	if (choice?.type === "function") return choice;
	return undefined;
}

export function mapSimpleToolChoiceToAnyToolChoice(
	choice: SimpleToolChoice | undefined,
): "auto" | "any" | "none" | { type: "tool"; name: string } | undefined {
	if (choice === "required") return "any";
	if (choice === "auto" || choice === "any" || choice === "none") return choice;
	if (choice?.type === "function") return { type: "tool", name: choice.function.name };
	return undefined;
}

export function mapSimpleToolChoiceToGoogleChoice(
	choice: SimpleToolChoice | undefined,
): "auto" | "none" | "any" | undefined {
	if (choice === "required") return "any";
	if (choice === "auto" || choice === "none" || choice === "any") return choice;
	return undefined;
}

export function normalizeStopSequences(stop: StopSequences | undefined): string[] | undefined {
	if (stop === undefined) return undefined;
	return Array.isArray(stop) ? stop : [stop];
}

export function adjustMaxTokensForThinking(
	// Undefined means no explicit caller cap. Use the model cap and fit thinking inside it.
	baseMaxTokens: number | undefined,
	modelMaxTokens: number,
	reasoningLevel: ThinkingLevel,
	customBudgets?: ThinkingBudgets,
): { maxTokens: number; thinkingBudget: number } {
	const defaultBudgets: ThinkingBudgets = {
		minimal: 1024,
		low: 2048,
		medium: 8192,
		high: 16384,
	};
	const budgets = { ...defaultBudgets, ...customBudgets };

	const minOutputTokens = 1024;
	const level = clampReasoning(reasoningLevel)!;
	let thinkingBudget = budgets[level]!;
	const maxTokens =
		baseMaxTokens === undefined ? modelMaxTokens : Math.min(baseMaxTokens + thinkingBudget, modelMaxTokens);

	if (maxTokens <= thinkingBudget) {
		thinkingBudget = Math.max(0, maxTokens - minOutputTokens);
	}

	return { maxTokens, thinkingBudget };
}
