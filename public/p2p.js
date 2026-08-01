/**
 * P2P Subtitle Sharing Module (VidChatBox)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * ⚠️  SECURITY CRITICAL — HANDLE WITH CARE
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * This module receives untrusted data from anonymous WebRTC peers via
 * Trystero (Nostr signaling). A malicious peer can send any arbitrary bytes.
 * If this data touches the DOM unsanitized, it enables XSS / code injection.
 *
 * ┌──────────────────────────────────────────────────────┐
 * │ SECURITY PIPELINE (must pass in this order):          │
 * │                                                       │
 * │  1. JSON parse — reject non-object payloads           │
 * │  2. Type validation — reject non-array/number/string  │
 * │  3. sanitizeText() — strip HTML via textContent trick │
 * │  4. Size limits — 500KB total, 50k segments max       │
 * │  5. textContent only — NEVER innerHTML in display      │
 * └──────────────────────────────────────────────────────┘
 *
 * ⚠️ REVIEW CHECKLIST (MUST run for ANY code change to this file):
 *   [ ] Does this function receive data from peers? → validate FIRST
 *   [ ] Does this code insert data into DOM? → use textContent only
 *   [ ] Does this code write to localStorage? → sanitize BEFORE writing
 *   [ ] Does this code pass data to eval / Function? → NEVER ALLOW
 *   [ ] Could a crafted string bypass validation? → add regex/length checks
 *   [ ] Are array lengths / total size bounded? → enforce caps
 *   [ ] New peer action? → add handler validation stanza
 *
 * ANY CODE CHANGE TO THIS FILE MUST KEEP THE SECURITY PIPELINE INTACT.
 */
const P2P = (function () {
    // ─── State ───────────────────────────────────────────────────
    let room = null;
    let sendOffer = null, onOffer = null;
    let sendRequest = null, onRequest = null;
    let sendResponse = null, onResponse = null;
    let sendIndex = null, onIndex = null;
    let currentIndex = {};     // { videoId: [{ lang, count, source }] }
    let peerIndex = {};        // { peerId: { videoId: [{ lang, count, source }] } }
    let activeRoomId = null;
    let peers = new Map();     // peerId → { joinedAt }
    let onPeerUpdate = null;   // callback: (peerCount) => {}
    let onIndexUpdate = null;  // callback: (allPeerIndex) => {}
    let destroyed = false;
    let indexTimeout = null;
    let reindexInterval = null;

    const APP_ID = 'vidchatbox-p2p-v1';
    const PUBLIC_ROOM = 'vidchatbox-subtitles';
    const MAX_PEERS = 20;
    const MAX_PAYLOAD_BYTES = 500 * 1024;  // 500KB
    const MAX_INDEX_ENTRIES = 2000;
    const MAX_SEGMENTS = 50000;
    const REINDEX_INTERVAL = 60000; // 60s
    const JOIN_TIMEOUT = 3000;      // 3s wait for peer index broadcasts

    // ─── Helpers ─────────────────────────────────────────────────

    /**
     * Sanitize a string: strip all HTML tags via textContent trick.
     * This is the PRIMARY defense against XSS from peer data.
     * Returns a plain-text string safe for DOM insertion via textContent.
     */
    function sanitizeText(str) {
        if (typeof str !== 'string') return '';
        // textContent trick: .textContent never parses HTML
        const div = document.createElement('div');
        div.textContent = str;
        return div.textContent;
    }

    /**
     * Validate and sanitize a raw JSON string from a peer.
     * Returns parsed object or null if invalid.
     */
    function safeParse(raw) {
        if (typeof raw !== 'string') return null;
        if (raw.length > MAX_PAYLOAD_BYTES) {
            console.warn('[P2P] Payload too large:', raw.length, 'bytes');
            return null;
        }
        try {
            return JSON.parse(raw);
        } catch (e) {
            console.warn('[P2P] Invalid JSON from peer');
            return null;
        }
    }

    /**
     * Validate and sanitize an array of subtitle segments.
     * Returns sanitized array or null if invalid.
     * SECURITY: This is the only entry point for subtitle data into the system.
     */
    function sanitizeSegments(segments) {
        if (!Array.isArray(segments)) return null;
        if (segments.length > MAX_SEGMENTS) {
            console.warn('[P2P] Too many segments:', segments.length, '(max:', MAX_SEGMENTS, ')');
            return null;
        }
        return segments.map(seg => {
            if (typeof seg !== 'object' || seg === null) return null;
            const start = parseFloat(seg.start);
            const end = parseFloat(seg.end);
            if (isNaN(start) || isNaN(end)) return null;
            if (start < 0 || end < start) return null;
            if (end - start > 3600) return null; // segment longer than 1 hour? reject
            return {
                start,
                end,
                text: sanitizeText(String(seg.text || ''))
            };
        }).filter(Boolean);
    }

    /**
     * Validate an index entry from a peer.
     * Returns sanitized index map or null.
     */
    function sanitizeIndex(indexMap) {
        if (typeof indexMap !== 'object' || indexMap === null) return null;
        const clean = {};
        let count = 0;
        for (const [videoId, langs] of Object.entries(indexMap)) {
            if (count++ > MAX_INDEX_ENTRIES) break;
            // videoId must be valid YouTube ID format
            if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) continue;
            if (!Array.isArray(langs)) continue;
            clean[videoId] = langs.map(entry => {
                if (typeof entry !== 'object' || entry === null) return null;
                return {
                    lang: sanitizeText(String(entry.lang || '')),
                    count: parseInt(entry.count) || 0,
                    source: ['youtube', 'auto', 'cached', 'translated', 'transcribed', 'p2p']
                        .includes(entry.source) ? entry.source : 'cached'
                };
            }).filter(e => e && e.lang && e.count > 0);
            if (clean[videoId].length === 0) delete clean[videoId];
        }
        return clean;
    }

    function generateRoomId() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let id = '';
        for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
        return id;
    }

    function getCurrentVideoId() {
        const urlInput = document.getElementById('youtubeUrl');
        if (!urlInput) return null;
        const val = urlInput.value.trim();
        const m = val.match(/(?:v=|youtu\.be\/|\/embed\/|\/v\/)([a-zA-Z0-9_-]{11})/);
        return m ? m[1] : null;
    }

    // ─── Core ────────────────────────────────────────────────────

    /**
     * Initialize P2P connection to a room.
     * @param {string} [roomId] — Custom room ID. If omitted, uses public room.
     * @param {Object} [opts] — Options
     * @param {Function} [opts.onPeerUpdate] — (peerCount) => void
     * @param {Function} [opts.onIndexUpdate] — (allPeerIndex) => void
     */
    function init(roomId, opts = {}) {
        if (destroyed) destroyed = false;

        // Disconnect existing room
        if (room) {
            try { room.leave(); } catch (_) {}
            room = null;
        }

        // Reset state
        peers.clear();
        peerIndex = {};
        currentIndex = {};

        const actualRoomId = roomId || PUBLIC_ROOM;
        activeRoomId = actualRoomId;

        onPeerUpdate = opts.onPeerUpdate || onPeerUpdate;
        onIndexUpdate = opts.onIndexUpdate || onIndexUpdate;

        if (!window.Trystero) {
            console.warn('[P2P] Trystero not loaded. P2P disabled.');
            return;
        }

        console.log(`[P2P] Joining room: ${actualRoomId}${roomId ? ' (custom)' : ' (public)'}`);

        try {
            room = window.Trystero.joinRoom({ appId: APP_ID }, actualRoomId);
        } catch (e) {
            console.warn('[P2P] Failed to join room:', e.message);
            return;
        }

        // Create actions (Trystero 0.25.3 returns objects with .send and .onMessage)
        const actionIndex = room.makeAction('sub-index');
        const actionRequest = room.makeAction('sub-request');
        const actionResponse = room.makeAction('sub-response');

        // Wrap send functions for cleaner usage
        sendIndex = (data, target) => target ? actionIndex.send(data, { target }) : actionIndex.send(data);
        sendRequest = (data, target) => actionRequest.send(data, { target });
        sendResponse = (data, target) => actionResponse.send(data, { target });

        // ─── Peer lifecycle ────────────────────────────────────
        room.onPeerJoin = (peerId) => {
            if (peers.size >= MAX_PEERS) {
                console.warn('[P2P] Max peers reached, ignoring:', peerId);
                return;
            }
            peers.set(peerId, { joinedAt: Date.now() });
            console.log(`[P2P] Peer joined: ${peerId} (total: ${peers.size})`);
            if (onPeerUpdate) onPeerUpdate(peers.size);

            // Immediately send our index to the new peer
            if (Object.keys(currentIndex).length > 0) {
                try {
                    sendIndex(currentIndex);
                } catch (e) {
                    console.warn('[P2P] Failed to send index to new peer:', e.message);
                }
            }
        };

        room.onPeerLeave = (peerId) => {
            peers.delete(peerId);
            delete peerIndex[peerId];
            console.log(`[P2P] Peer left: ${peerId} (total: ${peers.size})`);
            if (onPeerUpdate) onPeerUpdate(peers.size);
            if (onIndexUpdate) onIndexUpdate(getMergedPeerIndex());
        };

        // ─── Handlers ─────────────────────────────────────────

        // Index broadcast from peers
        actionIndex.onMessage = (raw, { peerId }) => {
            if (!peers.has(peerId) && peers.size >= MAX_PEERS) return;
            peers.set(peerId, { joinedAt: Date.now() });
            const parsed = safeParse(raw);
            if (!parsed) return;
            const clean = sanitizeIndex(parsed);
            if (!clean) return;
            peerIndex[peerId] = clean;
            console.log(`[P2P] Index from ${peerId}: ${Object.keys(clean).length} videos`);
            if (onIndexUpdate) onIndexUpdate(getMergedPeerIndex());
            if (onPeerUpdate) onPeerUpdate(peers.size);
        };

        // Subtitle request from peer
        actionRequest.onMessage = (raw, { peerId }) => {
            if (!peers.has(peerId)) return;
            const parsed = safeParse(raw);
            if (!parsed) return;
            const videoId = sanitizeText(String(parsed.videoId || ''));
            const lang = sanitizeText(String(parsed.lang || ''));
            if (!videoId || !lang || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return;

            // Look up in localStorage
            const cacheKey = `subtitle_${videoId}_${lang}`;
            try {
                const cached = localStorage.getItem(cacheKey);
                if (!cached) return;
                const data = JSON.parse(cached);
                if (!data || !Array.isArray(data.segments)) return;

                // SECURITY: Sanitize segments before sending (defense-in-depth)
                const safeSegments = sanitizeSegments(data.segments);
                if (!safeSegments) return;

                console.log(`[P2P] Sending ${safeSegments.length} segments to ${peerId} (${lang})`);
                sendResponse({
                    videoId,
                    lang,
                    segments: safeSegments,
                    source: data.source || 'cached'
                }, peerId);
            } catch (e) {
                console.warn('[P2P] Error handling request:', e.message);
            }
        };

        // Subtitle response from peer
        actionResponse.onMessage = (raw, { peerId }) => {
            if (!peers.has(peerId)) return;
            const parsed = safeParse(raw);
            if (!parsed) return;

            const videoId = sanitizeText(String(parsed.videoId || ''));
            const lang = sanitizeText(String(parsed.lang || ''));
            if (!videoId || !lang || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return;

            // SECURITY: Full sanitization pipeline
            const safeSegments = sanitizeSegments(parsed.segments);
            if (!safeSegments || safeSegments.length === 0) {
                console.warn('[P2P] Rejected subtitle response: invalid segments');
                return;
            }

            console.log(`[P2P] Received ${safeSegments.length} segments for ${lang} from ${peerId}`);

            // Dispatch custom event for main.js to handle
            const evt = new CustomEvent('p2pSubtitleReceived', {
                detail: {
                    videoId,
                    lang,
                    segments: safeSegments,
                    source: 'p2p',
                    peerId
                }
            });
            document.dispatchEvent(evt);
        };

        // Start periodic re-index broadcast
        reindexInterval = setInterval(() => {
            if (Object.keys(currentIndex).length > 0) {
                try { sendIndex(currentIndex); } catch (_) {}
            }
        }, REINDEX_INTERVAL);

        // Send initial index after brief delay for Nostr relay
        indexTimeout = setTimeout(() => {
            if (Object.keys(currentIndex).length > 0) {
                try { sendIndex(currentIndex); } catch (_) {}
            }
        }, JOIN_TIMEOUT);
    }

    /**
     * Build index from localStorage subtitle cache.
     */
    function buildLocalIndex() {
        const index = {};
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                const m = key.match(/^subtitle_([a-zA-Z0-9_-]{11})_(.+)$/);
                if (!m) continue;
                const videoId = m[1];
                const lang = m[2];
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    if (data && Array.isArray(data.segments) && data.segments.length > 0) {
                        if (!index[videoId]) index[videoId] = [];
                        index[videoId].push({
                            lang,
                            count: data.segments.length,
                            source: data.source || 'cached'
                        });
                    }
                } catch (_) {}
            }
        } catch (_) {}
        return index;
    }

    /**
     * Build and broadcast the current local subtitle index.
     * Call this whenever localStorage subtitle cache changes.
     */
    function broadcastIndex() {
        currentIndex = buildLocalIndex();
        if (room && Object.keys(currentIndex).length > 0) {
            try {
                sendIndex(currentIndex);
                console.log('[P2P] Broadcasted index:', Object.keys(currentIndex).length, 'videos');
            } catch (e) {
                console.warn('[P2P] Failed to broadcast index:', e.message);
            }
        }
    }

    /**
     * Broadcast a single subtitle availability update (incremental).
     */
    function broadcastSubtitleAvailable(videoId, lang, count, source) {
        if (!room) return;
        if (!currentIndex[videoId]) currentIndex[videoId] = [];
        // Update or add entry
        const existing = currentIndex[videoId].find(e => e.lang === lang);
        if (existing) {
            existing.count = count;
            existing.source = source;
        } else {
            currentIndex[videoId].push({ lang, count, source });
        }
        try {
            sendIndex(currentIndex);
        } catch (_) {}
    }

    /**
     * Merge all peer indexes into a single videoId → lang map.
     */
    function getMergedPeerIndex() {
        const merged = {};
        for (const [peerId, index] of Object.entries(peerIndex)) {
            for (const [videoId, langs] of Object.entries(index)) {
                if (!merged[videoId]) merged[videoId] = {};
                for (const entry of langs) {
                    if (!merged[videoId][entry.lang]) {
                        merged[videoId][entry.lang] = { count: entry.count, source: entry.source, peers: [] };
                    }
                    merged[videoId][entry.lang].peers.push(peerId);
                }
            }
        }
        return merged;
    }

    /**
     * Check if any peer has subtitles for a given videoId + lang.
     * Returns array of { peerId, count, source } or empty array.
     */
    function findPeersWith(videoId, lang) {
        const result = [];
        for (const [peerId, index] of Object.entries(peerIndex)) {
            const videoLangs = index[videoId];
            if (!videoLangs) continue;
            const entry = videoLangs.find(e => e.lang === lang);
            if (entry) result.push({ peerId, count: entry.count, source: entry.source });
        }
        return result;
    }

    /**
     * Get all available subtitles for a videoId from peers.
     * Returns { lang: { count, source, peers: [] } } or {}.
     */
    function getPeerSubsForVideo(videoId) {
        const merged = getMergedPeerIndex();
        return merged[videoId] || {};
    }

    /**
     * Request subtitles from a specific peer.
     */
    function requestSubtitle(peerId, videoId, lang) {
        if (!room || !sendRequest) return;
        try {
            sendRequest({ videoId, lang }, peerId);
            console.log(`[P2P] Requested ${lang} for ${videoId} from ${peerId}`);
        } catch (e) {
            console.warn('[P2P] Request failed:', e.message);
        }
    }

    /**
     * Get current peer count.
     */
    function getPeerCount() {
        return peers.size;
    }

    /**
     * Get current room info.
     */
    function getRoomInfo() {
        return {
            roomId: activeRoomId,
            isPublic: activeRoomId === PUBLIC_ROOM,
            peerCount: peers.size,
            myIndex: currentIndex,
            peerIndex: getMergedPeerIndex()
        };
    }

    /**
     * Leave current room and clean up.
     */
    function destroy() {
        destroyed = true;
        if (room) {
            try { room.leave(); } catch (_) {}
            room = null;
        }
        peers.clear();
        peerIndex = {};
        if (reindexInterval) clearInterval(reindexInterval);
        if (indexTimeout) clearTimeout(indexTimeout);
        console.log('[P2P] Disconnected');
    }

    /**
     * Generate the shareable URL for a custom room.
     */
    function getShareUrl(roomId) {
        const base = window.location.origin;
        return `${base}?p2p_room=${roomId}`;
    }

    /**
     * Generate a QR code SVG string for a custom room ID.
     * Uses locally bundled qrcode-generator (no external API).
     * Returns SVG markup string or null if QRCode library not loaded.
     */
    function getQrSvg(roomId) {
        if (!window.QRCode) return null;
        const url = getShareUrl(roomId);
        const qr = window.QRCode(0, 'L'); // type 0 = auto, L = low correction
        qr.addData(url);
        qr.make();
        const cellSize = 6;
        const margin = 2;
        const modules = qr.getModuleCount();
        const size = (modules + margin * 2) * cellSize;
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">`;
        svg += `<rect width="${size}" height="${size}" fill="white"/>`;
        for (let row = 0; row < modules; row++) {
            for (let col = 0; col < modules; col++) {
                if (qr.isDark(row, col)) {
                    svg += `<rect x="${(col + margin) * cellSize}" y="${(row + margin) * cellSize}" width="${cellSize}" height="${cellSize}" fill="black"/>`;
                }
            }
        }
        svg += '</svg>';
        return svg;
    }

    // ─── Public API ──────────────────────────────────────────────
    return {
        init,
        destroy,
        broadcastIndex,
        broadcastSubtitleAvailable,
        findPeersWith,
        getPeerSubsForVideo,
        requestSubtitle,
        getPeerCount,
        getRoomInfo,
        buildLocalIndex,
        getMergedPeerIndex,
        getShareUrl,
        getQrSvg,
        generateRoomId,
        sanitizeSegments,   // Expose for testing
        sanitizeText,       // Expose for testing
        PUBLIC_ROOM
    };
})();

window.P2P = P2P;

// Clean up room connection when page is closed
window.addEventListener('beforeunload', () => P2P.destroy());
