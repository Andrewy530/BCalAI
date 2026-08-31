# One-time handoff note for Andrew / Andrewy530

This note is intended for Andrew working from the `Andrewy530/BCalAI`
repository. Confirm the remote before acting; do not assume a person’s
identity from this file alone.

The repository history was rewritten to correct the authors on two commits.
Because Git commit IDs include their parent history, later commits received new
IDs as well. `main` and `feature/floating-liquid-glass-tab-bar` now point to
the rewritten history.

- `d3c8fdf...` is now `02f8777...`.
- `313e99e...` is now `c96de73...`.

If your clone has no local work to preserve:

```bash
git fetch origin
git switch main
git reset --hard origin/main
```

If you have uncommitted changes or local commits, do not reset yet. Make a
backup branch and stash uncommitted files first, then sync with the commands
above. Do not force-push the old history back to GitHub.

The same reset approach works for the feature branch:

```bash
git fetch origin
git switch feature/floating-liquid-glass-tab-bar
git reset --hard origin/feature/floating-liquid-glass-tab-bar
```

After the history sync succeeds, fix the broken `+` Quick Add button in the
bottom iOS Liquid Glass tab bar. Keep the native Liquid Glass tab bar, verify
that the button is visible and opens Quick Add, and then delete this one-time
`CLAUDE.md` handoff note after the fix has been verified.
