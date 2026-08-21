# AGENTS.md - Signage Plugin Templates

## Project Overview

Vanilla JavaScript project: a signage plugin SDK (`plugin.js`) and self-contained HTML
plugin templates. Plugins run as iframes inside a host signage application and communicate
via `window.postMessage` using the `signage-plugin/v1` protocol. There is **no build step**,
no bundler, no package manager, and no framework.

Default branch: `trunk`

## Build / Lint / Test Commands

There is no `package.json`. No build, test, or lint scripts exist.

### Formatting

Prettier is configured via `.prettierrc` (single quotes, 4-space indent). Run with a
global install:

```bash
prettier --write .          # format all files
prettier --check .          # CI-friendly check (exit 1 on diff)
prettier --write foo.html   # format a single file
```

### Testing

No test framework is set up. No test files exist. If tests are added, keep them alongside
source files or in a `tests/` directory and document the runner here.

### Manual Validation

Use the built-in validator tool to test plugins locally:

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080/validator.html`, enter a plugin URL (e.g. `youtube.html`), and
walk through the Load -> Send Config -> Send Play lifecycle. The validator logs protocol
compliance checks (PASS/FAIL/WARN) in real time.

## Architecture

```
plugin.js          # Core SDK - IIFE exposing global `SignagePlugin`
youtube.html       # YouTube player plugin template
instagram.html     # Instagram embed plugin template
news-ticker.html   # Scrolling RSS news ticker plugin template
rain/rain.html     # Transparent rain-on-glass WebGL overlay plugin template
validator.html     # Dev tool - protocol compliance validator (not a plugin)
.prettierrc        # Prettier config: { singleQuote: true, tabWidth: 4 }
CLAUDE.md          # Duplicate of AGENTS.md (kept in sync)
```

### Plugin Lifecycle (postMessage protocol)

```
Host                          Plugin (iframe)
  |--- loaded? ---------------->|
  |<-------- loaded ------------|   (plugin sends metadata + capabilities)
  |--------- config ----------->|   (host sends configuration)
  |<-------- ready -------------|   (plugin signals readiness)
  |--------- play ------------->|   (host triggers playback)
  |<-------- finished ----------|   (plugin signals completion)
```

Error reporting at any stage: `plugin.error({ code, message, fatal, details })`

## Code Style Guidelines

### Formatting (Prettier)

- **Single quotes** for all strings (`singleQuote: true`)
- **4-space indentation** (`tabWidth: 4`), no tabs
- **Semicolons** required (Prettier default)
- **Trailing commas** on all multi-line structures (Prettier 3 default: `"all"`)
- Print width 80 (Prettier default)

### JavaScript Version

- **ES5-compatible only**: use `var`, not `let`/`const`
- No arrow functions, template literals, destructuring, classes, or ES module syntax
- Use `'use strict'` inside every IIFE

### Module Pattern

- **IIFE revealing module pattern** for all JavaScript
- The SDK exposes a single global: `var SignagePlugin = (function() { ... })();`
- Plugin templates wrap all code in `(function() { 'use strict'; ... })();`
- No ES modules, no CommonJS, no AMD

### Naming Conventions

| Context                        | Convention          | Examples                                    |
|-------------------------------|---------------------|---------------------------------------------|
| JS variables and functions    | camelCase           | `pluginConfig`, `initPlayer`, `showError`   |
| Private/internal functions    | _camelCase (prefix) | `_postToHost`, `_isValidHostMessage`        |
| Constants                     | UPPER_SNAKE_CASE    | `API_VERSION`, `CONFIG_SCHEMA`              |
| Protocol/data property names  | snake_case          | `video_id`, `api_key`, `instance_id`        |
| Error codes                   | UPPER_SNAKE_CASE    | `MISSING_VIDEO_ID`, `YT_API_LOAD_FAILED`   |
| HTML element IDs              | kebab-case          | `#player`, `#error-overlay`                 |

### Imports / Script Loading

- Load the SDK via `<script src="plugin.js"></script>` in each HTML template
- External APIs (e.g., YouTube IFrame API) are loaded dynamically via script injection
- No npm packages, CDN links, or import/export statements

### Error Handling

- **Validation errors** (programmer mistakes): `throw new Error('message')`
- **Runtime/protocol errors**: `plugin.error({ code: 'ERROR_CODE', message: '...', fatal: true/false, details: {} })`
- Error codes must be UPPER_SNAKE_CASE strings
- Use **silent catch** only for cleanup: `try { obj.destroy(); } catch (e) { /* Ignore */ }`
- Display **visual error overlays** for user-facing errors using a `showError(msg)` helper
- Always include `fatal: true` or `fatal: false` in error reports

### Comment Style

- **JSDoc** (`/** ... */`) with `@param` and `@returns` for function documentation
- **Section dividers**: `// ---------------------------------------------------------------`
- **Important notes**: `// NOTE: ...`
- File-level type definitions use JSDoc-style comment blocks (no TypeScript)

### HTML Template Structure

Every plugin template must:

1. Be a **single `.html` file** (self-contained)
2. Include `<script src="plugin.js"></script>` before the inline script
3. Use a full-viewport, no-overflow layout with `background: #000`
4. Use minimal inline `<style>` (no external CSS files)
5. Use an IIFE with `'use strict'` for all inline JS
6. Define a `CONFIG_SCHEMA` object (JSON-schema-like) for the host UI
7. Call `SignagePlugin.create()` with: `plugin` metadata, `capabilities`, `config_schema`,
   `onConfig` handler, and `onPlay` handler
8. Call `plugin.ready()` when the plugin is ready to receive playback
9. Call `plugin.finished()` when playback ends (if `can_finish: true`)
10. Call `plugin.error({...})` on any failure
11. Include a `showError(msg)` function and `#error-overlay` element for visual errors

### Plugin Capabilities

When calling `SignagePlugin.create()`, set capabilities as appropriate:

```js
capabilities: {
    requires_play_signal: true,   // plugin waits for host "play" message
    can_finish: true,             // plugin will signal when done
    static_media: false           // true if content does not change over time
}
```

### Defensive Coding Patterns

- Null/undefined checks before accessing nested properties
- Explicit defaults: `config.mute !== undefined ? config.mute : true`
- Handle race conditions with flags (e.g., `pendingPlay` for async API loading)
- Clean up resources (destroy players, remove listeners) before reconfiguring
- Validate origin of incoming `postMessage` events when `allowed_origin` is set
