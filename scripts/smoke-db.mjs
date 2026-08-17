import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { chromium } from "playwright";
import { PrismaClient } from "../src/generated/prisma/client.ts";

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const timestamp = Date.now().toString(36);
const smokeUser = {
  name: `Smoke Tester ${timestamp}`,
  email: `smoke-${timestamp}@example.com`,
  password: `Smoke-${timestamp}-Pass123!`,
};
const smokeRunbookTitle = `Smoke checkout ${timestamp}`;
const smokeServiceName = `Smoke Service ${timestamp}`;
const smokeInviteEmail = `invite-${timestamp}@example.com`;
const smokeReportSummary = `Smoke report ${timestamp}`;
const authTimeout = 60_000;
const actionTimeout = 30_000;
let launchedIncidentTitle = "";
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  }),
});

const result = {
  email: smokeUser.email,
  checks: [],
};

let browser;

try {
  await assertServerReady();

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(`${baseUrl}/sign-in`, { waitUntil: "domcontentloaded" });
  await openSignUpForm(page);
  await page.getByLabel("Name").fill(smokeUser.name);
  await page.getByLabel("Email").fill(smokeUser.email);
  await page.getByLabel("Password").fill(smokeUser.password);
  await page.getByRole("button", { name: /Create account/i }).click();
  await page.getByText("Saved workspace").waitFor({ state: "visible", timeout: authTimeout });
  result.checks.push("signed up and loaded saved workspace");

  await page.getByRole("button", { name: /New incident/i }).click();
  const incidentHeading = page.locator(".incident-workspace h2").first();
  await incidentHeading.waitFor({ state: "visible", timeout: actionTimeout });
  launchedIncidentTitle = (await incidentHeading.innerText()).trim();

  if (!launchedIncidentTitle || launchedIncidentTitle === "No incidents") {
    throw new Error("Incident launch did not select a launched incident.");
  }

  result.incidentTitle = launchedIncidentTitle;
  result.checks.push(`launched incident through server action: ${launchedIncidentTitle}`);

  await page.getByRole("button", { name: "Runbooks" }).click();
  await page.getByRole("heading", { name: "Edit runbook" }).waitFor({ state: "visible", timeout: 10_000 });
  await page.getByLabel("Title").first().fill(smokeRunbookTitle);
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByText(smokeRunbookTitle).first().waitFor({ state: "visible", timeout: actionTimeout });
  result.checks.push("edited and saved runbook through server action");

  await page.getByRole("button", { name: "Services" }).click();
  await page.getByRole("button", { name: "New service" }).click();
  await page.getByLabel("Name").fill(smokeServiceName);
  await page.getByLabel("Owner").fill("Smoke Operations");
  await page.getByLabel("SLO").fill("99.91%");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByText(smokeServiceName).first().waitFor({ state: "visible", timeout: actionTimeout });
  result.checks.push("created service through server action");

  await page.getByRole("button", { name: "Command" }).click();
  await page.locator(".report-form").getByLabel("Summary").fill(smokeReportSummary);
  await page.locator(".report-form").getByLabel("Impact").fill("Synthetic smoke test impact summary.");
  await page.locator(".report-form").getByLabel("Root cause").fill("Synthetic smoke test root cause.");
  await page.locator(".report-form").getByLabel("Resolution").fill("Synthetic smoke test resolution.");
  await page.locator(".report-form").getByLabel("Follow-ups").fill("Synthetic smoke test follow-up.");
  await page.getByRole("button", { name: "Save report" }).click();
  await page.getByText("Post-incident report updated.").waitFor({ state: "visible", timeout: actionTimeout });
  result.checks.push("saved post-incident report through server action");

  await page.getByRole("button", { name: "Team" }).click();
  await page.getByLabel("Email").fill(smokeInviteEmail);
  await page.getByRole("button", { name: "Invite" }).click();
  await page.getByText(smokeInviteEmail).waitFor({ state: "visible", timeout: actionTimeout });
  result.checks.push("created team invitation through server action");

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("Saved workspace").waitFor({ state: "visible", timeout: authTimeout });
  await page.getByRole("button", { name: "Services" }).click();
  await page.getByText(smokeServiceName).first().waitFor({ state: "visible", timeout: actionTimeout });
  await page.getByRole("button", { name: "Team" }).click();
  await page.getByText(smokeInviteEmail).waitFor({ state: "visible", timeout: actionTimeout });
  await page.getByRole("button", { name: "Runbooks" }).click();
  await page.getByText(smokeRunbookTitle).first().waitFor({ state: "visible", timeout: actionTimeout });
  await page.getByRole("button", { name: "Command" }).click();
  await page.getByRole("heading", { name: launchedIncidentTitle }).waitFor({ state: "visible", timeout: actionTimeout });
  await page.getByText(smokeReportSummary).waitFor({ state: "visible", timeout: actionTimeout });
  result.checks.push("refresh preserved incident, report, service, invite, and runbook edit");

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("link", { name: "Sign in" }).waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("link", { name: "Sign in" }).click();
  await page.getByLabel("Email").fill(smokeUser.email);
  await page.getByLabel("Password").fill(smokeUser.password);
  await page.getByRole("button", { name: /^Sign in$/ }).click();
  await page.getByText("Saved workspace").waitFor({ state: "visible", timeout: authTimeout });
  await page.getByRole("heading", { name: launchedIncidentTitle }).waitFor({ state: "visible", timeout: actionTimeout });
  await page.getByText(smokeReportSummary).waitFor({ state: "visible", timeout: actionTimeout });
  await page.getByRole("button", { name: "Services" }).click();
  await page.getByText(smokeServiceName).first().waitFor({ state: "visible", timeout: actionTimeout });
  await page.getByRole("button", { name: "Team" }).click();
  await page.getByText(smokeInviteEmail).waitFor({ state: "visible", timeout: actionTimeout });
  await page.getByRole("button", { name: "Runbooks" }).click();
  await page.getByText(smokeRunbookTitle).first().waitFor({ state: "visible", timeout: actionTimeout });
  result.checks.push("sign out/in preserved saved data");

  result.ok = true;
} catch (error) {
  result.ok = false;
  result.error = error.message;
  process.exitCode = 1;
} finally {
  if (browser) {
    await browser.close();
  }

  try {
    result.cleanup = await cleanupSmokeUser();
  } catch (error) {
    result.cleanupError = error.message;
    process.exitCode = 1;
  }

  await prisma.$disconnect();
  console.log(JSON.stringify(result, null, 2));
}

async function assertServerReady() {
  const response = await fetch(baseUrl, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Expected ${baseUrl} to be ready, got HTTP ${response.status}.`);
  }
}

async function openSignUpForm(page) {
  const createAccountToggle = page.getByRole("button", { name: "Create a new workspace account" });
  const nameField = page.getByLabel("Name");

  await createAccountToggle.waitFor({ state: "visible", timeout: actionTimeout });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
    await createAccountToggle.click();

    try {
      await nameField.waitFor({ state: "visible", timeout: 5_000 });
      return;
    } catch {
      // Static production pages can show the button before hydration wires up the click handler.
    }
  }

  await nameField.waitFor({ state: "visible", timeout: actionTimeout });
}

async function cleanupSmokeUser() {
  const user = await prisma.user.findUnique({
    where: { email: smokeUser.email },
    include: { memberships: true },
  });

  if (!user) {
    return { deletedUser: false, deletedOrganizations: 0 };
  }

  const organizationIds = user.memberships.map((membership) => membership.organizationId);
  let deletedOrganizations = 0;

  if (organizationIds.length > 0) {
    const organizationResult = await prisma.organization.deleteMany({
      where: { id: { in: organizationIds } },
    });
    deletedOrganizations = organizationResult.count;
  }

  await prisma.user.delete({
    where: { id: user.id },
  });

  return { deletedUser: true, deletedOrganizations };
}
