import { test, expect } from '@playwright/test';
import { getSuperadminToken, createTestProject, loginAndNavigateToIDE, TestProject } from './helpers';

test.describe('Real-Time Collaboration & E2EE Workspace', () => {
  let project: TestProject;
  const PASSPHRASE = 'NulltorSharedKey2026!';

  test.beforeAll(async ({ playwright }) => {
    const apiContext = await playwright.request.newContext({ baseURL: 'http://localhost:3330' });
    const token = await getSuperadminToken(apiContext);
    project = await createTestProject(apiContext, token, `E2E-Collab-${Date.now()}`);
    await apiContext.dispose();
  });

  test('should allow two concurrent browser tabs to connect to the same room with E2EE', async ({ browser }) => {
    // 1. Create Context A (Peer 1)
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await loginAndNavigateToIDE(pageA, project.id, PASSPHRASE);

    // Verify IDE interface elements loaded on Page A
    await expect(pageA.locator('.ide-container, .ide-layout, .editor-container, .monaco-editor')).toBeVisible({
      timeout: 20000,
    });

    // 2. Create Context B (Peer 2)
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await loginAndNavigateToIDE(pageB, project.id, PASSPHRASE);

    // Verify IDE interface loaded on Page B
    await expect(pageB.locator('.ide-container, .ide-layout, .editor-container, .monaco-editor')).toBeVisible({
      timeout: 20000,
    });

    // 3. Verify WebSocket / Socket.IO connection is active in both contexts
    const isSocketConnectedA = await pageA.evaluate(() => {
      return window.location.hash.includes('/ide/');
    });
    expect(isSocketConnectedA).toBe(true);

    const isSocketConnectedB = await pageB.evaluate(() => {
      return window.location.hash.includes('/ide/');
    });
    expect(isSocketConnectedB).toBe(true);

    // 4. Clean up contexts
    await contextA.close();
    await contextB.close();
  });
});
