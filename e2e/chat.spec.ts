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

  // Unique marker per run, mirroring the multi-turn test below -- this is a
  // persistent, ever-growing conversation shared across every run of this
  // suite, so a fixed message string collides with an earlier run's copy
  // once this test has run more than once and breaks a strict-mode
  // getByText lookup (more than one element with the exact same text).
  const marker = Date.now()
  const firstMessage = `My favorite color is teal. (ref ${marker})`

  await page.getByPlaceholder('Type a message…').fill(firstMessage)
  await page.getByRole('button', { name: 'Send' }).click()
  // Explicit timeout (matching the toBeEnabled waits below): the very first
  // /chat load of a test run can be slow to render -- Next.js dev-server
  // first-hit compilation plus the initial getMessages() fetch over this
  // account's one, ever-growing shared conversation -- so the default 5s
  // isn't always enough for the optimistic message to appear on screen.
  await expect(page.getByText(firstMessage)).toBeVisible({ timeout: 15000 })
  await expect(page.getByPlaceholder('Type a message…')).toBeEnabled({ timeout: 15000 })

  await page.getByPlaceholder('Type a message…').fill(`What's my favorite color? (ref ${marker})`)
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByPlaceholder('Type a message…')).toBeEnabled({ timeout: 15000 })

  const lastMessage = page.locator('main div.whitespace-pre-wrap').last()
  await expect(lastMessage).toContainText(/teal/i)
})

test('multi-turn conversation: a follow-up reply reflects the earlier turn, not a generic answer', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('textbox', { name: 'Email' }).fill(TEST_EMAIL)
  await page.getByRole('textbox', { name: 'Password' }).fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL('/workspace')

  await page.goto('/chat')

  // Unique marker per run -- this is a persistent, ever-growing conversation
  // shared across test runs, so a fixed message string can collide with an
  // earlier run's copy and break a strict-mode getByText lookup.
  const marker = Date.now()
  const firstMessage = `Explain how a rainbow forms, in one sentence. (ref ${marker})`
  const followupMessage = `Say that again, but simpler. (ref ${marker})`

  await page.getByPlaceholder('Type a message…').fill(firstMessage)
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText(firstMessage)).toBeVisible({ timeout: 15000 })
  await expect(page.getByPlaceholder('Type a message…')).toBeEnabled({ timeout: 15000 })

  await page.getByPlaceholder('Type a message…').fill(followupMessage)
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByPlaceholder('Type a message…')).toBeEnabled({ timeout: 15000 })

  const lastMessage = page.locator('main div.whitespace-pre-wrap').last()
  // A reply that actually remembers the earlier turn re-explains the same
  // topic (rainbow/light/water); a context-less reply would instead ask
  // what the user wants repeated, with no topic words at all.
  await expect(lastMessage).toContainText(/rainbow|light|water|sun|droplet/i)
  await expect(lastMessage).not.toContainText(/what would you like|could you clarify|not sure what you/i)
})

test('persistence: messages survive a page refresh', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('textbox', { name: 'Email' }).fill(TEST_EMAIL)
  await page.getByRole('textbox', { name: 'Password' }).fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL('/workspace')

  await page.goto('/chat')

  const marker = Date.now()
  const firstMessage = `Persistence test marker-a-${marker}`
  const secondMessage = `Persistence test marker-b-${marker}`

  await page.getByPlaceholder('Type a message…').fill(firstMessage)
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText(firstMessage)).toBeVisible({ timeout: 15000 })
  await expect(page.getByPlaceholder('Type a message…')).toBeEnabled({ timeout: 15000 })

  await page.getByPlaceholder('Type a message…').fill(secondMessage)
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText(secondMessage)).toBeVisible({ timeout: 15000 })
  await expect(page.getByPlaceholder('Type a message…')).toBeEnabled({ timeout: 15000 })

  await page.reload()

  await expect(page.getByText('Loading…')).not.toBeVisible({ timeout: 15000 })
  await expect(page.getByText(firstMessage)).toBeVisible({ timeout: 15000 })
  await expect(page.getByText(secondMessage)).toBeVisible()
})

test('signed-out visitor is redirected to /login, not shown any chat data', async ({ page, context }) => {
  // Fresh, cookie-less context -- no prior sign-in from this file's other
  // tests leaks in, since Playwright's default context is already isolated
  // per test, but being explicit here documents the intent.
  await context.clearCookies()

  await page.goto('/chat')
  await page.waitForURL('/login')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByPlaceholder('Type a message…')).not.toBeVisible()
})
