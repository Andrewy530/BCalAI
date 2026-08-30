/**
 * Generated file — do not edit by hand.
 *
 * Regenerate after every migration:
 *   pnpm db:types
 *
 * CI fails if this file is stale relative to the migrations.
 *
 * Until it has been generated once against a local Supabase instance, the
 * permissive placeholder below keeps the workspace type-checking. It is
 * deliberately loose rather than empty: `supabase.from('tasks')` compiles, but
 * row types are `unknown`, so every API module must validate with Zod — which
 * is what `AGENTS.md` requires anyway.
 */
export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

type PlaceholderRow = Record<string, unknown>;

export interface Database {
  public: {
    Tables: {
      [table: string]: {
        Row: PlaceholderRow;
        Insert: PlaceholderRow;
        Update: PlaceholderRow;
        Relationships: [];
      };
    };
    Views: {
      [view: string]: {
        Row: PlaceholderRow;
        Relationships: [];
      };
    };
    Functions: {
      [fn: string]: {
        Args: Record<string, unknown>;
        Returns: unknown;
      };
    };
    Enums: { [name: string]: string };
    CompositeTypes: { [name: string]: PlaceholderRow };
  };
}
