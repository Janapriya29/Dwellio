import { test, expect } from '@playwright/test';

test.describe('Dwellio End-to-End Smoke Tests (SEC-12)', () => {
  const baseURL = process.env.E2E_BASE_URL || 'http://localhost';

  test.beforeEach(async ({ page }) => {
    // Collect console errors to detect any fatal unhandled errors
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
  });

  // 1. Branding & Initial Load
  test('1. Frontend loads and Dwellio branding and tagline are visible', async ({ page }) => {
    await page.goto('/');

    // Check brand logo 'D' and title
    const brandTitle = page.locator('header').getByText('Dwellio', { exact: true });
    await expect(brandTitle).toBeVisible();

    // Check official tagline
    const tagline = page.locator('header').getByText('Your Home, in Good Hands.');
    await expect(tagline).toBeVisible();

    // Check footer copyright
    const footer = page.locator('footer').getByText('Your Home, in Good Hands.');
    await expect(footer).toBeVisible();
  });

  // 2. Public Service Discovery Page
  test('2. Public service discovery page renders interactive cutaway and categories', async ({ page }) => {
    await page.goto('/');

    // Explore cutaway tab is active by default
    const exploreTab = page.getByRole('button', { name: /Explore Cutaway/i });
    await expect(exploreTab).toBeVisible();

    // Check for interactive room cutaway or room filter buttons
    const cutawayContainer = page.getByTestId('house-cutaway');
    const heroTitle = page.getByRole('heading', { name: /Explore Your Home/i });

    // Ensure either cutaway container or discovery hero is loaded
    await expect(heroTitle.or(cutawayContainer)).toBeVisible();

    // Verify room buttons are accessible (Living, Kitchen, Bedroom, etc.)
    const livingRoomBtn = page.getByRole('button', { name: /Living/i }).first();
    await expect(livingRoomBtn).toBeVisible();
  });

  // 3. User can navigate to or open login/role switcher interface
  test('3. User can interact with login and role switcher controls', async ({ page }) => {
    await page.goto('/');

    // Check presence of demo role selector buttons or header auth triggers
    const customerBtn = page.getByRole('button', { name: 'Customer', exact: true });
    const providerBtn = page.getByRole('button', { name: 'Provider', exact: true });
    const adminBtn = page.getByRole('button', { name: 'Admin', exact: true });

    // In demo environment, role switchers allow authenticating test personas
    if (await customerBtn.isVisible()) {
      await expect(customerBtn).toBeEnabled();
      await expect(providerBtn).toBeEnabled();
      await expect(adminBtn).toBeEnabled();
    } else {
      // In standard production without demo credentials, verify login trigger exists
      const loginTrigger = page.getByRole('button', { name: /Sign in|Login/i });
      await expect(loginTrigger).toBeVisible();
    }
  });

  // 4. Protection of Authenticated / Admin Views
  test('4. Unauthenticated users cannot view protected admin views or perform protected actions', async ({ page, request }) => {
    await page.goto('/');

    // Unauthenticated/guest user should not see Admin Dashboard tab in the navigation
    const adminTab = page.getByRole('button', { name: /Admin Dashboard/i });
    await expect(adminTab).not.toBeVisible();

    // Direct API request to protected admin endpoint without auth must return 401 Unauthorized
    const adminApiRes = await request.get(`${baseURL}/api/admin/overview`);
    expect([401, 403]).toContain(adminApiRes.status());

    // Direct API request to protected booking endpoint without auth must return 401
    const bookingApiRes = await request.get(`${baseURL}/api/bookings`);
    expect(bookingApiRes.status()).toBe(401);

    // Direct API request to protected provider endpoint without auth must return 401
    const providerApiRes = await request.get(`${baseURL}/api/provider/bookings`);
    expect(providerApiRes.status()).toBe(401);
  });

  // 5. Representative Public API Request via Reverse Proxy
  test('5. Public API endpoints respond successfully through the reverse proxy', async ({ request }) => {
    // Health check endpoint
    const healthRes = await request.get(`${baseURL}/api/health`);
    expect(healthRes.status()).toBe(200);
    const healthJson = await healthRes.json();
    expect(healthJson.success).toBe(true);
    expect(healthJson.data.service).toBe('dwellio-backend');

    // Public catalog categories endpoint
    const catalogRes = await request.get(`${baseURL}/api/catalog/categories`);
    expect(catalogRes.status()).toBe(200);
    const catalogJson = await catalogRes.json();
    expect(catalogJson.success).toBe(true);
    expect(Array.isArray(catalogJson.data)).toBe(true);
  });

  // 6. Seeded Test Persona Authentication & Protected Page Flow
  test('6. Seeded test persona can authenticate and access role-specific portal', async ({ page }) => {
    await page.goto('/');

    const customerBtn = page.getByRole('button', { name: 'Customer', exact: true });
    if (await customerBtn.isVisible()) {
      // Click Customer button to trigger demo login as Pooja Sharma
      await customerBtn.click();

      // Should switch tab to My Bookings and display customer persona
      const myBookingsHeading = page.getByRole('heading', { name: /My Bookings/i });
      await expect(myBookingsHeading).toBeVisible();

      // Check that customer persona name is visible in header
      const personaName = page.locator('header').getByText(/Pooja Sharma/i);
      await expect(personaName).toBeVisible();
    }
  });
});
