const { test, expect } = require("@playwright/test");

// Helper: register + login a unique test user via API, then navigate to /quiz
async function loginTestUser(page) {
  const uid = "tester_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
  // Register via API
  await page.goto("http://localhost:8080/login");
  const regRes = await page.evaluate(async (u) => {
    const r = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: u, displayName: "Test User", password: "test123" }),
    });
    return r.ok;
  }, uid);
  if (!regRes) {
    throw new Error("Failed to register test user");
  }
  await page.goto("http://localhost:8080/quiz");
  // Select "All Domains" from topic selector
  await page.waitForSelector("#topic-selector");
  await page.locator(".topic-card").first().click();
  await page.waitForSelector("#question-number");
}

// Helper: reset progress via API
async function resetProgress(page) {
  await page.evaluate(() => fetch("/api/progress", { method: "DELETE" }));
}

test.describe("Quiz App", () => {
  test.beforeEach(async ({ page }) => {
    await loginTestUser(page);
    await resetProgress(page);
    await page.reload();
    // After reset+reload, topic selector appears
    await page.waitForSelector("#topic-selector");
    await page.locator(".topic-card").first().click();
    await page.waitForSelector("#question-number");
  });

  test("loads and displays question", async ({ page }) => {
    await expect(page.locator("h1")).toContainText("Claude Certified Architect");
    await expect(page.locator("#question-number")).toContainText("Question 1");
    await expect(page.locator("#question-text")).not.toBeEmpty();
    await expect(page.locator("#progress")).toContainText("Question 1 / 126");
  });

  test("displays all 4 answer options", async ({ page }) => {
    const options = page.locator(".option-btn");
    await expect(options).toHaveCount(4);
  });

  test("selecting correct answer shows correct banner and explanation", async ({ page }) => {
    await page.locator('.option-btn[data-key="B"]').click();
    await expect(page.locator("#result-banner")).toContainText("Correct");
    await expect(page.locator("#result-banner")).toHaveClass(/correct/);
    await expect(page.locator("#correct-explanation")).not.toBeEmpty();
  });

  test("selecting wrong answer shows incorrect banner", async ({ page }) => {
    await page.locator('.option-btn[data-key="A"]').click();
    await expect(page.locator("#result-banner")).toContainText("Incorrect");
    await expect(page.locator("#result-banner")).toHaveClass(/wrong/);
  });

  test("explanation is shown after answering", async ({ page }) => {
    await page.locator('.option-btn[data-key="B"]').click();
    await expect(page.locator("#correct-explanation")).not.toBeEmpty();
    await expect(page.locator("#explanation-box")).toBeVisible();
  });

  test("options are disabled after answering", async ({ page }) => {
    await page.locator('.option-btn[data-key="B"]').click();
    const allOptions = page.locator(".option-btn");
    for (let i = 0; i < 4; i++) {
      await expect(allOptions.nth(i)).toHaveClass(/disabled/);
    }
  });

  test("next button navigates to next question", async ({ page }) => {
    await page.locator('.option-btn[data-key="B"]').click();
    await page.locator("#next-btn").click();
    await expect(page.locator("#question-number")).toContainText("Question 2");
    await expect(page.locator("#progress")).toContainText("Question 2 / 126");
  });

  test("answering and going back preserves state", async ({ page }) => {
    await page.locator('.option-btn[data-key="B"]').click();
    await page.locator("#next-btn").click();
    await page.locator("#prev-btn").click();
    await expect(page.locator("#question-number")).toContainText("Question 1");
    const options = page.locator(".option-btn");
    await expect(options.first()).toHaveClass(/disabled/);
  });

  test("responsive - renders well on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator(".app")).toBeVisible();
    await expect(page.locator("#question-text")).toBeVisible();
    const options = page.locator(".option-btn");
    await expect(options).toHaveCount(4);
    await options.first().click();
    await expect(page.locator("#explanation-box")).toBeVisible();
  });

  test("keyboard navigation works (press B key)", async ({ page }) => {
    await page.keyboard.press("b");
    await expect(page.locator("#result-banner")).toContainText("Correct");
  });

  test("progress is saved and dashboard shown on reload", async ({ page }) => {
    await page.locator('.option-btn[data-key="B"]').click();
    // Wait for save to complete
    await page.waitForTimeout(300);
    await page.reload();
    // Dashboard should appear with saved progress
    await expect(page.locator("#progress-dashboard")).toBeVisible();
    await expect(page.locator("#stat-answered")).toHaveText("1");
    await expect(page.locator("#stat-correct")).toHaveText("1");
  });

  test("resume button continues from next unanswered question", async ({ page }) => {
    await page.locator('.option-btn[data-key="B"]').click();
    await page.locator("#next-btn").click();
    await page.locator('.option-btn[data-key="A"]').click();
    await page.waitForTimeout(300);
    await page.reload();
    await expect(page.locator("#progress-dashboard")).toBeVisible();
    await page.locator("#resume-btn").click();
    await expect(page.locator("#question-number")).toContainText("Question 3");
  });

  test("reset button clears all progress", async ({ page }) => {
    await page.locator('.option-btn[data-key="B"]').click();
    await page.waitForTimeout(300);
    await page.reload();
    await expect(page.locator("#progress-dashboard")).toBeVisible();
    page.on("dialog", (dialog) => dialog.accept());
    await page.locator("#reset-btn").click();
    await expect(page.locator("#stat-answered")).toHaveText("0");
  });
});
