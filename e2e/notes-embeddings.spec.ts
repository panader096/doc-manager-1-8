import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// Dedicated E2E test account for this project -- not a real user.
// Sourced from .env.local (gitignored), not hardcoded -- see playwright.config.ts.
const TEST_EMAIL = process.env.E2E_TEST_EMAIL!
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD!

type Chunk = { id: number; content: string }

// A second, direct Supabase client (signed in as the same test account) so
// the test can inspect the `documents` table itself -- RLS scopes every
// query to this account's own rows, same as the app does.
async function signedInSupabase() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )
  const { error } = await supabase.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD })
  if (error) throw error
  return supabase
}

async function getChunks(supabase: Awaited<ReturnType<typeof signedInSupabase>>, noteId: number): Promise<Chunk[]> {
  const { data, error } = await supabase.from('documents').select('id, content').eq('note_id', noteId)
  if (error) throw error
  return data
}

test('saving a note embeds chunks, editing replaces them, deleting cascades', async ({ page }) => {
  const supabase = await signedInSupabase()

  await page.goto('/login')
  await page.getByRole('textbox', { name: 'Email' }).fill(TEST_EMAIL)
  await page.getByRole('textbox', { name: 'Password' }).fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL('/workspace')

  await page.goto('/notes')
  await page.getByRole('button', { name: '+ New', exact: true }).click()
  await page.waitForURL(/\/notes\/\d+/)
  const noteId = Number(page.url().match(/\/notes\/(\d+)$/)![1])

  const marker = Date.now()
  const title = `RAG embedding test ${marker}`
  await page.getByPlaceholder('Untitled').fill(title)

  // Long enough (>500 chars) to force chunkText() to produce more than one chunk.
  const firstBody = `First version marker-a-${marker}. `.repeat(20)
  await page.getByPlaceholder('Start writing…').fill(firstBody)

  await expect
    .poll(async () => (await getChunks(supabase, noteId)).length, { timeout: 20000 })
    .toBeGreaterThan(1)

  const firstChunks = await getChunks(supabase, noteId)
  expect(firstChunks.every(c => c.content.includes(`marker-a-${marker}`))).toBe(true)

  // Edit: replace the body entirely with different content.
  const secondBody = `Second version marker-b-${marker}. `.repeat(20)
  await page.getByPlaceholder('Start writing…').fill(secondBody)

  await expect
    .poll(
      async () => {
        const chunks = await getChunks(supabase, noteId)
        return chunks.length > 0 && chunks.every(c => c.content.includes(`marker-b-${marker}`))
      },
      { timeout: 20000 },
    )
    .toBe(true)

  const secondChunks = await getChunks(supabase, noteId)
  const secondIds = new Set(secondChunks.map(c => c.id))
  // Old rows were deleted and reinserted, not updated in place -- no stale
  // marker-a content, and no chunk id survives from the first version.
  expect(secondChunks.some(c => c.content.includes(`marker-a-${marker}`))).toBe(false)
  expect(firstChunks.some(c => secondIds.has(c.id))).toBe(false)

  // Delete the note via the sidebar and confirm its chunks cascade away.
  await page.getByText(title, { exact: true }).hover()
  await page.getByTitle('Delete note').click()

  await expect
    .poll(async () => (await getChunks(supabase, noteId)).length, { timeout: 10000 })
    .toBe(0)
})
