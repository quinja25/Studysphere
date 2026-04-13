'use strict';

// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Auth E2E tests — login, registration, protected-route guards.
 *
 * API calls are intercepted with page.route() so no real backend is needed.
 * When you have a running backend, remove the route intercepts and set
 * TEST_EMAIL / TEST_PASSWORD env vars to run against real credentials.
 */

// ── helpers ───────────────────────────────────────────────────────────────────

/** Inject a valid userData object into localStorage to simulate a logged-in session. */
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

// ── Home page ─────────────────────────────────────────────────────────────────

test.describe('Home page', () => {
    test('renders hero with Get Started and Log In links', async ({ page }) => {
        await page.goto('/');
        await expect(page).toHaveTitle(/StudySphere/i);
        await expect(page.getByRole('link', { name: /Get Started Free/i }).first()).toBeVisible();
        await expect(page.getByRole('link', { name: /Log in/i }).first()).toBeVisible();
    });

    test('Get Started Free link navigates to /registration', async ({ page }) => {
        await page.goto('/');
        await page.getByRole('link', { name: /Get Started Free/i }).first().click();
        await expect(page).toHaveURL(/\/registration/);
    });

    test('Log in link navigates to /login', async ({ page }) => {
        await page.goto('/');
        await page.getByRole('link', { name: /Log in/i }).first().click();
        await expect(page).toHaveURL(/\/login/);
    });
});

// ── Login page ────────────────────────────────────────────────────────────────

test.describe('Login page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/login');
    });

    test('renders email and password inputs', async ({ page }) => {
        await expect(page.getByPlaceholder(/Email or Username/i)).toBeVisible();
        await expect(page.getByPlaceholder(/Password/i)).toBeVisible();
    });

    test('submit button is present', async ({ page }) => {
        await expect(page.getByRole('button', { name: /Log In/i })).toBeVisible();
    });

    test('shows alert on invalid credentials (mocked 401)', async ({ page }) => {
        // Intercept the login API call and return a 401
        await page.route('**/users/login', (route) =>
            route.fulfill({ status: 401, json: { error: 'Invalid email or password' } })
        );

        let dialogMessage = '';
        page.on('dialog', async (dialog) => {
            dialogMessage = dialog.message();
            await dialog.accept();
        });

        await page.getByPlaceholder(/Email or Username/i).fill('wrong@test.com');
        await page.getByPlaceholder(/Password/i).fill('wrongpass');
        await page.getByRole('button', { name: /Log In/i }).click();

        await expect.poll(() => dialogMessage).toMatch(/Invalid email or password/i);
    });

    test('successful login stores userData and redirects to /lobby', async ({ page }) => {
        await page.route('**/users/login', (route) =>
            route.fulfill({
                status: 200,
                json: {
                    id: 1,
                    name: 'Alice',
                    email: 'alice@test.com',
                    username: 'alice',
                    role: 'student',
                    isAdmin: false,
                    accessToken: 'mock-access-token',
                    refreshToken: 'mock-refresh-token',
                },
            })
        );

        await page.getByPlaceholder(/Email or Username/i).fill('alice@test.com');
        await page.getByPlaceholder(/Password/i).fill('password123');
        await page.getByRole('button', { name: /Log In/i }).click();

        await expect(page).toHaveURL(/\/lobby/, { timeout: 10_000 });

        const stored = await page.evaluate(() => localStorage.getItem('userData'));
        expect(JSON.parse(stored).email).toBe('alice@test.com');
    });
});

// ── Registration page ─────────────────────────────────────────────────────────

test.describe('Registration page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/registration');
    });

    test('renders registration form heading', async ({ page }) => {
        await expect(page.getByRole('heading', { name: /Complete Your Profile/i })).toBeVisible();
    });

    test('renders required fields', async ({ page }) => {
        await expect(page.locator('[name="name"]')).toBeVisible();
        await expect(page.locator('[name="email"]')).toBeVisible();
        await expect(page.locator('[name="username"]')).toBeVisible();
        await expect(page.locator('[name="password"]')).toBeVisible();
    });

    test('successful registration redirects to /lobby', async ({ page }) => {
        await page.route('**/users/register', (route) =>
            route.fulfill({
                status: 200,
                json: {
                    id: 2,
                    name: 'Bob',
                    email: 'bob@test.com',
                    username: 'bob',
                    role: 'student',
                    isAdmin: false,
                    accessToken: 'mock-access-token',
                    refreshToken: 'mock-refresh-token',
                },
            })
        );

        await page.locator('[name="name"]').fill('Bob Smith');
        await page.locator('[name="email"]').fill('bob@test.com');
        await page.locator('[name="username"]').fill('bobsmith');
        await page.locator('[name="password"]').fill('securepass123');

        // Select student role radio if visible
        const studentRadio = page.locator('[name="role"][value="student"]');
        if (await studentRadio.isVisible()) {
            await studentRadio.check();
        }

        await page.locator('button[type="submit"]').click();

        await expect(page).toHaveURL(/\/lobby/, { timeout: 10_000 });
    });
});

// ── Protected routes ──────────────────────────────────────────────────────────

test.describe('Protected route guards', () => {
    test('unauthenticated /lobby redirects to /login', async ({ page }) => {
        await page.goto('/lobby');
        await expect(page).toHaveURL(/\/login/);
    });

    test('unauthenticated /dashboard redirects to /login', async ({ page }) => {
        await page.goto('/dashboard');
        await expect(page).toHaveURL(/\/login/);
    });

    test('unauthenticated /create-group redirects to /login', async ({ page }) => {
        await page.goto('/create-group');
        await expect(page).toHaveURL(/\/login/);
    });

    test('authenticated user can access /lobby', async ({ page }) => {
        await loginViaLocalStorage(page);
        // Intercept the groups API so the lobby can render without a real backend
        await page.route('**/groupsUsers/byUser/**', (route) =>
            route.fulfill({ status: 200, json: [] })
        );
        await page.goto('/lobby');
        await expect(page).not.toHaveURL(/\/login/);
    });
});

// ── Logout ────────────────────────────────────────────────────────────────────

test.describe('Logout', () => {
    test('Log Out button clears localStorage and navigates to /login', async ({ page }) => {
        await loginViaLocalStorage(page);
        await page.route('**/groupsUsers/byUser/**', (route) =>
            route.fulfill({ status: 200, json: [] })
        );
        await page.goto('/lobby');

        await page.getByRole('button', { name: /Log Out/i }).click();

        await expect(page).toHaveURL(/\/login/);
        const stored = await page.evaluate(() => localStorage.getItem('userData'));
        expect(stored).toBeNull();
    });
});
