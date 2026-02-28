# @cortex/core-ui

Shared design-system primitives for the cortex monorepo.

## Scope
This package contains **only** headless shadcn/ui primitives and the `cn()` utility.
Chat-specific or app-specific components do **not** belong here.

## Adding a new shadcn component
```sh
cd packages/core-ui
bunx shadcn@latest add <component-name>
```
The `components.json` is configured so the CLI installs into `src/components/ui/`.
After adding, re-export the new component from `src/index.ts`.

## Validation
```sh
bun run --cwd packages/core-ui typecheck
```

## Consuming in apps
Apps must add a Tailwind `@source` directive and import the shared theme:
```css
@import "@cortex/core-ui/theme.css";
@source "../../../../packages/core-ui/src/**/*.{ts,tsx}";
```
