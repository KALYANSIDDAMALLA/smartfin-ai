import { describe, expect, it } from "vitest";
import { customerAddress } from "@/lib/integrations/setu";

describe("Setu customer address", () => {
  it("is the plain mobile number when no handle is configured", () => { expect(customerAddress("9999999999", "")).toBe("9999999999"); expect(customerAddress("9999999999", undefined)).toBe("9999999999"); });
  it("appends the Account Aggregator handle", () => expect(customerAddress("9999999999", "finvu")).toBe("9999999999@finvu"));
  it("tolerates a leading @ and spaces", () => expect(customerAddress("9999999999", " @finvu ")).toBe("9999999999@finvu"));
});

import { afterEach, vi } from "vitest";
import { bankLinkingOn } from "@/lib/integrations/setu";
describe("real bank linking switch", () => {
  afterEach(() => vi.unstubAllEnvs());
  const keys = () => { vi.stubEnv("SETU_CLIENT_ID", "id"); vi.stubEnv("SETU_CLIENT_SECRET", "secret"); vi.stubEnv("SETU_PRODUCT_INSTANCE_ID", "prod"); };
  it("is off when the keys are set but the switch is not", () => { keys(); vi.stubEnv("BANK_LINKING_ENABLED", ""); expect(bankLinkingOn()).toBe(false); });
  it("is off when the switch is on but the keys are missing", () => { vi.stubEnv("SETU_CLIENT_ID", ""); vi.stubEnv("BANK_LINKING_ENABLED", "true"); expect(bankLinkingOn()).toBe(false); });
  it("is on only with the keys and BANK_LINKING_ENABLED=true", () => { keys(); vi.stubEnv("BANK_LINKING_ENABLED", " TRUE "); expect(bankLinkingOn()).toBe(true); vi.stubEnv("BANK_LINKING_ENABLED", "yes"); expect(bankLinkingOn()).toBe(false); });
});
