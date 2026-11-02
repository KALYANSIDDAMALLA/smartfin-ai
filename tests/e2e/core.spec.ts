import { test, expect, type Page } from "@playwright/test";
// Requires a project with email confirmation DISABLED (staging). Each run creates fresh users.
const pw = "Sup3r-secret-pass!";
async function signUp(page: Page, email: string) {
  await page.goto("/register"); await page.getByLabel(/email/i).fill(email); await page.getByLabel(/password/i).first().fill(pw);
  await page.getByRole("button", { name: /sign up|create|register/i }).click(); await page.waitForURL(/dashboard|login/);
  if (page.url().includes("login")) { await page.getByLabel(/email/i).fill(email); await page.getByLabel(/password/i).fill(pw); await page.getByRole("button", { name: /log in|sign in/i }).click(); }
  await expect(page).toHaveURL(/dashboard/);
}
test("user flow: add data, budget, goal, assistant, export, and isolation", async ({ page, browser }) => {
  const a = `e2e+${Date.now()}@example.com`; await signUp(page, a);
  await page.goto("/income"); await page.getByLabel(/amount/i).fill("50000"); await page.getByLabel("Name").fill("Salary"); await page.getByRole("button", { name: "Save" }).click(); await expect(page.getByText("Transaction saved.")).toBeVisible();
  await page.goto("/expenses/new"); await page.getByLabel(/amount/i).fill("1200.50"); await page.getByLabel("Name").fill("Groceries"); await page.getByRole("button", { name: "Save" }).click(); await expect(page.getByText("Transaction saved.")).toBeVisible();
  await page.goto("/transactions?range=year"); await expect(page.getByText("Groceries")).toBeVisible();
  await page.goto("/budgets"); await page.getByLabel("Name").first().fill("Monthly"); await page.getByLabel(/limit/i).first().fill("10000"); await page.getByRole("button", { name: "Create budget" }).click(); await expect(page.getByText("Budget created.")).toBeVisible();
  await page.goto("/goals"); await page.getByLabel("Name").first().fill("Emergency"); await page.getByLabel(/target \(/i).first().fill("100000"); await page.getByRole("button", { name: "Create goal" }).click(); await expect(page.getByText("Goal created.")).toBeVisible();
  await page.goto("/ai/assistant"); await page.getByLabel("Your question").fill("How much did I spend this month?"); await page.getByRole("button", { name: "Ask" }).click(); await expect(page.getByText(/You spent/)).toBeVisible();
  const csv = await page.request.get("/api/reports?format=csv&range=year"); expect(csv.status()).toBe(200); expect(await csv.text()).toContain("Groceries");
  // a second user must not see the first user's records
  const ctx = await browser.newContext(); const p2 = await ctx.newPage(); await signUp(p2, `e2e2+${Date.now()}@example.com`);
  await p2.goto("/transactions?range=year"); await expect(p2.getByText("Groceries")).toHaveCount(0);
  expect((await p2.request.get("/api/reports?format=csv&range=year").then((r) => r.text()))).not.toContain("Groceries");
});
