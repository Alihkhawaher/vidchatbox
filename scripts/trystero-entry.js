// Trystero entry point — bundled into IIFE for vanilla JS browser use
import { joinRoom, selfId, getRelaySockets, pauseRelayReconnection, resumeRelayReconnection, defaultRelayUrls } from '@trystero-p2p/nostr';

window.Trystero = {
    joinRoom,
    selfId,
    getRelaySockets,
    pauseRelayReconnection,
    resumeRelayReconnection,
    defaultRelayUrls
};

console.log('[Trystero] Bundled and ready, selfId:', selfId);
window.dispatchEvent(new Event('trystero-ready'));
