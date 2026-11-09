import { expect, test } from "@playwright/test";

/** These browser tests act on visible controls, not React state or mock internals. */
test.beforeEach(async ({ page }) => {
  await page.goto("/controller-test.html");
});

test("operator sees sent, acknowledged, and then separately reported valve status", async ({ page }) => {
  const controls = page.getByRole("region", { name: "Operator controls" });
  const simulator = page.getByRole("region", { name: "Simulated stand controls" });

  await controls.getByRole("button", { name: /Open Oxidizer fill \(mock\); Available/ }).click();
  await expect(controls.getByRole("status")).toContainText("Valve OF OPEN: request sent");
  await expect(controls.getByText("Reported:", { exact: false }).filter({ hasText: "CLOSED" })).toBeVisible();

  await simulator.getByRole("button", { name: "Evaluate next request (mock)" }).click();
  await expect(controls.getByRole("status")).toContainText("Valve OF OPEN: mock acknowledged");
  // The mock acceptance alone must not change the reported valve position.
  await expect(controls.getByText("Reported:", { exact: false }).filter({ hasText: "CLOSED" })).toBeVisible();

  await simulator.getByRole("button", { name: "Publish accepted valve report (mock)" }).click();
  await expect(controls.getByRole("status")).toContainText("Valve OF OPEN: matching simulated report");
  await expect(controls.getByText("Reported:", { exact: false }).filter({ hasText: "OPEN" })).toBeVisible();
});

test("operator cannot manually operate valves in SAFE and sees a rejected request", async ({ page }) => {
  const controls = page.getByRole("region", { name: "Operator controls" });
  const simulator = page.getByRole("region", { name: "Simulated stand controls" });

  await simulator.getByRole("button", { name: "Simulate stand entering SAFE" }).click();
  await expect(controls.getByText("Manual valve controls unavailable in this reported mode.")).toBeVisible();
  await expect(controls.getByRole("button", { name: /Open Oxidizer fill/ })).toHaveCount(0);

  await controls.getByRole("button", { name: /Checkout\s+Available/ }).click();
  await simulator.getByRole("button", { name: "Reject next request (mock)" }).click();
  await expect(controls.getByRole("status")).toContainText("Mode CHECKOUT: rejected");
  await expect(controls.getByText("Manual valve controls unavailable in this reported mode.")).toBeVisible();
});

test("operator cannot submit invalid Fire timing from the panel", async ({ page }) => {
  const controls = page.getByRole("region", { name: "Operator controls" });
  const simulator = page.getByRole("region", { name: "Simulated stand controls" });

  await simulator.getByLabel("Reported mode").selectOption("PRESSURIZATION_FIRE");
  await controls.getByRole("textbox", { name: "Burn time (µs)" }).fill("0");
  await controls.getByRole("textbox", { name: "Ignition offset (µs)" }).fill("-15");
  await controls.getByRole("textbox", { name: "Propellant offset (µs)" }).fill("5");
  await expect(controls.getByText(/Burn time must be a positive whole number/)).toBeVisible();
  await expect(controls.getByRole("button", { name: "Fire (mock only)" })).toBeDisabled();
  await expect(controls.getByRole("status")).toHaveText("No requests yet");
});
