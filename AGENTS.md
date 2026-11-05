<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Database access rules

Before writing any RLS policy or `SECURITY DEFINER` function, read `docs/db-access-rules.md`. Use the helper functions (`user_in_term`, `user_can_manage_session`, ...) instead of querying `mandates` inline, and verify every new rule with a rolled-back role-impersonation probe (active / inactive / other-term mandate).
