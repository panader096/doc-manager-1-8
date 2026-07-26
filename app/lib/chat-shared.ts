// Shared, framework-safe constants for the /chat RAG tool loop -- consumed by
// both the non-streaming Server Action (`chat-actions.ts`) and the streaming
// Route Handler (`app/api/chat/route.ts`).
//
// Deliberately NOT a 'use server' module: Next.js only allows async function
// exports from a 'use server' file (confirmed by an actual dev-server
// compile error while building this), so these plain consts can't live in
// chat-actions.ts alongside sendMessage() once a second caller (the route
// handler) needs them too. This is a plain server-only module -- fine to
// import from other server-only modules (Server Actions, Route Handlers),
// just never from a Client Component directly.
import type { ToolDefinition } from './ai'

export const SYSTEM_PROMPT =
  'You are a helpful assistant. The user also has a personal notes app; you have a search_notes tool that ' +
  "searches it, always scoped to this user's own notes only. Decide for yourself whether a question needs " +
  "it -- skip it entirely for general-knowledge questions that have nothing to do with the user's notes. When " +
  'you do search and the results look weak, irrelevant, or empty, rewrite the query (different wording, more ' +
  'specific or more general as appropriate) and search again rather than answering from a poor match. If, ' +
  "after trying, nothing relevant turns up for a question that does seem to be about the user's notes, say so " +
  'directly instead of guessing. When you do use a note in your answer, cite it by name (for example, "based ' +
  'on your note about the London event...").'

export const SEARCH_NOTES_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'search_notes',
    description:
      "Search the user's personal notes for chunks relevant to a query. Use this only when the answer " +
      'plausibly requires something the user previously wrote in their own notes. Do not use it for general ' +
      'knowledge questions unrelated to personal notes (for example, "what is Paris the capital of?").',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'The search query, phrased to best match how this might be worded in the notes. Rephrase and ' +
            "call again if an earlier search's results looked weak or irrelevant.",
        },
      },
      required: ['query'],
    },
  },
}

// Model gets up to this many tool-enabled rounds before being forced to
// answer with whatever it has -- bounds cost/latency if it kept rewriting.
export const MAX_TOOL_ROUNDS = 3
