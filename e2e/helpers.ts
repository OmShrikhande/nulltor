import { Page, request, APIRequestContext } from '@playwright/test';

export interface TestProject {
  id: string;
  name: string;
  invite_code: string;
  passphrase?: string;
}

export async function getSuperadminToken(apiContext: APIRequestContext): Promise<string> {
  const res = await apiContext.post('/api/auth/login', {
    data: {
      email: 'superadmin@nulltor.com',
      password: 'admin123',
    },
  });
  if (!res.ok()) {
    throw new Error(`Failed to login superadmin: ${res.status()} ${await res.text()}`);
  }
  const data = await res.json();
  return data.access_token;
}

export async function createTestProject(
  apiContext: APIRequestContext,
  token: string,
  projectName = `Test-E2E-${Date.now()}`
): Promise<TestProject> {
  const res = await apiContext.post('/api/projects', {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: {
      name: projectName,
      description: 'Automated E2E Testing Workspace',
    },
  });
  if (!res.ok()) {
    throw new Error(`Failed to create test project: ${res.status()} ${await res.text()}`);
  }
  const project = await res.json();
  return project;
}

export async function loginAndNavigateToIDE(
  page: Page,
  projectId: string,
  passphrase = 'TestPassphrase123!'
) {
  // 1. Login
  await page.goto('/#/login');
  await page.fill('#login-email', 'superadmin@nulltor.com');
  await page.fill('#login-password', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => url.hash.includes('/dashboard'), { timeout: 15000 });

  // 2. Navigate to IDE using HashRouter path
  await page.goto(`/#/ide/${projectId}`);
  await page.waitForLoadState('domcontentloaded');

  // 3. Handle room passphrase unlock or direct IDE entry
  const firstVisible = await Promise.race([
    page.waitForSelector('#passphrase-input', { timeout: 8000 }).then(() => 'modal').catch(() => null),
    page.waitForSelector('.ide-container', { timeout: 8000 }).then(() => 'ide').catch(() => null),
  ]);

  if (firstVisible === 'modal') {
    await page.fill('#passphrase-input', passphrase);
    await page.click('button:has-text("Launch Project Session & IDE"), button[type="submit"]');
    await page.waitForSelector('.ide-container', { timeout: 20000 });
  } else {
    await page.waitForSelector('.ide-container', { timeout: 15000 });
  }
}
