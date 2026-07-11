import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as publicApi from "../../src/te-model/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TE_MODEL_DIR = join(ROOT, "src", "te-model");

/** Engine sources with comments stripped, so doc references don't trip code checks. */
function teModelSources(): Array<{ file: string; content: string }> {
  return readdirSync(TE_MODEL_DIR)
    .filter((f) => f.endsWith(".ts"))
    .map((file) => ({
      file,
      content: readFileSync(join(TE_MODEL_DIR, file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, ""),
    }));
}

describe("platform architecture (task §15.1)", () => {
  it("exposes exactly one public engine entry point", () => {
    const functionExports = Object.entries(publicApi).filter(
      ([, value]) => typeof value === "function" && !String(value).startsWith("class")
    );
    const engineFunctions = functionExports.filter(
      ([name]) => !["TEValidationError", "TEConfigurationError"].includes(name)
    );
    expect(engineFunctions.map(([name]) => name)).toEqual(["evaluateTightEnd"]);
  });

  it("does not import WR or RB football formulas or market modules", () => {
    for (const { file, content } of teModelSources()) {
      expect(content, file).not.toMatch(/from\s+["'].*wr-model/);
      expect(content, file).not.toMatch(/from\s+["'].*rb-model/);
      expect(content, file).not.toMatch(/from\s+["'].*(market|adp|trade|scarcity)/i);
    }
  });

  it("TE engine is self-contained (WR and RB engines remain untouched by TE work)", () => {
    // Originally the TE engine was developed in an isolated repository and this test
    // asserted src/wr-model and src/rb-model did not exist. After repository
    // consolidation those engines legitimately coexist here, guarded by their own
    // suites; the preserved guarantee is that TE sources never import outside
    // src/te-model. See TE_MVP_IMPLEMENTATION_DECISIONS.md.
    expect(existsSync(join(ROOT, "src", "wr-model"))).toBe(true);
    expect(existsSync(join(ROOT, "src", "rb-model"))).toBe(true);
    for (const { file, content } of teModelSources()) {
      const specifiers = [...content.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
      for (const specifier of specifiers) {
        expect(specifier, `${file} imports ${specifier}`).toMatch(/^\.\/[\w-]+\.js$/);
      }
    }
  });

  it("contains no randomness, clock reads, network, or file-system access in the engine", () => {
    for (const { file, content } of teModelSources()) {
      expect(content, file).not.toMatch(/Math\.random/);
      expect(content, file).not.toMatch(/Date\.now|new Date\(\)/);
      expect(content, file).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|require\(["']http/);
      expect(content, file).not.toMatch(/from\s+["']node:fs|from\s+["']fs["']/);
      expect(content, file).not.toMatch(/from\s+["']node:http|axios|undici/);
    }
  });

  it("scarcity, replacement value, TE premium, and market concepts are absent", () => {
    for (const { file, content } of teModelSources()) {
      expect(content, file).not.toMatch(/scarcity|replacement_value|te_premium|startability/i);
      expect(content, file).not.toMatch(/\badp\b|trade_value|market_price/i);
    }
  });

  it("public engine is deterministic across module state (no hidden mutable state)", () => {
    const input = {
      ...JSON.parse(
        readFileSync(join(ROOT, "fixtures", "te", "elite-receiving-focal-point.json"), "utf8")
      ),
    };
    const first = JSON.stringify(publicApi.evaluateTightEnd(input));
    for (let i = 0; i < 5; i += 1) {
      expect(JSON.stringify(publicApi.evaluateTightEnd(input))).toBe(first);
    }
  });
});
