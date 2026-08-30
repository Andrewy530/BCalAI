# 0001 — React Native + Expo for the mobile app

- **Status:** Accepted
- **Date:** 2026-08-30

## Context

Two developers, AI-assisted, targeting iOS first but not wanting to foreclose
Android. The product needs device calendars, local notifications, haptics,
secure storage, deep links, and eventually iOS widgets.

## Decision

React Native + Expo + TypeScript, with Expo Router for navigation and an **Expo
development build** — not Expo Go — as the working environment from day one.

## Consequences

**Good.** One codebase for both platforms. Expo's tooling (EAS builds, OTA
updates, config plugins) removes most of the native build burden. Native
modules remain available through the development build, so WidgetKit later is a
config-plugin problem rather than a rewrite.

**Costs.** Some iOS polish takes more effort than in SwiftUI. Reanimated and
Gesture Handler must be kept in step with the SDK. Expo Go is unusable once
native modules are added, so every developer needs a dev client build before
they can run anything — the README covers this.

## Alternatives

- **Native Swift + Kotlin.** Best possible iOS feel, roughly double the work for
  a two-person team. Rejected on capacity.
- **Flutter.** Capable, but a smaller overlap with the team's existing
  TypeScript skills and no shared code with a future web surface.
