// Server-only OpenRouter connection. Import this only from Server Components,
// Route Handlers, or Server Actions — never from a 'use client' file.

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
const DEFAULT_MODEL = 'anthropic/claude-haiku-4.5'
const DEFAULT_MAX_TOKENS = 1024

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export async function createChatCompletion(
  messages: ChatMessage[],
  model: string = DEFAULT_MODEL,
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set')
  }

  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, messages, max_tokens: DEFAULT_MAX_TOKENS }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenRouter request failed (${response.status}): ${errorText}`)
  }

  const data = await response.json()
  return data.choices[0].message.content
}
