'use strict';

// @ts-check
const { test, expect } = require('@playwright/test');

/** Inject a valid session into localStorage. */
async function loginViaLocalStorage(page, overrides = {}) {
    await page.addInitScript((data) => {
        localStorage.setItem('userData', JSON.stringify(data));
    }, {
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        username: 'testuser',
        role: 'student',
        isAdmin: false,
        accessToken: 'fake-token',
        ...overrides,
    });
}

// ── NavBar — unauthenticated ──────────────────────────────────────────────────

test.describe('NavBar unauthenticated', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('shows Log in and Get Started links', async ({ page }) => {
        await expect(page.getByRole('link', { name: /Log in/i }).first()).toBeVisible();
        await expect(page.getByRole('link', { name: /Get Started Free/i }).first()).toBeVisible();
    });

    test('does not show authenticated nav links', async ({ page }) => {
        await expect(page.getByRole('link', { name: /My Profile/i })).not.toBeVisible();
        await expect(page.getByRole('link', { name: /Create Group/i })).not.toBeVisible();
    });
});

// ── NavBar — authenticated ────────────────────────────────────────────────────

test.describe('NavBar authenticated', () => {
    test.beforeEach(async ({ page }) => {
        await loginViaLocalStorage(page);
        await page.route('**/groupsUsers/byUser/**', (route) =>
            route.fulfill({ status: 200, json: [] })
        );
        await page.goto('/lobby');
    });

    test('shows authenticated nav links', async ({ page }) => {
        await expect(page.getByRole('link', { name: /Find Group/i })).toBeVisible();
        await expect(page.getByRole('link', { name: /My Profile/i })).toBeVisible();
        await expect(page.getByRole('link', { name: /Create Group/i })).toBeVisible();
    });

    test('does not show Admin link for non-admin users', async ({ page }) => {
        await expect(page.getByRole('link', { name: /Admin/i })).not.toBeVisible();
    });

    test('shows Admin link for admin users', async ({ page: adminPage }) => {
        await loginViaLocalStorage(adminPage, { isAdmin: true });
        await adminPage.route('**/groupsUsers/byUser/**', (route) =>
            route.fulfill({ status: 200, json: [] })
        );
        await adminPage.goto('/lobby');
        await expect(adminPage.getByRole('link', { name: /Admin/i })).toBeVisible();
    });

    test('Find Group link navigates to /find-group', async ({ page }) => {
        await page.route('**/groups**', (route) =>
            route.fulfill({ status: 200, json: [] })
        );
        await page.getByRole('link', { name: /Find Group/i }).click();
        await expect(page).toHaveURL(/\/find-group/);
    });

    test('Wiki link navigates to /wiki', async ({ page }) => {
        await page.route('**/wiki**', (route) =>
            route.fulfill({ status: 200, json: [] })
        );
        await page.getByRole('link', { name: /Wiki/i }).click();
        await expect(page).toHaveURL(/\/wiki/);
    });

    test('Q&A link navigates to /qa', async ({ page }) => {
        await page.route('**/qa**', (route) =>
            route.fulfill({ status: 200, json: [] })
        );
        await page.getByRole('link', { name: /Q&A/i }).click();
        await expect(page).toHaveURL(/\/qa/);
    });
});

// ── Admin route guard ─────────────────────────────────────────────────────────

test.describe('Admin route guard', () => {
    test('non-admin visiting /admin is redirected away', async ({ page }) => {
        await loginViaLocalStorage(page, { isAdmin: false });
        await page.goto('/admin');
        await expect(page).not.toHaveURL(/\/admin/);
    });

    test('admin user can access /admin', async ({ page }) => {
        await loginViaLocalStorage(page, { isAdmin: true });
        // Stub the admin dashboard API
        await page.route('**/admin/**', (route) =>
            route.fulfill({
                status: 200,
                json: {
                    totalUsers: 10,
                    activeGroups: 2,
                    pendingReports: 0,
                    trustDistribution: [],
                },
            })
        );
        await page.goto('/admin');
        await expect(page).toHaveURL(/\/admin/);
    });
});

// ── Public pages ──────────────────────────────────────────────────────────────

test.describe('Public pages', () => {
    test('/ renders without errors', async ({ page }) => {
        await page.goto('/');
        await expect(page).toHaveTitle(/StudySphere/i);
        // No error boundary text
        await expect(page.getByText(/Something went wrong/i)).not.toBeVisible();
    });

    test('/login renders without errors', async ({ page }) => {
        await page.goto('/login');
        await expect(page.getByPlaceholder(/Email or Username/i)).toBeVisible();
    });

    test('/find-group renders without errors', async ({ page }) => {
        await page.route('**/groups**', (route) =>
            route.fulfill({ status: 200, json: [] })
        );
        await page.goto('/find-group');
        await expect(page.getByRole('heading', { name: /Find Study Rooms/i })).toBeVisible();
    });

    test('unknown route shows 404 page', async ({ page }) => {
        await page.goto('/this-page-does-not-exist');
        const body = await page.textContent('body');
        // App should show a not-found message
        expect(body).toMatch(/404|not found|doesn.t exist|page not found/i);
    });
});

// ── Deep-link navigation ──────────────────────────────────────────────────────

test.describe('Deep-link navigation', () => {
    test('logo click on authenticated page goes to /lobby', async ({ page }) => {
        await loginViaLocalStorage(page);
        await page.route('**/groupsUsers/byUser/**', (route) =>
            route.fulfill({ status: 200, json: [] })
        );
        await page.goto('/lobby');

        // Click the navbar logo
        await page.locator('.navbar-logo-container').click();
        await expect(page).toHaveURL(/\/lobby/);
    });

    test('logo click on unauthenticated page goes to /', async ({ page }) => {
        await page.goto('/login');
        await page.locator('.navbar-logo-container').click();
        await expect(page).toHaveURL(/\/$/);
    });
});
