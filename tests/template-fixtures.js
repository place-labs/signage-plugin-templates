/** Local API fixtures. No requests are sent to YouTube, Instagram, or RSS services. */
(function () {
    'use strict';
    var fixture = { players: [], requests: [], embedLoads: [] };
    window.templateFixture = fixture;
    fixture.frames = [];
    window.requestAnimationFrame = function (callback) {
        fixture.frames.push(callback);
        return fixture.frames.length;
    };
    window.cancelAnimationFrame = function () {};
    fixture.tick = function () {
        var callbacks = fixture.frames.splice(0);
        callbacks.forEach(function (callback) {
            callback(performance.now());
        });
    };
    var append = document.head.appendChild;
    document.head.appendChild = function (element) {
        if (element.src === 'https://www.youtube.com/iframe_api') {
            window.YT = {
                PlayerState: { PLAYING: 1, ENDED: 0 },
                Player: function (id, options) {
                    var player = this;
                    player.state = -1;
                    player.playCalls = 0;
                    player.mute = function () {};
                    player.destroy = function () {};
                    player.getPlayerState = function () {
                        return player.state;
                    };
                    player.playVideo = function () {
                        player.playCalls++;
                    };
                    player.emit = function (state) {
                        player.state = state;
                        options.events.onStateChange({
                            target: player,
                            data: state,
                        });
                    };
                    fixture.players.push(player);
                    setTimeout(function () {
                        options.events.onReady({ target: player });
                    }, 0);
                },
            };
            fixture.releaseApi = window.onYouTubeIframeAPIReady;
            if (!window.parent.holdTemplateApi) {
                setTimeout(fixture.releaseApi, 0);
            }
            return element;
        }
        if (element.src === 'https://www.instagram.com/embed.js') {
            window.instgrm = {
                Embeds: {
                    process: function () {
                        var frame = document.createElement('iframe');
                        frame.title = 'Local Instagram fixture';
                        // Control the template's load listener separately from about:blank.
                        frame.addEventListener = function (type, callback) {
                            if (type === 'load')
                                fixture.embedLoads.push({
                                    frame: frame,
                                    callback: callback,
                                    active: true,
                                });
                        };
                        frame.removeEventListener = function (type, callback) {
                            fixture.embedLoads.forEach(function (entry) {
                                if (entry.callback === callback)
                                    entry.active = false;
                            });
                        };
                        frame.src = 'about:blank';
                        document
                            .getElementById('embed-container')
                            .appendChild(frame);
                    },
                },
            };
            fixture.releaseApi = element.onload;
            if (!window.parent.holdTemplateApi) {
                setTimeout(fixture.releaseApi, 0);
            }
            return element;
        }
        return append.call(document.head, element);
    };
    window.XMLHttpRequest = function () {
        var xhr = this;
        xhr.open = function (method, url) {
            xhr.url = url;
        };
        xhr.send = function () {
            fixture.requests.push(xhr);
        };
        xhr.getResponseHeader = function () {
            return null;
        };
        xhr.respond = function (title) {
            xhr.status = 200;
            xhr.readyState = 4;
            xhr.responseText =
                '<rss><channel><item><title>' +
                title +
                '</title></item></channel></rss>';
            if (xhr.onload) xhr.onload();
            if (xhr.onreadystatechange) xhr.onreadystatechange();
        };
    };
})();
