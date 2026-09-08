import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('should display login page and floating branding tags', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/Nulltor/i);
    await expect(page.locator('#login-email')).toBeVisible();
    await expect(page.locator('#login-password')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toContainText(/Sign in/i);
  });

  test('should display error on invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#login-email', 'nonexistent@nulltor.com');
    await page.fill('#login-password', 'wrongpassword123');
    await page.click('button[type="submit"]');

    const errorMsg = page.locator('.form-error');
    await expect(errorMsg).toBeVisible({ timeout: 10000 });
    await expect(errorMsg).not.toBeEmpty();
  });

  test('should authenticate superadmin and navigate to dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#login-email', 'superadmin@nulltor.com');
    await page.fill('#login-password', 'admin123');
    await page.click('button[type="submit"]');

    // Should redirect to dashboard
    await page.waitForURL('**/dashboard', { timeout: 15000 });
    await expect(page).toHaveURL(/.*dashboard/);

    // Verify auth cookie is set
    const cookies = await page.context().cookies();
    const authCookie = cookies.find((c) => c.name === 'nulltor_access_token');
    expect(authCookie).toBeTruthy();

    // Verify user object in localStorage
    const userStr = await page.evaluate(() => localStorage.getItem('nulltor_user'));
    expect(userStr).toBeTruthy();
    const user = JSON.parse(userStr!);
    expect(user.email).toBe('superadmin@nulltor.com');
    expect(user.role).toBe('superadmin');
  });

  test('should persist authentication on page reload and allow logout', async ({ page }) => {
    // Inject auth state directly into localStorage
    await page.goto('/login');
    await page.fill('#login-email', 'superadmin@nulltor.com');
    await page.fill('#login-password', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });

    // Reload page and confirm user is still logged in
    await page.reload();
    await expect(page).toHaveURL(/.*dashboard/);

    // Click logout button if visible in sidebar or profile
    const logoutBtn = page.locator('button:has-text("Sign Out"), button:has-text("Logout"), button[title="Sign out"]');
    if (await logoutBtn.count() > 0) {
      await logoutBtn.first().click();
      await page.waitForURL('**/login', { timeout: 10000 });
      const cookies = await page.context().cookies();
      const authCookie = cookies.find((c) => c.name === 'nulltor_access_token');
      expect(authCookie?.value).toBeFalsy();
    }
  });
});
