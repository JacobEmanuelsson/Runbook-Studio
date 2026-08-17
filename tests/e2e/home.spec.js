import { expect, test } from "@playwright/test";

test("loads the incident command dashboard", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Incident command" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Incidents" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Checkout latency above SLO" })).toBeVisible();
  await expect(page.getByRole("button", { name: /New incident/i })).toBeVisible();

  await page.getByRole("button", { name: "Runbooks" }).click();
  await expect(page.getByRole("heading", { name: "Edit runbook" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New runbook" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Launch Checkout latency above SLO/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
});
