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

const MOCK_GROUPS = [
    {
        id: 1,
        groupName: 'Calculus Study Group',
        subject: 'Mathematics',
        major: 'Science',
        gradeLevel: 'IB HL',
        leader: 'alice',
        isPublic: true,
        hasPassword: false,
        maxParticipants: 10,
    },
    {
        id: 2,
        groupName: 'Chemistry Lab Prep',
        subject: 'Chemistry',
        major: 'Science',
        gradeLevel: 'A-Level',
        leader: 'bob',
        isPublic: false,
        hasPassword: true,
        maxParticipants: 6,
    },
];

// ── Find Group page ───────────────────────────────────────────────────────────

test.describe('Find Group page', () => {
    test.beforeEach(async ({ page }) => {
        await page.route('**/groups/', (route) =>
            route.fulfill({ status: 200, json: MOCK_GROUPS })
        );
        await page.route('**/groups**', (route) =>
            route.fulfill({ status: 200, json: MOCK_GROUPS })
        );
        await page.goto('/find-group');
    });

    test('renders page heading', async ({ page }) => {
        await expect(page.getByRole('heading', { name: /Find Study Rooms/i })).toBeVisible();
    });

    test('displays group cards from the API', async ({ page }) => {
        await expect(page.getByText('Calculus Study Group')).toBeVisible();
        await expect(page.getByText('Chemistry Lab Prep')).toBeVisible();
    });

    test('shows a filter/search control', async ({ page }) => {
        // The filter toggle button or search input should exist
        const filterToggle = page.getByRole('button', { name: /filter/i });
        const searchInput = page.getByPlaceholder(/Search by subject/i);
        const hasFilter = await filterToggle.isVisible().catch(() => false);
        const hasSearch = await searchInput.isVisible().catch(() => false);
        expect(hasFilter || hasSearch).toBe(true);
    });

    test('private room card shows lock/private indicator', async ({ page }) => {
        // The private group should have some visual indicator
        const privateCard = page.getByText('Chemistry Lab Prep').locator('..');
        await expect(privateCard).toBeVisible();
        // Look for a lock icon, "Private" text, or password modal trigger
        const pageText = await page.content();
        expect(pageText).toMatch(/Private|private|🔒|lock/i);
    });
});

// ── Create Group page ─────────────────────────────────────────────────────────

test.describe('Create Group page', () => {
    test.beforeEach(async ({ page }) => {
        await loginViaLocalStorage(page);
        await page.goto('/create-group');
    });

    test('renders the create group form', async ({ page }) => {
        // Should have a group name field (Formik Field with name="groupName")
        await expect(page.locator('[name="groupName"]')).toBeVisible();
    });

    test('renders all key fields', async ({ page }) => {
        await expect(page.locator('[name="groupName"]')).toBeVisible();
        await expect(page.locator('[name="subject"]')).toBeVisible();
        await expect(page.locator('[name="maxParticipants"]')).toBeVisible();
    });

    test('submit button is present', async ({ page }) => {
        await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test('successful creation redirects to /lobby', async ({ page }) => {
        await page.route('**/groups/', (route) =>
            route.fulfill({
                status: 200,
                json: { id: 99, groupName: 'My New Room', leader: 'testuser', isPublic: true },
            })
        );
        // Also stub the membership add call
        await page.route('**/groupsUsers/**', (route) =>
            route.fulfill({ status: 200, json: { success: true } })
        );

        await page.locator('[name="groupName"]').fill('My New Room');
        await page.locator('[name="subject"]').fill('Mathematics');
        await page.locator('[name="major"]').fill('Science');
        await page.locator('[name="gradeLevel"]').fill('IB HL');
        await page.locator('[name="maxParticipants"]').fill('8');

        await page.locator('button[type="submit"]').click();

        await expect(page).toHaveURL(/\/lobby/, { timeout: 10_000 });
    });

    test('unauthenticated user redirected away from /create-group', async ({ page: rawPage }) => {
        // New page without localStorage injection
        await rawPage.goto('/create-group');
        await expect(rawPage).toHaveURL(/\/login/);
    });
});

// ── Join flow (password modal) ────────────────────────────────────────────────

test.describe('Join private group', () => {
    test('clicking a password-protected room opens password prompt', async ({ page }) => {
        await loginViaLocalStorage(page);
        await page.route('**/groups**', (route) =>
            route.fulfill({ status: 200, json: MOCK_GROUPS })
        );
        await page.goto('/find-group');

        // Click Join on the private group (Chemistry Lab Prep)
        const privateCard = page.getByText('Chemistry Lab Prep');
        await expect(privateCard).toBeVisible();

        // Find and click the Join button near the private card
        const joinButtons = page.getByRole('button', { name: /Join/i });
        const count = await joinButtons.count();
        if (count > 1) {
            await joinButtons.nth(1).click(); // second card = private
        } else {
            await joinButtons.first().click();
        }

        // A password input should appear
        await expect(page.getByPlaceholder(/Enter room password/i)).toBeVisible({ timeout: 5_000 });
    });
});
