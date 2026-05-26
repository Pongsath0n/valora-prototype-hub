## Database assets

- This directory stores Supabase SQL/schema files for Valora/Brewway.
- `database/supabase.sql` is the only active local schema reference/source of truth.
- Files in `database/archive/` are legacy references only.
- Agent/dev must not use archived schema files as source of truth.
- `menu_items` and `recipe_items` must not be used.
- Billing/subscription/invoice tables are out of scope.
- Future migrations and seed scripts should also live here (not implemented in this phase).
- Supabase MCP is **not** used in this phase.
