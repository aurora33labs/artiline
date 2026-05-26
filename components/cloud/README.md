# components/cloud — paid UI components

Same rule as `lib/cloud/`: dynamic import only, gated by `isFeatureEnabled()`.

Use `next/dynamic({ ssr: false })` for client components, dynamic `await import()` inside RSC for server components.
