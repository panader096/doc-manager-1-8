import { test, expect } from '@playwright/test';

// Dedicated E2E test account for this project -- not a real user.
// Sourced from .env.local (gitignored), not hardcoded -- see playwright.config.ts.
const TEST_EMAIL = process.env.E2E_TEST_EMAIL!;
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD!;

test('deleting a journal entry requires confirmation', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email' }).fill(TEST_EMAIL);
  await page.getByRole('textbox', { name: 'Password' }).fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('/workspace');

  await page.goto('/journal');
  await page.getByRole('button', { name: 'Today' }).click();
  await page.waitForURL(/\/journal\/\d+/);

  const entryRow = page.getByTestId('journal-entry-row').first();
  await entryRow.hover();
  await entryRow.getByRole('button', { name: 'Delete entry' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Delete this entry?')).toBeVisible();

  // Cancelling must close the dialog without deleting the entry.
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(entryRow).toBeVisible();

  // Confirming must actually delete it.
  await entryRow.hover();
  await entryRow.getByRole('button', { name: 'Delete entry' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByTestId('journal-entry-row')).toHaveCount(0);
});
