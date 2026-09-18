# Signage Plugin Templates

A lightweight SDK and collection of HTML plugin templates for building signage
display plugins. Plugins run as iframes inside a host signage application and
communicate via `window.postMessage` using the `signage-plugin/v1` protocol.

There is no build step, no bundler, no package manager, and no framework.
Everything is vanilla JavaScript (ES5) and self-contained HTML files.

## Quick Start

1. Copy an existing plugin template (e.g. `youtube.html`) and rename it.
2. Include the SDK: `<script src="plugin.js"></script>`
3. Call `SignagePlugin.create(...)` with your plugin metadata, config schema, and
   handlers.
4. Validate your plugin using the built-in validator tool (see
   [Validating Plugins](#validating-plugins)).

---

## Repository Structure

```
plugin.js          Core SDK - exposes the global SignagePlugin object
youtube.html       YouTube player plugin template
instagram.html     Instagram embed plugin template
news-ticker.html   Scrolling RSS news ticker plugin template
rain/rain.html     Transparent rain-on-glass overlay plugin template
halloween/halloween.html   Transparent Halloween decorations overlay plugin template
christmas/christmas.html   Transparent Christmas snow/plow/santa overlay plugin template
easter/easter.html Transparent Easter bunny/egg overlay plugin template
validator.html     Development tool - protocol compliance validator
.prettierrc        Prettier config (single quotes, 4-space indent)
```

---

## Plugin Lifecycle

Plugins follow a strict message-based lifecycle between the host application and
the plugin iframe:

```
Host                              Plugin (iframe)
  |                                  |
  |   (host loads plugin in iframe)  |
  |                                  |  SignagePlugin.create() called
  |<----------- loaded --------------|  plugin sends metadata + capabilities
  |                                  |
  |------------ config ------------>|  host sends configuration
  |                                  |  onConfig callback fires
  |                                  |  (plugin prepares content)
  |<----------- ready ---------------|  plugin.ready() called
  |                                  |
  |------------ play -------------->|  host triggers playback
  |                                  |  onPlay callback fires
  |                                  |  (plugin plays content)
  |                                  |
  |<-------- interaction ------------|  plugin.interaction(...) (optional)
  |                                  |
  |<----------- finished ------------|  plugin.finished() (if can_finish=true)
  |                                  |
  |<----------- error --------------|  plugin.error({...}) at any point
```

1. **Loaded** -- The plugin initializes and immediately announces itself to the
   host with its name, version, capabilities, and config schema.
2. **Config** -- The host sends configuration data (instance ID, config object,
   optional content and timing info). The plugin processes this and prepares.
3. **Ready** -- The plugin signals it is ready for playback.
4. **Play** -- The host tells the plugin to start. The plugin begins playback.
5. **Interaction** -- Optional. During playback, the plugin can notify the host
   about a user interaction and optionally include a suggested `new_duration`.
6. **Finished** -- The plugin signals playback is complete (only for plugins that
   declare `can_finish: true`).
7. **Error** -- The plugin can report errors at any point in the lifecycle.

---

## Plugin API Reference

### `SignagePlugin.create(options)`

Creates and returns a plugin instance. This is the only public method on the
`SignagePlugin` global.

```js
var plugin = SignagePlugin.create({
    plugin: {
        name: 'my-plugin',
        version: '1.0.0'
    },
    capabilities: {
        requires_play_signal: true,
        can_finish: true,
        static_media: false
    },
    config_schema: { /* ... */ },
    allowed_origin: null,
    onConfig: function (data) { /* ... */ },
    onPlay: function () { /* ... */ }
});
```

#### Options

| Property | Type | Required | Default | Description |
|---|---|---|---|---|
| `plugin.name` | string | Yes | -- | Plugin name (e.g. `'youtube-player'`) |
| `plugin.version` | string | Yes | -- | Semantic version (e.g. `'1.0.0'`) |
| `capabilities.requires_play_signal` | boolean | No | `true` | Plugin waits for the host `play` message before starting |
| `capabilities.can_finish` | boolean | No | `true` | Plugin will call `finished()` when done |
| `capabilities.static_media` | boolean | No | `false` | Content does not change over time |
| `config_schema` | object | No | `{}` | JSON-Schema-like descriptor for host UI generation |
| `allowed_origin` | string | No | `null` | Restrict accepted messages to this origin |
| `onConfig` | function | No | `null` | Called when the host sends configuration |
| `onPlay` | function | No | `null` | Called when the host triggers playback |

Throws an `Error` if `plugin.name` or `plugin.version` is missing.

On creation, the SDK immediately sends a `loaded` message to the host and begins
listening for incoming `config` and `play` messages.

### `onConfig` Callback

Called when the host sends a `config` message. Receives a single argument:

```js
onConfig: function (data) {
    data.instance_id  // string - unique instance identifier
    data.config       // object - plugin-specific config matching your schema
    data.content      // object|null - optional content descriptor
                      //   { kind, source, url, mime_type }
    data.timing       // object|null - optional timing info
                      //   { scheduled_duration_ms }
}
```

Use this callback to validate configuration, load external resources, and
prepare the plugin. Call `plugin.ready()` when preparation is complete.

### `onPlay` Callback

Called when the host sends a `play` message. Takes no arguments. Start playback
here.

### Instance Methods

#### `plugin.ready()`

Signals to the host that the plugin is prepared and ready for playback. Call this
after processing configuration (e.g. after loading an external API, rendering
content, etc.).

#### `plugin.finished()`

Signals that playback is complete. Only relevant for plugins with
`can_finish: true`. Guarded against duplicate calls -- only the first call sends
a message.

#### `plugin.error(err)`

Reports an error to the host. Can be called at any point in the lifecycle.

```js
plugin.error({
    code: 'LOAD_FAILED',       // UPPER_SNAKE_CASE error code (default: 'UNKNOWN_ERROR')
    message: 'Failed to load', // Human-readable message (default: 'An unknown error occurred')
    fatal: true,               // Unrecoverable error? (default: false)
    details: { status: 404 }   // Additional context (default: {})
});
```

#### `plugin.interaction(duration)`

Reports an interaction event to the host. Pass a numeric `duration` to include a
`new_duration` value in the payload. If omitted, the SDK sends `0`.

```js
plugin.interaction();
plugin.interaction(30);
```

#### `plugin.getState()`

Returns a snapshot of the plugin's internal state:

```js
{
    configured: boolean,   // true after config received
    playing: boolean,      // true after play received
    finished: boolean,     // true after finished() called
    instanceId: string,    // instance_id from config
    config: object,        // config from host
    content: object,       // content from host
    timing: object         // timing from host
}
```

#### `plugin.on(event, handler)`

Replaces a handler after initialization. `event` must be `'config'` or
`'play'`.

```js
plugin.on('config', function (data) { /* new handler */ });
plugin.on('play', function () { /* new handler */ });
```

---

## Config Schema Format

The `config_schema` describes what configuration your plugin accepts. The host
application uses this to auto-generate a configuration UI. It follows a
JSON-Schema-like structure:

```js
config_schema: {
    type: 'object',
    properties: {
        video_id: {
            type: 'string',
            title: 'Video ID',
            description: 'The YouTube video ID to play'
        },
        mute: {
            type: 'boolean',
            title: 'Mute',
            description: 'Whether to mute audio',
            default: true
        },
        quality: {
            type: 'string',
            title: 'Quality',
            description: 'Playback quality',
            default: 'auto',
            enum: ['auto', '720p', '1080p']
        },
        advanced: {
            type: 'object',
            title: 'Advanced Settings',
            properties: {
                timeout: {
                    type: 'number',
                    title: 'Timeout',
                    default: 30
                }
            }
        }
    }
}
```

### Supported Property Attributes

| Attribute | Type | Description |
|---|---|---|
| `type` | string | `'string'`, `'number'`, `'boolean'`, or `'object'` |
| `title` | string | Short label for the host UI |
| `description` | string | Longer help text |
| `default` | any | Default value |
| `enum` | array | Constrained set of allowed values (for dropdowns) |
| `properties` | object | Nested properties (when `type` is `'object'`) |

---

## postMessage Protocol Reference

All messages conform to this envelope:

```js
{
    api: 'signage-plugin/v1',   // protocol identifier (always this value)
    type: string,               // message type
    request_id: string,         // optional correlation ID
    payload: object             // optional, type-dependent
}
```

### Plugin to Host Messages

| Type | Payload | Description |
|---|---|---|
| `loaded` | `{ plugin, capabilities, config_schema }` | Plugin initialized and ready for config |
| `ready` | none | Plugin prepared and ready for playback |
| `interaction` | `{ new_duration }` | Optional interaction event during playback |
| `finished` | none | Playback complete |
| `error` | `{ code, message, fatal, details }` | Error report |

### Host to Plugin Messages

| Type | Payload | Description |
|---|---|---|
| `config` | `{ instance_id, config, content?, timing? }` | Configuration delivery |
| `play` | none | Start playback |

---

## Example Plugins

### YouTube Player (`youtube.html`)

A video player plugin that uses the YouTube IFrame API.

**Capabilities:** Requires play signal, can finish (non-loop mode), dynamic
content.

**Configuration:**

| Property | Type | Default | Description |
|---|---|---|---|
| `video_id` | string | -- | YouTube video ID (e.g. `dQw4w9WgXcQ`) |
| `api_key` | string | -- | YouTube Data API v3 key (optional) |
| `mute` | boolean | `true` | Mute audio |
| `loop` | boolean | `true` | Loop video playback |
| `start` | number | -- | Start time in seconds |
| `end` | number | -- | End time in seconds |
| `controls` | boolean | `false` | Show player controls |

The video ID can also be provided via `content.url` using standard YouTube URL
formats (`youtu.be/ID`, `youtube.com/watch?v=ID`, `youtube.com/embed/ID`).

**Error codes:** `MISSING_VIDEO_ID`, `YT_API_LOAD_FAILED`, `YT_PLAYER_ERROR`

### Instagram Embed (`instagram.html`)

An embed plugin for Instagram posts and reels using Instagram's embed.js API.

**Capabilities:** Requires play signal, cannot finish (static content), static
media.

**Configuration:**

| Property | Type | Default | Description |
|---|---|---|---|
| `url` | string | -- | Full Instagram post or reel URL |
| `shortcode` | string | -- | Instagram shortcode (alternative to full URL) |
| `content_type` | string | `'post'` | `'post'` or `'reel'` (used with shortcode) |
| `show_caption` | boolean | `false` | Display the post caption |
| `max_width` | number | `540` | Embed max width in pixels (326-540) |

The URL can also be provided via `content.url`.

**Error codes:** `MISSING_URL`, `INVALID_URL`, `MISSING_CONTAINER`,
`EMBED_SCRIPT_LOAD_FAILED`, `EMBED_RENDER_TIMEOUT`, `EMBED_API_UNAVAILABLE`

### News Ticker (`news-ticker.html`)

A horizontally scrolling news ticker that fetches an RSS 2.0 or Atom feed and
loops the top headlines with full-height images (where available), behind a
fixed "Breaking News" arrow label pinned to the left edge. Designed for narrow,
full-width strip layouts: all sizing uses `vh` units so the ticker scales from
the iframe height alone. The loop point is marked by a double-width gap
between the last and first headline.

**Capabilities:** Requires play signal, cannot finish (loops forever), dynamic
content.

**Configuration:**

| Property | Type | Default | Description |
|---|---|---|---|
| `feed_url` | string | -- | RSS 2.0 or Atom feed URL (required) |
| `max_items` | number | `10` | Number of top headlines to scroll |
| `scroll_speed` | number | `1.5` | Scroll speed in strip-heights per second |
| `show_images` | boolean | `true` | Show article images where available |
| `label_text` | string | `'Breaking News'` | Fixed label on the left edge (empty string hides it) |
| `label_color` | string | `'#eb0d41'` | CSS background colour of the label and arrow |

The feed URL can also be provided via `content.url`.

The feed is re-fetched using the response `Cache-Control: max-age` / `Expires`
headers (both CORS-safelisted) as the refresh interval, falling back to the
RSS `<ttl>` element, then a 5 minute default (clamped to 60s-24h). Failed
refreshes keep the current headlines on screen and retry after 60 seconds.

Config may be re-pushed to a running ticker at any time (live preview): the
current headlines keep scrolling while the newly configured feed loads and
are crossfaded in once it arrives, each successful (re)configuration is
answered with `ready`, stale in-flight fetches from a superseded config are
discarded, and an invalid re-config (e.g. missing `feed_url`) is reported
as a non-fatal error while the current content continues. `MISSING_FEED_URL`
is only fatal when nothing has been displayed yet.

The feed is fetched directly from the browser first (optimal: no proxy hop,
and the browser's own User-Agent satisfies feed CDNs that block programmatic
clients); if the direct request fails - no CORS headers on the feed, or the
request is blocked - it falls back to the host's relative proxy route
(`/api/engine/v2/proxy?url=` + the URL-encoded feed URL). Whichever
transport succeeds is remembered per feed URL in `localStorage` and tried
first on subsequent fetches, and forgotten again if it stops working.

**Error codes:** `MISSING_FEED_URL`, `FEED_LOAD_FAILED`, `FEED_REFRESH_FAILED`

---

### Rain Overlay (`rain/rain.html`)

A fullscreen, fully transparent overlay that renders rain drops on glass with
WebGL, adapted from [Codrops' RainEffect](https://github.com/codrops/RainEffect).
Position the iframe above other content; pixels without drops are output with
alpha 0 so the page below shows through, and each drop refracts the actual
page rendered underneath it.

The base page is mirrored into the refraction texture one of two ways:

- **Display capture** (real time): `getDisplayMedia` tab self-capture gives a
  live compositor feed of the base page - video, CSS animations, WebGL,
  everything - at full frame rate. The browser must grant tab capture: kiosk
  deployments should set the `ScreenCaptureWithoutGestureAllowedForOrigins`
  enterprise policy (or launch Chrome with `--auto-accept-this-tab-capture`)
  so no prompt or user gesture is needed. The captured feed includes the
  overlay itself; the second-order "drops refracting drops" effect is not
  noticeable in practice.
- **DOM mirroring** (fallback, no permissions): the **same-origin** parent DOM
  is rendered to a staging canvas - a periodic SVG `foreignObject` snapshot
  for static content (same-origin images inlined, page stylesheets embedded),
  plus per-frame copies of live `<video>` and `<canvas>` elements. CSS
  animations and other animated DOM only update at the snapshot interval.

When neither works (cross-origin parent, standalone testing) the drops
refract a flat fallback colour instead.

The host should embed the iframe with `allowtransparency`,
`allow="display-capture"` and `pointer-events: none` so clicks pass through
to the page underneath.

**Capabilities:** Requires play signal, cannot finish (runs forever), dynamic
content.

**Configuration:**

| Property | Type | Default | Description |
|---|---|---|---|
| `intensity` | number | `0.5` | Rain heaviness, `0` (light drizzle) to `1` (downpour) |
| `capture_mode` | string | `'auto'` | `'display'` (real-time tab capture), `'dom'` (DOM mirroring), or `'auto'` (try display, fall back to dom) |
| `snapshot_interval` | number | `10` | Seconds between DOM re-captures in dom mode (live video/canvas mirror every frame; min 0.25) |
| `background_selector` | string | -- | CSS selector for the parent element to mirror in dom mode (defaults to the page body) |
| `fallback_color` | string | `'#1b2531'` | Colour refracted when the base page cannot be captured |

In dom mode, cross-origin images, videos and stylesheets in the base page are
skipped rather than allowed to taint the mirror canvas; if a cross-origin
source does taint it, page capture is disabled (non-fatal
`PARENT_CAPTURE_TAINTED`) and the drops fall back to refracting the page
colour. If display capture is requested but not granted, the plugin reports a
non-fatal `DISPLAY_CAPTURE_FAILED` and continues with DOM mirroring, retrying
capture on the next user interaction.

**Error codes:** `WEBGL_UNAVAILABLE`, `TEXTURE_LOAD_FAILED`,
`PARENT_CAPTURE_UNAVAILABLE`, `PARENT_CAPTURE_TAINTED`,
`DISPLAY_CAPTURE_FAILED`

---

### Halloween Overlay (`halloween/halloween.html`)

A fullscreen, fully transparent overlay of animated CSS-art Halloween
decorations, designed to sit in an iframe above other signage content:

- A **spider** dangling from a silk thread in the top right corner, bobbing
  up and down with wriggling legs.
- A **jack-o'-lantern** in the bottom left corner whose carved eyes, nose and
  mouth glow and cycle through colours (a hue-rotate/brightness animation).
- A **witch** on a broomstick that flies across the screen at a configurable
  interval (default every 15 seconds), each time at a random height within
  the middle 50% of the screen.

Each decoration is authored at a fixed pixel size and scaled from the
**larger** viewport dimension (vmax), so element sizes stay proportional to
the screen in both landscape and portrait orientations. All animation is
paused until the host sends `play`.

The host should embed the iframe with `allowtransparency` and
`pointer-events: none` so clicks pass through to the page underneath.

**Capabilities:** Requires play signal, cannot finish (runs forever), dynamic
content.

**Configuration:**

| Property | Type | Default | Description |
|---|---|---|---|
| `scale` | number | `1` | Overall size multiplier for all decorations (0.25 - 3) |
| `witch_interval` | number | `15` | Seconds between witch fly-bys (5 - 3600) |
| `witch_duration` | number | `4` | Seconds the witch takes to cross the screen (2 - 60) |
| `show_spider` | boolean | `true` | Display the spider in the top right corner |
| `show_pumpkin` | boolean | `true` | Display the jack-o'-lantern in the bottom left corner |
| `show_witch` | boolean | `true` | Display the flying witch |

If `witch_duration` is longer than `witch_interval`, in-progress fly-bys are
never interrupted; the next launch simply waits for the following interval.

**Error codes:** `MISSING_ELEMENT`

---

### Christmas Overlay (`christmas/christmas.html`)

A fullscreen, fully transparent winter overlay designed to sit in an iframe
above other signage content:

- **Falling snow** rendered on a canvas - soft glowing flakes with randomised
  size, speed, sway and opacity - that **accumulates into a ground drift**
  along the bottom of the screen. The drift's build-up rate is tied to the
  plow interval so it approaches its maximum height over roughly one plow
  cycle.
- A **snow plow** (CSS art truck with a rear dump bed, spinning wheels and a
  front blade) that drives across the bottom of the screen at a configurable
  interval (default every 30 seconds, taking 5 seconds). Its blade collects
  the drift as it passes - a pushed pile grows in front of the blade and the
  hopper visibly fills with snow - leaving cleared ground behind it for the
  snow to build up again.
- **Santa's sleigh** (CSS art with animated reindeer, harness and sparkle
  trail) that flies across the screen at a configurable interval, each time
  at a random height within the middle 50% of the screen - exactly like the
  Halloween witch.

The plow and santa are scaled from the **larger** viewport dimension (vmax)
so sizes stay proportional in both orientations. All animation is paused
until the host sends `play`.

The host should embed the iframe with `allowtransparency` and
`pointer-events: none` so clicks pass through to the page underneath.

**Capabilities:** Requires play signal, cannot finish (runs forever), dynamic
content.

**Configuration:**

| Property | Type | Default | Description |
|---|---|---|---|
| `scale` | number | `1` | Overall size multiplier for the plow and santa (0.25 - 3) |
| `snow_intensity` | number | `0.5` | Snowfall heaviness, `0` (none) to `1` (blizzard) |
| `drift_height` | number | `4` | Maximum drift accumulation above the base, as % of screen height (2 - 30) |
| `snow_base` | number | `0` | Permanent snow layer as % of screen height; the plow sits on top of it and never clears it (0 - 20) |
| `plow_interval` | number | `30` | Seconds between plow runs (5 - 3600) |
| `plow_duration` | number | `5` | Seconds the plow takes to cross the screen (2 - 60) |
| `santa_interval` | number | `15` | Seconds between santa fly-bys (5 - 3600) |
| `santa_duration` | number | `4` | Seconds santa takes to cross the screen (2 - 60) |
| `show_plow` | boolean | `true` | Periodically clear the drift with the plow |
| `show_santa` | boolean | `true` | Display santa flying across the screen |

The first plow run happens one full interval after `play` so the drift has
time to build. In-progress runs and fly-bys are never interrupted, and the
plow and santa are never on screen at the same time: if one is due while the
other is crossing, it is queued and starts as soon as the current crossing
completes.

**Error codes:** `MISSING_ELEMENT`, `CANVAS_UNAVAILABLE`

---

### Easter Overlay (`easter/easter.html`)

A fullscreen, fully transparent overlay where, at a configurable interval, a
runner crosses the bottom of the screen - randomly chosen between a
**hopping bunny** and a **rolling easter egg** with two styles (pastel
stripes or pink with white dots, picked 50/50). Only one runner is on screen
at a time. The bunny is a 19-frame sprite sheet extracted from a supplied
GIF - background keyed to alpha, baked shadow replaced with a CSS ground
shadow, frames re-registered on the body, then vector-traced to an SVG
sheet so the edges stay crisp at any display size - driven by a `steps()`
animation
phase-locked with a gait layer that holds it still on the ground between
jumps (the forward motion happens mid-leap), with soft drop-shadow shading
so the flat white sprite stays visible over white content. The eggs are CSS
art adapted from a community CodePen example and spin at a rate matched to
the crossing speed - with a bob that keeps the shell in contact with the
ground - so they read as rolling rather than sliding.

The runners are scaled from the **larger** viewport dimension (vmax) so
sizes stay proportional in both orientations. All animation is paused until
the host sends `play`; the first crossing happens immediately on `play`.

The host should embed the iframe with `allowtransparency` and
`pointer-events: none` so clicks pass through to the page underneath.

**Capabilities:** Requires play signal, cannot finish (runs forever), dynamic
content.

**Configuration:**

| Property | Type | Default | Description |
|---|---|---|---|
| `scale` | number | `1` | Overall size multiplier for the bunny and eggs (0.25 - 3) |
| `run_interval` | number | `20` | Seconds between crossings (5 - 3600) |
| `run_duration` | number | `6` | Seconds a crossing takes (2 - 60) |
| `bunny_chance` | number | `0.5` | Probability a crossing is the bunny rather than an egg, `0` - `1` |

**Error codes:** `MISSING_ELEMENT`

---

## Building a New Plugin

### Minimal Template

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My Plugin</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
        #error-overlay {
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.85);
            color: #ff4444;
            font-family: monospace;
            font-size: 16px;
            justify-content: center;
            align-items: center;
            text-align: center;
            padding: 20px;
            z-index: 9999;
        }
    </style>
</head>
<body>
    <!-- Your plugin content here -->
    <div id="content"></div>
    <div id="error-overlay"></div>

    <script src="plugin.js"></script>
    <script>
    (function () {
        'use strict';

        // ---------------------------------------------------------------
        // Config schema -- describes what the host UI should show
        // ---------------------------------------------------------------
        var CONFIG_SCHEMA = {
            type: 'object',
            properties: {
                message: {
                    type: 'string',
                    title: 'Message',
                    description: 'Text to display',
                    default: 'Hello, World!'
                },
                duration_ms: {
                    type: 'number',
                    title: 'Duration (ms)',
                    description: 'How long to display before finishing',
                    default: 5000
                }
            }
        };

        // ---------------------------------------------------------------
        // Error overlay
        // ---------------------------------------------------------------
        function showError(msg) {
            var overlay = document.getElementById('error-overlay');
            if (overlay) {
                overlay.textContent = msg;
                overlay.style.display = 'flex';
            }
        }

        // ---------------------------------------------------------------
        // Plugin state
        // ---------------------------------------------------------------
        var config = null;
        var pendingPlay = false;

        // ---------------------------------------------------------------
        // Create plugin instance
        // ---------------------------------------------------------------
        var plugin = SignagePlugin.create({
            plugin: { name: 'my-plugin', version: '1.0.0' },
            capabilities: {
                requires_play_signal: true,
                can_finish: true,
                static_media: false
            },
            config_schema: CONFIG_SCHEMA,

            onConfig: function (data) {
                config = data.config || {};

                // Validate required fields
                var message = config.message || 'Hello, World!';
                document.getElementById('content').textContent = message;

                plugin.ready();

                if (pendingPlay) {
                    pendingPlay = false;
                    startPlayback();
                }
            },

            onPlay: function () {
                if (!config) {
                    pendingPlay = true;
                    return;
                }
                startPlayback();
            }
        });

        function startPlayback() {
            var duration = config.duration_ms !== undefined
                ? config.duration_ms
                : 5000;

            setTimeout(function () {
                plugin.finished();
            }, duration);
        }
    })();
    </script>
</body>
</html>
```

### Checklist

When building a new plugin, ensure you:

1. **Single HTML file** -- The plugin must be entirely self-contained.
2. **Include the SDK** -- Add `<script src="plugin.js"></script>` before your
   inline script.
3. **Full-viewport layout** -- Use `width: 100%; height: 100%; overflow: hidden`
   with a `background: #000`.
4. **IIFE with strict mode** -- Wrap all code in
   `(function () { 'use strict'; ... })();`
5. **Define a CONFIG_SCHEMA** -- Describe your configuration for the host UI.
6. **Call `SignagePlugin.create()`** -- Provide `plugin` metadata,
   `capabilities`, `config_schema`, `onConfig`, and `onPlay` handlers.
7. **Call `plugin.ready()`** -- After processing config and preparing content.
8. **Call `plugin.finished()`** -- When playback ends (if `can_finish: true`).
9. **Call `plugin.error()`** -- On any failure, with a descriptive
   UPPER_SNAKE_CASE `code`, a human-readable `message`, and `fatal: true/false`.
10. **Add an error overlay** -- Include a `#error-overlay` element and a
    `showError(msg)` helper function for visual error display.
11. **Handle race conditions** -- Use a `pendingPlay` flag if your plugin loads
    external APIs asynchronously (the host may send `play` before your API is
    ready).
12. **Clean up on re-config** -- If the host sends a new config, destroy
    existing resources before re-initializing.

### Code Style

- **ES5 only** -- Use `var`, not `let`/`const`. No arrow functions, template
  literals, destructuring, or classes.
- **IIFE module pattern** -- No ES modules, CommonJS, or AMD.
- **Naming:** camelCase for JS variables/functions, UPPER_SNAKE_CASE for
  constants and error codes, snake_case for protocol/data properties, kebab-case
  for HTML IDs.
- **Formatting:** Single quotes, 4-space indentation, semicolons required
  (configured via `.prettierrc`).

---

## Validating Plugins

The repository includes a built-in protocol compliance validator
(`validator.html`) that simulates a host application and checks your plugin
against the `signage-plugin/v1` protocol.

### Running the Validator

1. Start a local server from the repository root:

   ```bash
   python3 -m http.server 8080
   ```

2. Open `http://localhost:8080/validator.html` in your browser.

3. Enter your plugin URL in the input field (e.g. `my-plugin.html`).

4. Walk through the lifecycle:

   - **Load** -- Click to load your plugin in a sandboxed iframe. The validator
     waits up to 5 seconds for a `loaded` message.
   - **Send Config** -- Opens a JSON editor pre-populated with defaults from
     your `config_schema`. Edit the values and click Send. The validator waits up
     to 30 seconds for a `ready` message.
   - **Send Play** -- Sends a `play` message to trigger playback.
   - **Reset** -- Removes the iframe and clears state for a fresh test.

### What the Validator Checks

The validation log uses color-coded entries:

| Tag | Meaning |
|---|---|
| `[PASS]` | Check passed (green) |
| `[FAIL]` | Check failed (red) |
| `[WARN]` | Warning or unusual behavior (orange) |
| `[INFO]` | Informational (blue) |
| `[RECV]` | Message received from plugin (purple) |
| `[SEND]` | Message sent to plugin (cyan) |

**Protocol envelope checks:**
- `api` field equals `'signage-plugin/v1'`
- `type` is a valid plugin message type (`loaded`, `ready`, `finished`, `error`)

The SDK also supports an `interaction` plugin message. The current validator does
not yet recognize it, so interactive plugins may log a validator failure if they
emit `interaction` during testing.

**Loaded message checks:**
- Payload is present
- `plugin.name` and `plugin.version` are non-empty strings
- `capabilities` object is present with boolean values for
  `requires_play_signal`, `can_finish`, and `static_media`
- `config_schema` is present

**Lifecycle checks:**
- `ready` arrives after `config` was sent (warns if before)
- `finished` is not sent by plugins that declared `can_finish: false`
- `finished` is not sent more than once
- `play` is not sent before `ready` was received

**Error message checks:**
- `code` is a non-empty UPPER_SNAKE_CASE string
- `message` is a non-empty string
- `fatal` is a boolean
- `details` is an object (if present)

**Timeout checks:**
- Plugin must send `loaded` within 5 seconds of iframe creation
- Plugin must send `ready` within 30 seconds of receiving config

A summary bar at the bottom of the log shows the total count of passed, failed,
and warning checks.

---

## Formatting

Prettier is configured via `.prettierrc` (single quotes, 4-space indent). Format
files with:

```bash
prettier --write .          # format all files
prettier --check .          # check formatting (CI-friendly)
prettier --write my-plugin.html   # format a single file
```

---

## License

See the LICENSE file for details.
