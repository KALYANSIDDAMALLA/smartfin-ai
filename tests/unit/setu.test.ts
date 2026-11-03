import { describe, expect, it } from "vitest";
import { customerAddress } from "@/lib/integrations/setu";

describe("Setu customer address", () => {
  it("is the plain mobile number when no handle is configured", () => { expect(customerAddress("9999999999", "")).toBe("9999999999"); expect(customerAddress("9999999999", undefined)).toBe("9999999999"); });
  it("appends the Account Aggregator handle", () => expect(customerAddress("9999999999", "finvu")).toBe("9999999999@finvu"));
  it("tolerates a leading @ and spaces", () => expect(customerAddress("9999999999", " @finvu ")).toBe("9999999999@finvu"));
});
