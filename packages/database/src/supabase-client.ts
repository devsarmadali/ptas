import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase-types.js";

export interface SupabaseConfig {
  readonly url: string;
  readonly key: string;
}

export type {
  SupabaseClient,
  User,
  Session,
  AuthError,
  AuthChangeEvent
} from "@supabase/supabase-js";

/**
 * Creates a strongly-typed Supabase client for PTAS.
 * Bound to official database schema generated via Supabase MCP.
 */
export function createPtasSupabaseClient(config: SupabaseConfig): SupabaseClient<Database> {
  if (!config.url || !config.key) {
    throw new Error("Supabase URL and API Key are required to initialize PTAS Supabase client");
  }
  return createClient<Database>(config.url, config.key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

/**
 * Creates a browser-ready Supabase client configured for interactive session persistence.
 */
export function createBrowserSupabaseClient(config: SupabaseConfig): SupabaseClient<Database> {
  if (!config.url || !config.key) {
    throw new Error("Supabase URL and API Key are required to initialize PTAS Supabase client");
  }
  return createClient<Database>(config.url, config.key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
}
