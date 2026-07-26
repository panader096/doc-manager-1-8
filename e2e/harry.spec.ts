import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// Dedicated E2E test account for this project -- not a real user.
// Sourced from .env.local (gitignored), not hardcoded -- see playwright.config.ts.
const TEST_EMAIL = process.env.E2E_TEST_EMAIL!
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD!

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_PDF = path.join(__dirname, 'fixtures', 'test-document.pdf')

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.getByRole('textbox', { name: 'Email' }).fill(TEST_EMAIL)
  await page.getByRole('textbox', { name: 'Password' }).fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL('/workspace')
}

async function createHarryChat(page: import('@playwright/test').Page, title: string) {
  await page.goto('/harry')
  await page.getByRole('button', { name: '+ New chat' }).click()
  await page.getByPlaceholder('Chat name…').fill(title)
  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Choose PDF…' }).click()
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles(FIXTURE_PDF)
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  // Upload + parse + chunk + embed of a real PDF took under 15s in manual
  // testing, but budget generously.
  await page.waitForURL(/\/harry\/\d+/, { timeout: 60000 })
  return Number(page.url().match(/\/harry\/(\d+)$/)![1])
}

async function sendHarryMessage(page: import('@playwright/test').Page, message: string) {
  await page.getByPlaceholder('Ask Harry a question…').fill(message)
  await page.getByRole('button', { name: 'Send' }).click()
  // sendMessage makes two sequential OpenRouter calls (draft + validation),
  // confirmed to take up to ~40s in manual testing -- give real margin.
  await expect(page.getByText('Harry is reviewing the document…')).not.toBeVisible({ timeout: 60000 })
  return page.locator('main div.whitespace-pre-wrap').last()
}

test('1. happy path: Harry answers from the document with a page citation', async ({ page }) => {
  const marker = Date.now()
  await signIn(page)
  await createHarryChat(page, `Smoke test ${marker}`)

  const reply = await sendHarryMessage(page, `What is the refund window? (ref ${marker})`)
  await expect(reply).toContainText(/30 days/i)
  // Confirmed real rendered badge text is "p. 1 · High" -- a single text node
  // in a sibling <span> right after the claim text.
  await expect(reply).toContainText(/p\.\s*1\s*·\s*High/i)
})

test('2. grounding: Harry admits when the document does not cover a question', async ({ page }) => {
  const marker = Date.now()
  await signIn(page)
  await createHarryChat(page, `Smoke test ${marker}`)

  const reply = await sendHarryMessage(page, `What is the CEO's name? (ref ${marker})`)
  await expect(reply).toContainText(/isn.?t addressed|not addressed|does not cover|doesn.?t cover|no mention/i)
})

test('3. management: rename and delete a chat', async ({ page }) => {
  const marker = Date.now()
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )
  await supabase.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD })

  await signIn(page)
  const chatId = await createHarryChat(page, `Rename me ${marker}`)

  const row = page.locator('aside').getByText(`Rename me ${marker}`)
  await row.hover()
  await page.getByRole('button', { name: 'Rename chat' }).click()
  await page.locator('aside input').fill(`Renamed ${marker}`)
  await page.keyboard.press('Enter')
  await expect(page.locator('aside').getByText(`Renamed ${marker}`)).toBeVisible()

  await page.locator('aside').getByText(`Renamed ${marker}`).hover()
  // "Delete chat" is the hover icon that opens the confirmation modal;
  // the modal's own confirm button is "Delete" (exact) -- these are two
  // distinct buttons, not the same selector.
  await page.getByRole('button', { name: 'Delete chat' }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.locator('aside').getByText(`Renamed ${marker}`)).not.toBeVisible()

  const { data } = await supabase.from('reviewer_chats').select('id').eq('id', chatId)
  expect(data).toHaveLength(0)
})
