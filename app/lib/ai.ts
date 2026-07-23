// Server-only OpenRouter connection. Import this only from Server Components,
// Route Handlers, or Server Actions — never from a 'use client' file.

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
const DEFAULT_MODEL = 'anthropic/claude-haiku-4.5'
const DEFAULT_MAX_TOKENS = 1024
// Pinned per the Embeddings section of CLAUDE.md -- do not change without
// dropping and re-embedding all documents.
const EMBEDDING_MODEL = 'openai/text-embedding-3-small'

export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

// The message shapes OpenRouter's (OpenAI-compatible) chat completions
// endpoint accepts -- including the 'assistant' message a tool call arrives
// in, and the 'tool' message a tool's result is reported back with.
export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

export interface AssistantMessage {
  content: string | null
  tool_calls?: ToolCall[]
}

export async function createChatCompletion(
  messages: ChatMessage[],
  options: { model?: string; tools?: ToolDefinition[] } = {},
): Promise<AssistantMessage> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set')
  }

  const { model = DEFAULT_MODEL, tools } = options

  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: DEFAULT_MAX_TOKENS,
      ...(tools ? { tools } : {}),
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenRouter request failed (${response.status}): ${errorText}`)
  }

  const data = await response.json()
  const message = data.choices[0].message
  return { content: message.content ?? null, tool_calls: message.tool_calls }
}

export async function createEmbeddings(inputs: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set')
  }

  const response = await fetch(`${OPENROUTER_BASE_URL}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: inputs }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenRouter embeddings request failed (${response.status}): ${errorText}`)
  }

  const data = await response.json()
  return data.data.map((item: { embedding: number[] }) => item.embedding)
}
