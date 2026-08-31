# Design system

Reference points: **Copilot Money** for visual quality and information
hierarchy, **Business Calendar 2** for scheduling density, **Notion** for
flexible organisation. We take the principles, not the pixels.

## Principles

1. **Dense, but calm.** A week view is information-heavy by nature. Calm comes
   from restraint in colour and generous vertical rhythm, not from showing less.
2. **Accent sparingly.** One accent colour. If everything is highlighted,
   nothing is.
3. **Progressive disclosure.** The essential fact first; detail behind a tap.
4. **Motion communicates.** Every animation marks a state change. Nothing
   animates decoratively.
5. **Empty states do work.** They say what the user can do, never merely that
   there is no data.
6. **Dark mode is first-class**, not an inversion.

## Tokens

All tokens live in `packages/ui/src/theme/`. Components reference _roles_
(`surface`, `textSecondary`, `accent`), never raw hex. That is what makes a real
dark mode possible.

| Group     | File            | Notes                                                     |
| --------- | --------------- | --------------------------------------------------------- |
| Colour    | `colors.ts`     | `ColorTokens` implemented by `darkColors` / `lightColors` |
| Spacing   | `tokens.ts`     | 4pt scale, `xs` (4) … `huge` (48)                         |
| Radius    | `tokens.ts`     | `sm` (8) … `xxl` (28), `pill`                             |
| Elevation | `tokens.ts`     | Soft shadows; depth comes mostly from surface colour      |
| Motion    | `tokens.ts`     | 80–320ms, standard easing, one spring                     |
| Type      | `typography.ts` | 12 variants, `display` … `mono`                           |

Adding a variant or a colour role is a design decision. Reach for an existing
token first.

## Primitives

`Screen`, `Text`, `Button`, `IconButton`, `Card`, `ListRow`, `Chip`, `Badge`,
`Divider`, `SectionHeader`, `Avatar`, `TextField`, `BottomSheet`, `EmptyState`,
`LoadingState`, `Skeleton`, `ErrorState`.

Every screen starts with `Screen` — it owns safe-area insets, the page
background, the status-bar style, and the standard page inset, so no screen
re-derives them.

`BottomSheet` is the primary create/edit surface. Quick Add, the event editor,
and the task editor all compose it rather than pushing a full screen, which
keeps capture fast and the context behind it visible.

## Rules

- Never write a one-off style for something that is a Button, Card, or ListRow.
  Extend the primitive once, for everyone.
- Never hard-code a colour, radius, or spacing value in a feature file.
- Icon-only controls require `accessibilityLabel` — `IconButton` makes it a
  required prop.
- Interactive targets are at least 44pt (`theme.hitSlopSize`).
- Haptics only on meaningful state change: task completion, successful capture,
  sign-in. Never on scroll or navigation.

## Where the theme lives

Tokens live in `@cal/ui` rather than the app so the primitives are
self-contained and a future web or admin surface can adopt the same scale.
`apps/mobile/src/theme` re-exports them and is the only place app-specific
product palettes belong.
