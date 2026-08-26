import { afterEach, describe, expect, it } from "vitest";
import { getProviderEnvValue } from "../src/utils/provider-env.ts";

const ENV_NAME = "PI_PROVIDER_ENV_TEST";
const originalValue = process.env[ENV_NAME];

afterEach(() => {
	if (originalValue === undefined) {
		delete process.env[ENV_NAME];
	} else {
		process.env[ENV_NAME] = originalValue;
	}
});

describe("provider environment values", () => {
	it("uses a scoped override before the ambient environment", () => {
		process.env[ENV_NAME] = "ambient";

		expect(getProviderEnvValue(ENV_NAME, { [ENV_NAME]: "scoped" })).toBe("scoped");
	});

	it("treats an empty scoped override as authoritative", () => {
		process.env[ENV_NAME] = "ambient";

		expect(getProviderEnvValue(ENV_NAME, { [ENV_NAME]: "" })).toBe("");
	});

	it("falls back to the ambient environment when the scoped key is absent", () => {
		process.env[ENV_NAME] = "ambient";

		expect(getProviderEnvValue(ENV_NAME, {})).toBe("ambient");
	});
});
