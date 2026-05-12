import { test, expect } from "@playwright/test";

test("unauthenticated user is redirected to /login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("link", { name: /Mit Google anmelden/i })).toBeVisible();
});

test("login button has correct href", async ({ page }) => {
  await page.goto("/login");
  const link = page.getByRole("link", { name: /Mit Google anmelden/i });
  await expect(link).toHaveAttribute("href", "/api/auth/google");
});
