import { describe, expect, it } from "vitest";
import { validationState } from "@/lib/integrations/razorpay";
import { UPI_RE, maskUpi } from "@/lib/upi";

describe("Account validation result", () => {
  it("is verified only when completed AND the account is active", () => {
    expect(validationState({ id: "fav_1", status: "completed", results: { account_status: "active", registered_name: "A B" } })).toBe("verified");
    expect(validationState({ id: "fav_1", status: "completed", results: { account_status: "invalid" } })).toBe("failed");
    expect(validationState({ id: "fav_1", status: "completed", results: null })).toBe("failed");
  });
  it("is failed when Razorpay says failed, and pending for anything not finished", () => {
    expect(validationState({ id: "fav_1", status: "failed" })).toBe("failed");
    expect(validationState({ id: "fav_1", status: "created" })).toBe("pending");
    expect(validationState({ id: "fav_1", status: "processing" })).toBe("pending");
  });
});

describe("UPI id", () => {
  it("accepts normal ids and Razorpay's test ids", () => {
    for (const ok of ["rahul@okhdfc", "success@razorpay", "a.b-c_1@ybl", "9876543210@paytm"]) expect(UPI_RE.test(ok)).toBe(true);
  });
  it("rejects malformed ids", () => {
    for (const bad of ["", "rahul", "@bank", "rahul@", "ra hul@bank", "rahul@bank!", "a@b", "x@@y.z"]) expect(UPI_RE.test(bad)).toBe(false);
  });
  it("masks all but the first two characters of the handle and keeps the bank part", () => {
    expect(maskUpi("rahul@okhdfc")).toBe("ra•••@okhdfc");
    expect(maskUpi("ab@ybl")).toBe("ab••@ybl");
    expect(maskUpi("success@razorpay")).not.toContain("success");
  });
});
