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

  it("WR and RB engines remain untouched (absent from this repository)", () => {
    // The repository contained no WR/RB engines at implementation start; the TE work
    // must not have created or modified any. See TE_MVP_IMPLEMENTATION_DECISIONS.md.
    expect(existsSync(join(ROOT, "src", "wr-model"))).toBe(false);
    expect(existsSync(join(ROOT, "src", "rb-model"))).toBe(false);
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
