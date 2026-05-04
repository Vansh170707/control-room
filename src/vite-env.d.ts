/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_AGENT_RUNTIME_URL?: string;
  readonly VITE_CLOUD_BRIDGE_AGENT_ID?: string;
  readonly VITE_CLOUD_BRIDGE_INGEST_SECRET?: string;
  readonly VITE_CLOUD_CHAT_API_URL?: string;
  readonly VITE_GEMINI_API_KEY?: string;
  readonly VITE_CLOUD_CHAT_MODEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
