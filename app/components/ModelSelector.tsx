'use client'

import { useEffect, useState } from 'react'
import { getUserSettings, updateChatModel, updateHarryModel } from '../lib/settings'

// Chat and Harry each offer their own vetted set -- Harry swaps Sonnet for a
// free-tier model (no OpenRouter spend) since document QA doesn't need
// Sonnet's extra reasoning cost the same way general chat might.
const MODEL_OPTIONS_BY_APP = {
  chat: [
    { slug: 'anthropic/claude-haiku-4.5', label: 'Haiku 4.5 (cheap & fast)' },
    { slug: 'anthropic/claude-sonnet-5', label: 'Sonnet 5 (stronger, ~3-4x cost)' },
    { slug: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash (alternate cheap)' },
  ],
  harry: [
    { slug: 'anthropic/claude-haiku-4.5', label: 'Haiku 4.5 (cheap & fast)' },
    { slug: 'google/gemma-4-26b-a4b-it:free', label: 'Gemma 4 26B (free)' },
    { slug: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash (alternate cheap)' },
  ],
} as const

export default function ModelSelector({ app }: { app: 'chat' | 'harry' }) {
  const [model, setModel] = useState<string | null>(null)

  useEffect(() => {
    getUserSettings().then(settings => setModel(app === 'chat' ? settings.chat_model : settings.harry_model))
  }, [app])

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value
    setModel(next)
    if (app === 'chat') await updateChatModel(next)
    else await updateHarryModel(next)
  }

  if (!model) return null

  return (
    <select
      value={model}
      onChange={handleChange}
      className="text-[11px] rounded-[4px] border px-1.5 py-1 outline-none"
      style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-2)' }}
    >
      {MODEL_OPTIONS_BY_APP[app].map(opt => (
        <option key={opt.slug} value={opt.slug}>{opt.label}</option>
      ))}
    </select>
  )
}
