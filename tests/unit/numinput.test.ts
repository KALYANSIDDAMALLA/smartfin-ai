import { describe, it, expect } from "vitest";
import { groupIndian, sanitizeNumber } from "@/components/num-input";

describe("number input rules", () => {
  it("groups digits the Indian way", () => { expect(groupIndian("999")).toBe("999"); expect(groupIndian("1000")).toBe("1,000"); expect(groupIndian("123456")).toBe("1,23,456"); expect(groupIndian("12345678")).toBe("1,23,45,678"); expect(groupIndian("007")).toBe("7"); });
  it("money: letters and symbols never stay, commas are added, 2 decimals max", () => {
    expect(sanitizeNumber("abc", "money")).toBe(""); expect(sanitizeNumber("12ab34", "money")).toBe("1,234"); expect(sanitizeNumber("₹ 1,25,000.5x", "money")).toBe("1,25,000.5"); expect(sanitizeNumber("1234567.891", "money")).toBe("12,34,567.89");
    expect(sanitizeNumber("Rs. 1,25,000.50 only", "money")).toBe("1,25,000.50"); expect(sanitizeNumber("INR 450", "money")).toBe("450");
    expect(sanitizeNumber("12.", "money")).toBe("12."); expect(sanitizeNumber(".5", "money")).toBe("0.5"); expect(sanitizeNumber("1.2.3", "money")).toBe("1.23"); expect(sanitizeNumber("-500", "money")).toBe("500"); expect(sanitizeNumber("1".repeat(20), "money").replace(/,/g, "")).toHaveLength(12);
  });
  it("decimal, int and list modes", () => {
    expect(sanitizeNumber("9.2567x", "decimal")).toBe("9.2567"); expect(sanitizeNumber("12,5", "decimal")).toBe("125"); expect(sanitizeNumber("1a2.5", "int")).toBe("125"); expect(sanitizeNumber("50, 75,,90 ,x100", "list")).toBe("50,75,90,100");
  });
});

import { pageWindow } from "@/components/pagination";
describe("pagination window", () => {
  it("shows every page when there are few, and a compact window with gaps when there are many", () => {
    expect(pageWindow(1, 1)).toEqual([1]); expect(pageWindow(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(pageWindow(1, 122)).toEqual([1, 2, "…", 121, 122]); expect(pageWindow(5, 18)).toEqual([1, 2, 4, 5, 6, "…", 17, 18].flatMap((n, i, a) => (i && typeof n === "number" && typeof a[i - 1] === "number" && n - (a[i - 1] as number) > 1 ? ["…", n] : [n])));
    expect(pageWindow(61, 122)).toEqual([1, 2, "…", 60, 61, 62, "…", 121, 122]); expect(pageWindow(122, 122)).toEqual([1, 2, "…", 121, 122]);
  });
});
