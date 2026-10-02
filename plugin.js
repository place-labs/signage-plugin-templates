/*

const API_VERSION = 'signage-plugin/v1';

export type SignagePluginMessageType =
    | 'loaded'
    | 'ready'
    | 'playing'
    | 'interaction'
    | 'finished'
    | 'error';
export type SignageHostMessageType = 'config' | 'play';

export type SignageMessage<T = unknown> = {
    api: 'signage-plugin/v1';
    type: SignagePluginMessageType | SignageHostMessageType;
    request_id?: string;
    payload?: T;
};

export type PluginLoadedPayload = {
    plugin: {
        name: string;
        version: string;
        type: 'plugin' | 'widget';
    };
    capabilities: {
        requires_play_signal: boolean;
        can_finish: boolean;
        static_media: boolean;
        can_report_playing?: boolean;
    };
    config_schema: Record<string, unknown>;
};

export type PluginConfigPayload = {
    instance_id: string;
    config: Record<string, unknown>;
    content?: {
        kind?: string;
        source?: string;
        url?: string;
        mime_type?: string;
    };
    timing?: {
        scheduled_duration_ms?: number;
    };
};

export type PluginInteractionPayload = {
    new_duration?: number;
};

export type PluginErrorPayload = {
    code: string;
    message: string;
    fatal?: boolean;
    details?: Record<string, unknown>;
};

 */

/**
 * Signage Plugin SDK
 *
 * Implements the signage-plugin/v1 messaging protocol.
 * Plugins communicate with the host via window.postMessage.
 *
 * Lifecycle:
 *   1. Plugin loads and calls SignagePlugin.create() -> sends 'loaded' to host
 *   2. Host sends 'config' with instance config, content, and timing
 *   3. Plugin prepares itself, then calls plugin.ready() -> sends 'ready' to host
 *   4. Host sends 'play' to begin playback
 *   5. Opt-in plugins call plugin.afterPaint(playRequest) when content is visible
 *   6. Plugin calls plugin.finished() when done -> sends 'finished' to host
 *   7. Plugin calls plugin.error() on failure -> sends 'error' to host
 */
var SignagePlugin = (function () {
    'use strict';

    var API_VERSION = 'signage-plugin/v1';
    var PLUGIN_TYPES = ['plugin', 'widget'];

    var _isEmbedded = window.parent && window.parent !== window;

    /**
     * Send a message to the host (parent window).
     */
    function _postToHost(type, payload, requestId) {
        var message = {
            api: API_VERSION,
            type: type,
        };
        if (payload !== undefined) {
            message.payload = payload;
        }
        if (requestId !== undefined) {
            message.request_id = requestId;
        }

        if (_isEmbedded) {
            window.parent.postMessage(message, '*');
        } else {
            console.warn(
                '[SignagePlugin] Not embedded in an iframe — message "' +
                    type +
                    '" was not sent. Embed this page in a host to enable messaging.',
            );
        }
    }

    /**
     * Validate that an incoming message conforms to the protocol.
     */
    function _isValidHostMessage(data, event, allowedOrigin) {
        if (
            !data ||
            typeof data !== 'object' ||
            data.api !== API_VERSION ||
            (data.type !== 'config' && data.type !== 'play')
        ) {
            return false;
        }

        if (event.source !== window.parent) {
            return false;
        }

        // Validate origin if an allowed origin has been configured
        if (allowedOrigin && event && event.origin !== allowedOrigin) {
            console.warn(
                '[SignagePlugin] Rejected message from untrusted origin: ' +
                    event.origin,
            );
            return false;
        }

        return true;
    }

    /**
     * Create a new signage plugin instance.
     *
     * @param {object} options
     * @param {object} options.plugin            - Plugin metadata
     * @param {string} options.plugin.name       - Plugin name
     * @param {string} options.plugin.version    - Plugin version
     * @param {string} [options.plugin.type]     - 'plugin' (default) or 'widget'
     * @param {object} options.capabilities      - Plugin capabilities
     * @param {boolean} [options.capabilities.requires_play_signal=true]
     * @param {boolean} [options.capabilities.can_finish=true]
     * @param {boolean} [options.capabilities.static_media=false]
     * @param {boolean} [options.capabilities.can_report_playing=false]
     * @param {object} [options.config_schema]   - JSON-schema-like config descriptor
     * @param {string} [options.allowed_origin]   - Restrict messages to this origin (e.g. 'https://example.com')
     * @param {function} [options.onConfig]      - Called when host sends config
     * @param {function} [options.onPlay]        - Called when host sends play signal
     * @returns {object} plugin instance
     */
    function create(options) {
        if (
            !options ||
            !options.plugin ||
            !options.plugin.name ||
            !options.plugin.version
        ) {
            throw new Error(
                'SignagePlugin.create requires options.plugin.name and options.plugin.version',
            );
        }

        var pluginType =
            options.plugin.type !== undefined ? options.plugin.type : 'plugin';
        if (PLUGIN_TYPES.indexOf(pluginType) === -1) {
            throw new Error(
                'SignagePlugin.create options.plugin.type must be one of: ' +
                    PLUGIN_TYPES.join(', '),
            );
        }

        var capabilities = options.capabilities || {};
        var allowedOrigin = options.allowed_origin || null;
        var currentPlay = null;
        var paintReported = false;
        var state = {
            configured: false,
            playing: false,
            finished: false,
            config: null,
            content: null,
            timing: null,
            instanceId: null,
        };

        var handlers = {
            onConfig: options.onConfig || null,
            onPlay: options.onPlay || null,
        };

        // Listen for messages from the host
        window.addEventListener('message', function (event) {
            var data = event.data;
            if (!_isValidHostMessage(data, event, allowedOrigin)) {
                return;
            }

            if (data.type === 'config') {
                currentPlay = null;
                state.playing = false;
                state.finished = false;
                var payload = data.payload || {};
                state.configured = true;
                state.instanceId = payload.instance_id || null;
                state.config = payload.config || {};
                state.content = payload.content || null;
                state.timing = payload.timing || null;

                if (handlers.onConfig) {
                    handlers.onConfig({
                        instance_id: state.instanceId,
                        config: state.config,
                        content: state.content,
                        timing: state.timing,
                    });
                }
            }

            if (data.type === 'play') {
                currentPlay = { request_id: data.request_id };
                paintReported = false;
                state.playing = true;
                state.finished = false;
                if (handlers.onPlay) {
                    handlers.onPlay(currentPlay);
                }
            }
        });

        var instance = {
            /**
             * Signal to the host that the plugin is ready to play.
             */
            ready: function () {
                _postToHost('ready');
            },

            /**
             * Confirm visible playback for the captured onPlay request.
             * Use this only after the template has confirmed a painted frame.
             */
            playing: function (playRequest) {
                if (
                    playRequest &&
                    playRequest === currentPlay &&
                    state.playing &&
                    !paintReported
                ) {
                    paintReported = true;
                    _postToHost('playing', undefined, playRequest.request_id);
                }
            },

            /**
             * Allow a paint after content is ready, then confirm this request.
             * Two frames put a paint between the callbacks. Stale requests
             * cannot confirm a later config or play.
             */
            afterPaint: function (playRequest) {
                if (!playRequest || playRequest !== currentPlay) return;
                window.requestAnimationFrame(function () {
                    if (playRequest !== currentPlay) return;
                    window.requestAnimationFrame(function () {
                        instance.playing(playRequest);
                    });
                });
            },

            /**
             * Signal to the host that playback has finished.
             */
            finished: function () {
                if (!state.finished) {
                    state.finished = true;
                    state.playing = false;
                    currentPlay = null;
                    _postToHost('finished');
                }
            },

            /**
             * Report an error to the host.
             *
             * @param {object} err
             * @param {string} err.code
             * @param {string} err.message
             * @param {boolean} [err.fatal=false]
             * @param {object} [err.details]
             */
            error: function (err) {
                err = err || {};
                if (err.fatal) {
                    currentPlay = null;
                    state.playing = false;
                }
                _postToHost('error', {
                    code: err.code || 'UNKNOWN_ERROR',
                    message: err.message || 'An unknown error occurred',
                    fatal: err.fatal !== undefined ? err.fatal : false,
                    details: err.details || {},
                });
            },

            /**
             * Get current plugin state (for debugging).
             */
            getState: function () {
                return {
                    configured: state.configured,
                    playing: state.playing,
                    finished: state.finished,
                    instanceId: state.instanceId,
                    config: state.config,
                    content: state.content,
                    timing: state.timing,
                };
            },

            /**
             * Post an interaction event to host
             */
            interaction: function (duration) {
                _postToHost('interaction', {
                    new_duration: duration === undefined ? 0 : duration,
                });
            },

            /**
             * Update event handlers after creation.
             *
             * @param {string} event - 'config' or 'play'
             * @param {function} handler
             */
            on: function (event, handler) {
                if (event === 'config') {
                    handlers.onConfig = handler;
                } else if (event === 'play') {
                    handlers.onPlay = handler;
                }
            },
        };

        // Send 'loaded' message to host immediately
        _postToHost('loaded', {
            plugin: {
                name: options.plugin.name,
                version: options.plugin.version,
                type: pluginType,
            },
            capabilities: {
                requires_play_signal:
                    capabilities.requires_play_signal !== undefined
                        ? capabilities.requires_play_signal
                        : true,
                can_finish:
                    capabilities.can_finish !== undefined
                        ? capabilities.can_finish
                        : true,
                static_media:
                    capabilities.static_media !== undefined
                        ? capabilities.static_media
                        : false,
                can_report_playing: capabilities.can_report_playing === true,
            },
            config_schema: options.config_schema || {},
        });

        return instance;
    }

    return {
        create: create,
    };
})();
