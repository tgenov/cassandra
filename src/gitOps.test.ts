import { describe, it, expect } from "vitest";
import { supportsModernMergeTree } from "./gitOps";

describe("supportsModernMergeTree", () => {
  it("returns true for the minimum supported version 2.38.0", () => {
    expect(supportsModernMergeTree("git version 2.38.0")).toBe(true);
  });

  it("returns true for a version above the minimum (2.43.0)", () => {
    expect(supportsModernMergeTree("git version 2.43.0")).toBe(true);
  });

  it("returns false for version 2.37.0 (one minor below minimum)", () => {
    expect(supportsModernMergeTree("git version 2.37.0")).toBe(false);
  });

  it("returns false for version 2.37.5 (patch level does not help)", () => {
    expect(supportsModernMergeTree("git version 2.37.5")).toBe(false);
  });

  it("returns false for an old major version (1.9.0)", () => {
    expect(supportsModernMergeTree("git version 1.9.0")).toBe(false);
  });

  it("returns true for a future major version (3.0.0)", () => {
    expect(supportsModernMergeTree("git version 3.0.0")).toBe(true);
  });

  it("returns false for a garbage string with no version numbers", () => {
    expect(supportsModernMergeTree("not a version")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(supportsModernMergeTree("")).toBe(false);
  });

  it("returns true for Windows git version suffix", () => {
    expect(supportsModernMergeTree("git version 2.43.0.windows.1")).toBe(true);
  });

  it("returns true for Apple Git version suffix", () => {
    expect(supportsModernMergeTree("git version 2.39.5 (Apple Git-154)")).toBe(
      true,
    );
  });

  it("returns true for exact format with patch version", () => {
    expect(supportsModernMergeTree("git version 2.38.1")).toBe(true);
  });
});
