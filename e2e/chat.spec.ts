import { test, expect } from '@playwright/test'

// Dedicated E2E test account for this project -- not a real user.
// Sourced from .env.local (gitignored), not hardcoded -- see playwright.config.ts.
const TEST_EMAIL = process.env.E2E_TEST_EMAIL!;
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD!;

test('sends a message and receives a reply that remembers context', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('textbox', { name: 'Email' }).fill(TEST_EMAIL)
  await page.getByRole('textbox', { name: 'Password' }).fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL('/workspace')

  await page.goto('/chat')

  await page.getByPlaceholder('Type a message…').fill('My favorite color is teal.')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('My favorite color is teal.')).toBeVisible()
  await expect(page.getByText('Thinking…')).not.toBeVisible({ timeout: 15000 })

  await page.getByPlaceholder('Type a message…').fill("What's my favorite color?")
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Thinking…')).not.toBeVisible({ timeout: 15000 })

  const lastMessage = page.locator('main div.whitespace-pre-wrap').last()
  await expect(lastMessage).toContainText(/teal/i)
})
