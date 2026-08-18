import { expect, test } from "@playwright/test";

test("loads the landing page with clear entry paths", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Runbook Studio" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Explore demo" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create account", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open saved workspace" })).toBeVisible();
});

test("loads the demo incident command dashboard", async ({ page }) => {
  await page.goto("/demo");

  await expect(page.getByRole("heading", { name: "Incident command" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Incidents" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Checkout latency above SLO" })).toBeVisible();
  await expect(page.getByRole("button", { name: /New incident/i })).toBeVisible();

  await page.getByRole("button", { name: "Runbooks" }).click();
  await expect(page.getByRole("heading", { name: "Edit runbook" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New runbook" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Launch Checkout latency above SLO/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save" })).toBeVisible();

  await page.getByRole("button", { name: "Services" }).click();
  await expect(page.getByRole("heading", { name: "Edit service" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New service" })).toBeVisible();

  await page.getByRole("button", { name: "Team" }).click();
  await expect(page.getByRole("heading", { name: "Team" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Invite" })).toBeVisible();

  await page.getByRole("button", { name: "Reports" }).click();
  await expect(page.getByRole("heading", { name: "36m" })).toBeVisible();
  await expect(page.getByText("Noisy services")).toBeVisible();
});
