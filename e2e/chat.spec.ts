import { test, expect } from '@playwright/test'

test('sends a message and receives a reply that remembers context', async ({ page }) => {
  await page.goto('/chat')

  await page.getByPlaceholder('Type a message…').fill('My favorite color is teal.')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('My favorite color is teal.')).toBeVisible()
  await expect(page.getByText('Thinking…')).not.toBeVisible({ timeout: 15000 })

  await page.getByPlaceholder('Type a message…').fill("What's my favorite color?")
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Thinking…')).not.toBeVisible({ timeout: 15000 })
  await expect(page.getByText(/teal/i)).toBeVisible()
})
