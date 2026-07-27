// Server-only OpenRouter connection. Import this only from Server Components,
// Route Handlers, or Server Actions — never from a 'use client' file.

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
const DEFAULT_MODEL = 'anthropic/claude-haiku-4.5'
const DEFAULT_MAX_TOKENS = 1024

// The only model slugs a user's stored preference (user_settings.chat_model/
// harry_model) is allowed to select -- must match ModelSelector.tsx's
// MODEL_OPTIONS_BY_APP for the corresponding app. Enforced at every read
// site (never trust the stored value directly) so a user editing their own
// row via the raw Supabase client can't point their own requests at an
// arbitrary, unvetted, or expensive model billed to this app's single
// shared OPENROUTER_API_KEY. Harry's list swaps Sonnet for a free-tier
// model (no OpenRouter spend) since document QA doesn't need Sonnet's extra
// reasoning cost the same way general chat might; /chat keeps Sonnet.
export const CHAT_ALLOWED_MODELS = [
  'anthropic/claude-haiku-4.5',
  'anthropic/claude-sonnet-5',
  'google/gemini-2.5-flash',
] as const

export const HARRY_ALLOWED_MODELS = [
  'anthropic/claude-haiku-4.5',
  'google/gemma-4-26b-a4b-it:free',
  'google/gemini-2.5-flash',
] as const

export function sanitizeModel(model: string | null | undefined, allowedModels: readonly string[]): string | undefined {
  return model && allowedModels.includes(model) ? model : undefined
}
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

// Multimodal content parts for a 'user' message -- text plus an optional
// image, per OpenRouter's (OpenAI-compatible) vision input shape.
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

// The message shapes OpenRouter's (OpenAI-compatible) chat completions
// endpoint accepts -- including the 'assistant' message a tool call arrives
// in, and the 'tool' message a tool's result is reported back with. 'user'
// content widens to ContentPart[] for turns that attach an image (3b) --
// still plain string for every other turn/role.
export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | ContentPart[] }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

export interface AssistantMessage {
  content: string | null
  tool_calls?: ToolCall[]
  model: string
  usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null
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
  return {
    content: message.content ?? null,
    tool_calls: message.tool_calls,
    model: data.model,
    usage: data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        }
      : null,
  }
}

// Same request shape as createChatCompletion, but with stream: true and
// stream_options.include_usage so the final SSE chunk carries token usage --
// otherwise usage is only available on non-streamed responses.
export async function createChatCompletionStream(
  messages: ChatMessage[],
  options: { model?: string } = {},
): Promise<ReadableStream<Uint8Array>> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set')
  }

  const { model = DEFAULT_MODEL } = options

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
      stream: true,
      stream_options: { include_usage: true },
    }),
  })

  if (!response.ok || !response.body) {
    const errorText = response.body ? await response.text() : 'no response body'
    throw new Error(`OpenRouter stream request failed (${response.status}): ${errorText}`)
  }

  return response.body
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
