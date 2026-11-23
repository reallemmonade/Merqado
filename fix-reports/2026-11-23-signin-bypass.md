# Temporary sign-in bypass (2026-11-23)
- What happened: Work-email sign-in only accepted a real firm email routed to its SSO, so a placeholder like XXXX got "Your firm isn't on Merqado yet".
- What changed: On a test copy, setting SIGNIN_BYPASS_CODE, SIGNIN_BYPASS_EMAIL and SIGNIN_BYPASS_UNTIL lets that code typed in the Work email box sign in as the one named existing user. Off unless all three are set.
- Why it holds: it expires at the date (max 14 days out), never creates users or firms, is unset on the live site, and is covered by tests/auth/bypass.test.ts.
