import { describe, expect, it } from "vitest";
import { getEasterEgg } from "@/lib/word-search/easter-eggs";

describe("getEasterEgg", () => {
  it("returns ZOMP for the zomp trigger", () => {
    expect(getEasterEgg("  zOmP  ")).toEqual([
      { name: "ZOMP", hex: "#39A78E", display: "default" },
    ]);
  });
});
