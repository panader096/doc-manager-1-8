---
title: pgvector — Embedding columns and similarity search in Postgres
description: How Supabase's pgvector extension stores embeddings and how similarity-search RPC functions work, as used by this project's RAG features.
url: "https://supabase.com/docs/guides/ai/vector-columns"
---

Reference for how `documents` (Chat's `search_notes` RAG store) and `reviewer_doc_chunks` (Harry's RAG store) actually work in this project. Both tables use the same mechanism described here.

## Enabling the extension

```sql
create extension vector with schema extensions;
```

Enabled once, in `extensions` schema — every `vector(...)` column and distance operator in this project's migrations lives under that schema, which is why RPC functions here set `search_path = public, extensions` explicitly (a bare `search_path = public` fails with `operator does not exist: extensions.vector <=> extensions.vector`, a real error hit once in this project's migration history).

## Vector columns

```sql
embedding extensions.vector(1536)
```

The dimension must match the embedding model's output exactly — `1536` here because this project uses `openai/text-embedding-3-small` (see CLAUDE.md's "Embeddings" section) for both vector stores. Changing embedding models later requires dropping and re-embedding every row, since a stored `vector(1536)` from one model is not comparable to another model's output space even at the same dimension.

## Distance operator

| Operator | Method |
|---|---|
| `<=>` | Cosine distance |
| `<->` | Euclidean (L2) distance |
| `<#>` | Negative inner product |

This project uses `<=>` (cosine distance) throughout — `match_documents` and `match_reviewer_chunks` both rank by `1 - (embedding <=> query_embedding)` as a similarity score, then filter by a `match_threshold` (0.0–1.0, higher = stricter).

## Similarity search via RPC, not a raw query

PostgREST (the API layer Supabase's JS client talks to) can't express a `<=>` operator directly in a `.select()` call, so every similarity search here goes through a `security invoker` Postgres function called via `.rpc(...)`, scoped by the caller's own IDs so RLS-equivalent isolation holds even though the function itself runs the raw SQL:

```sql
create or replace function match_reviewer_chunks(
  query_embedding extensions.vector(1536),
  match_threshold float,
  match_count int,
  p_user_id uuid,
  p_chat_id bigint
)
returns table (id bigint, page int, content text, similarity float)
language sql stable security invoker
set search_path = public, extensions
as $$
  select reviewer_doc_chunks.id, reviewer_doc_chunks.page, reviewer_doc_chunks.content,
    1 - (reviewer_doc_chunks.embedding <=> query_embedding) as similarity
  from reviewer_doc_chunks
  where user_id = p_user_id and chat_id = p_chat_id
    and 1 - (reviewer_doc_chunks.embedding <=> query_embedding) > match_threshold
  order by reviewer_doc_chunks.embedding <=> query_embedding
  limit match_count
$$;
```

`match_documents` (Chat) follows the identical shape, scoped by `p_user_id` only (no per-chat scoping, since Chat has one conversation per user, not many). Both call sites embed the model's query text server-side via `createEmbeddings()` (`app/lib/ai.ts`) immediately before calling the RPC — the model itself never sees or supplies a raw vector.
