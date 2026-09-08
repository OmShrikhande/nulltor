import { test, expect } from '@playwright/test';
import { getSuperadminToken, createTestProject, loginAndNavigateToIDE, TestProject } from './helpers';

test.describe('Subroom Branching & Synchronization', () => {
  let project: TestProject;
  const PASSPHRASE = 'NulltorBranchingKey2026!';

  test.beforeAll(async ({ playwright }) => {
    const apiContext = await playwright.request.newContext({ baseURL: 'http://localhost:3330' });
    const token = await getSuperadminToken(apiContext);
    project = await createTestProject(apiContext, token, `E2E-Branch-${Date.now()}`);
    await apiContext.dispose();
  });

  test('should display active branch in branch selector and allow opening branch modal', async ({ page }) => {
    await loginAndNavigateToIDE(page, project.id, PASSPHRASE);

    // Verify branch selector button exists
    const branchSelector = page.locator('.branch-selector button');
    await expect(branchSelector.first()).toBeVisible({ timeout: 15000 });

    // Click branch selector to open dropdown
    await branchSelector.first().click();

    // Verify search input in dropdown is visible
    const searchInput = page.locator('input[placeholder*="Switch or search subroom"]');
    await expect(searchInput).toBeVisible({ timeout: 5000 });

    // Verify "Create Subroom" / "New Branch" option button exists
    const createBranchBtn = page.locator('button:has-text("Create Subroom"), button:has-text("Branch")');
    expect(await createBranchBtn.count()).toBeGreaterThanOrEqual(1);
  });

  test('should create a subroom branch via API and switch to it in the UI', async ({ page, playwright }) => {
    // 1. Create subroom branch via API
    const apiContext = await playwright.request.newContext({ baseURL: 'http://localhost:3330' });
    const token = await getSuperadminToken(apiContext);
    const subroomName = `feature-subroom-${Date.now().toString().slice(-4)}`;

    const createBranchRes = await apiContext.post(`/api/projects/${project.id}/branches`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: {
        name: subroomName,
        type: 'subroom',
      },
    });
    expect(createBranchRes.ok()).toBe(true);
    await apiContext.dispose();

    // 2. Open IDE and switch to the new branch
    await loginAndNavigateToIDE(page, project.id, PASSPHRASE);

    // Open branch selector
    const branchSelector = page.locator('.branch-selector button');
    await branchSelector.first().click();

    // Click on the newly created subroom in the list
    const subroomOption = page.locator(`div:has-text("${subroomName}")`);
    await expect(subroomOption.last()).toBeVisible({ timeout: 5000 });
    await subroomOption.last().click();

    // Confirm that active branch button now reflects the subroom name
    await expect(branchSelector.first()).toContainText(subroomName);
  });
});
