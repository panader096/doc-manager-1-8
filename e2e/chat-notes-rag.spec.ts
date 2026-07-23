import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// Dedicated E2E test account for this project -- not a real user.
// Sourced from .env.local (gitignored), not hardcoded -- see playwright.config.ts.
const TEST_EMAIL = process.env.E2E_TEST_EMAIL!
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD!

// Second dedicated test account, for cross-user isolation testing only.
// Not present in .env.local yet -- test 3 below skips itself until it is.
const TEST_EMAIL_2 = process.env.E2E_TEST_EMAIL_2
const TEST_PASSWORD_2 = process.env.E2E_TEST_PASSWORD_2

async function signedInSupabase(email: string, password: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return supabase
}

async function chunkCount(supabase: Awaited<ReturnType<typeof signedInSupabase>>, noteId: number) {
  const { data, error } = await supabase.from('documents').select('id').eq('note_id', noteId)
  if (error) throw error
  return data.length
}

async function signIn(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByRole('textbox', { name: 'Email' }).fill(email)
  await page.getByRole('textbox', { name: 'Password' }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL('/workspace')
}

async function createNoteViaUi(page: import('@playwright/test').Page, title: string, body: string) {
  await page.goto('/notes')
  await page.getByRole('button', { name: '+ New', exact: true }).click()
  await page.waitForURL(/\/notes\/\d+/)
  const noteId = Number(page.url().match(/\/notes\/(\d+)$/)![1])
  await page.getByPlaceholder('Untitled').fill(title)
  await page.getByPlaceholder('Start writing…').fill(body)
  return noteId
}

async function sendChatMessage(page: import('@playwright/test').Page, message: string) {
  await page.getByPlaceholder('Type a message…').fill(message)
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Thinking…')).not.toBeVisible({ timeout: 20000 })
  return page.locator('main div.whitespace-pre-wrap').last()
}

test('1. happy path: chat answers from a note and cites it', async ({ page }) => {
  const supabase = await signedInSupabase(TEST_EMAIL, TEST_PASSWORD)

  await signIn(page, TEST_EMAIL, TEST_PASSWORD)

  const marker = Date.now()
  const noteTitle = `London event notes ${marker}`
  const secretWord = `zephyr-${marker}`
  const noteId = await createNoteViaUi(
    page,
    noteTitle,
    `Notes about the London event. The secret code word for this event is ${secretWord}.`,
  )

  // Wait for the autosave -> re-embed pipeline to land chunks for this note.
  await expect.poll(async () => chunkCount(supabase, noteId), { timeout: 20000 }).toBeGreaterThan(0)

  await page.goto('/chat')

  const reply = await sendChatMessage(
    page,
    `What is the secret code word in my notes about the London event? (ref ${marker})`,
  )
  await expect(reply).toContainText(secretWord)
  // Cites the note it drew from, per the "based on your note about..." requirement.
  await expect(reply).toContainText(/london event/i)

  // Bonus coverage from the tool-calling upgrade: a general-knowledge question
  // should be answered directly, with no retrieval / no "not found" phrasing.
  const generalReply = await sendChatMessage(page, `What is Paris the capital of? (ref ${marker})`)
  await expect(generalReply).toContainText(/france/i)
  await expect(generalReply).not.toContainText(
    /couldn.?t find|do not have|don.?t have|no relevant|not found|no note|unable to find/i,
  )

  await supabase.from('notes').delete().eq('id', noteId)
})

test('2. nothing relevant: chat admits it rather than guessing', async ({ page }) => {
  await signIn(page, TEST_EMAIL, TEST_PASSWORD)

  const marker = Date.now()
  await page.goto('/chat')

  // A question that reads like a notes question but has no matching content --
  // the model must say so rather than inventing an answer from a note that
  // doesn't exist.
  const reply = await sendChatMessage(
    page,
    `What does my note say about the ${marker}-nonexistent-topic project? (ref ${marker})`,
  )
  await expect(reply).toContainText(
    /couldn.?t find|do not have|don.?t have|no relevant|not found|no note|unable to find/i,
  )
})

test('3. cross-user isolation: user B never sees user A\'s note content', async ({ page }) => {
  test.skip(
    !TEST_EMAIL_2 || !TEST_PASSWORD_2,
    'Requires E2E_TEST_EMAIL_2 / E2E_TEST_PASSWORD_2 in .env.local -- a second confirmed test account',
  )

  const supabaseA = await signedInSupabase(TEST_EMAIL, TEST_PASSWORD)

  const marker = Date.now()
  const noteTitle = `User A private note ${marker}`
  const secretMarker = `SECRET_MARKER_${marker}_do_not_leak`

  // Sign in as user A, seed a distinctive private note.
  await signIn(page, TEST_EMAIL, TEST_PASSWORD)
  const noteId = await createNoteViaUi(page, noteTitle, `${secretMarker}: my bank PIN is 9999.`)
  await expect.poll(async () => chunkCount(supabaseA, noteId), { timeout: 20000 }).toBeGreaterThan(0)

  // Sign out, sign in as user B.
  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.waitForURL('/login')
  await signIn(page, TEST_EMAIL_2!, TEST_PASSWORD_2!)

  await page.goto('/chat')
  const reply = await sendChatMessage(
    page,
    `Do you know anything about a note titled "${noteTitle}", or a bank PIN? (ref ${marker})`,
  )
  await expect(reply).not.toContainText(secretMarker)
  await expect(reply).not.toContainText('9999')

  // Cleanup: remove user A's seeded note (cascades its chunks too).
  await supabaseA.from('notes').delete().eq('id', noteId)
})
