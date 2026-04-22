-- Enable the pgvector extension to work with embedding vectors
create extension if not exists vector;

-- Add embedding column with 1536 dimensions (for OpenAI text-embedding-ada-002 / text-embedding-3-small)
alter table public.agent_memory 
  add column if not exists embedding vector(1536);

-- Create an index to speed up vector similarity searches using HNSW (Hierarchical Navigable Small World)
create index if not exists agent_memory_embedding_idx on public.agent_memory 
using hnsw (embedding vector_cosine_ops);

-- Create a function to similarity search agent memory
create or replace function match_agent_memory(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_agent_id text
)
returns table (
  id text,
  agent_id text,
  type text,
  key text,
  content text,
  similarity float
)
language sql stable
as $$
  select
    am.id,
    am.agent_id,
    am.type,
    am.key,
    am.content,
    1 - (am.embedding <=> query_embedding) as similarity
  from public.agent_memory am
  where am.agent_id = p_agent_id
    and 1 - (am.embedding <=> query_embedding) > match_threshold
  order by am.embedding <=> query_embedding
  limit match_count;
$$;
