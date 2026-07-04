---
title: Postgres Full Text Search
description: How Postgres tsvector/tsquery full-text search works, and how to index it with Supabase.
url: "https://supabase.com/docs/guides/database/full-text-search"
---

> Source: https://supabase.com/docs/guides/database/full-text-search

This is what `app/lib/db.ts`'s `searchNotes()` and `supabase/migrations/0005_notes_search_vector.sql` are built on (notes app, `/notes` search box).

## Core Concepts

### tsvector and tsquery

The `to_tsvector()` function converts text into searchable tokens. For example:
```sql
select to_tsvector('green eggs and ham');
-- Returns 'egg':2 'green':1 'ham':4
```

The `to_tsquery()` function converts query strings into comparable tokens, enabling "fuzzy matching" where variations like "egg" and "eggs" are treated as equivalent matches.

### Match Operator: @@

The `@@` operator returns matches between a tsvector result and a tsquery result:
```sql
select * from books
where to_tsvector(title) @@ to_tsquery('Harry');
```

## Query Functions

Postgres provides several query conversion functions:

- **`to_tsquery()`** - Requires manual operator specification (`&`, `|`, `!`)
- **`plainto_tsquery()`** - Converts plain text to AND queries: `'fat' & 'rat'`
- **`phraseto_tsquery()`** - Creates phrase queries: `'fat' <-> 'rat'`
- **`websearch_to_tsquery()`** - Supports web search syntax with quotes, "or", and negation

## Basic Queries

### Multiple Columns
Concatenate columns with a space separator:
```sql
select * from books
where to_tsvector(description || ' ' || title) @@ to_tsquery('little');
```

### AND / OR queries
```sql
where to_tsvector(description) @@ to_tsquery('little & big');  -- AND
where to_tsvector(description) @@ to_tsquery('little | big');  -- OR
```

## Partial Search with Prefix Matching

Use the `:*` syntax for substring/prefix matching — this is what keeps `/notes` search feeling like it narrows on every keystroke instead of only matching complete words:
```sql
select title from books
where to_tsvector(title) @@ to_tsquery('Lit:*');
```

## Creating Indexes

### Generated Columns

Create a searchable index column using generated columns — this is exactly the pattern `notes.search_vector` uses:
```sql
alter table books
add column fts tsvector
generated always as (
  to_tsvector('english', description || ' ' || title)
) stored;

create index books_fts on books using gin (fts);
```

This automatically updates whenever the source columns change — no triggers needed.

### Search with the indexed column
```sql
select * from books
where fts @@ to_tsquery('little & big');
```

## Ranking Results

`ts_rank()` scores matches by relevance, and `setweight()` lets a title match outrank a body match:
```sql
alter table books
add column fts_weighted tsvector
generated always as (
  setweight(to_tsvector('english', title), 'A') ||
  setweight(to_tsvector('english', description), 'B')
) stored;

create index books_fts_weighted on books using gin (fts_weighted);
```

Not currently used in this project — `notes.search_vector` treats title and body as equal weight — but worth reaching for if search results ever need title matches to rank above body matches.
