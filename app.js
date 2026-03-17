const CAST_NAMESPACE = 'urn:x-cast:com.linkcast.youtube';
const HISTORY_KEY = 'linkcast-history-v1';
const CAST_APP_ID = '7A03A2F5';
const isReceiverMode = /\bCrKey\b/i.test(navigator.userAgent) || new URL(location.href).searchParams.get('receiver') === '1';

const appShell = document.getElementById('app-shell');
const receiverShell = document.getElementById('receiver-shell');
const form = document.getElementById('player-form');
const urlInput = document.getElementById('youtube-url');
const statusEl = document.getElementById('status');
const placeholderEl = document.getElementById('player-placeholder');
const videoMetaEl = document.getElementById('video-meta');
const videoIdText = document.getElementById('video-id-text');
const historyList = document.getElementById('history-list');
const clearHistoryBtn = document.getElementById('clear-history-btn');
const openYoutubeBtn = document.getElementById('open-youtube-btn');
const copyLinkBtn = document.getElementById('copy-link-btn');
const castCurrentBtn = document.getElementById('cast-current-btn');
const castLauncher = document.getElementById('cast-launcher');
const castHelpBtn = document.getElementById('cast-help-btn');
const castHelpDialog = document.getElementById('cast-help-dialog');
const closeCastHelpBtn = document.getElementById('close-cast-help-btn');
const castStatePill = document.getElementById('cast-state-pill');
const receiverWaitingEl = document.getElementById('receiver-waiting');
const clearLogBtn = document.getElementById('clear-log-btn');

const diagAppId = document.getElementById('diag-app-id');
const diagSecure = document.getElementById('diag-secure');
const diagPlatform = document.getElementById('diag-platform');
const diagCastApi = document.getElementById('diag-cast-api');
const diagBrowser = document.getElementById('diag-browser');
const diagOnline = document.getElementById('diag-online');
const diagCastState = document.getElementById('diag-cast-state');
const diagSessionState = document.getElementById('diag-session-state');
const diagPageMode = document.getElementById('diag-page-mode');
const diagOrigin = document.getElementById('diag-origin');
const diagLog = document.getElementById('diag-log');

let player;
let currentVideo = null;
let youtubeReady = false;
let castApiAvailable = false;
let receiverPlayer;
let receiverQueuedVideoId = null;
let logLines = [];

function nowStamp() {
  return new Date().toLocaleTimeString();
}

function appendLog(message) {
  const line = `[${nowStamp()}] ${message}`;
  logLines.push(line);
  if (logLines.length > 60) logLines = logLines.slice(-60);
  if (diagLog) diagLog.textContent = logLines.join('\n');
}

function setText(el, text) {
  if (el) el.textContent = text;
}

function setStatus(message, type = '') {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = `status ${type}`.trim();
  appendLog(`STATUS: ${message}`);
}

function setCastVisualState(kind, label) {
  if (!castStatePill) return;
  castStatePill.classList.remove('connecting', 'connected');
  if (kind === 'connecting') castStatePill.classList.add('connecting');
  if (kind === 'connected') castStatePill.classList.add('connected');
  castStatePill.textContent = label;
}

function injectScript(src) {
  return new Promise((resolve, reject) => {
    if ([...document.scripts].some((s) => s.src === src)) return resolve();
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

function parseYouTubeLink(rawValue) {
  if (!rawValue) return null;
  let url;
  try { url = new URL(rawValue.trim()); } catch { return null; }
  const hostname = url.hostname.replace(/^www\./, '');
  let videoId = '';
  if (hostname === 'youtu.be') videoId = url.pathname.split('/').filter(Boolean)[0] || '';
  else if (hostname === 'youtube.com' || hostname === 'm.youtube.com' || hostname === 'music.youtube.com') {
    if (url.pathname === '/watch') videoId = url.searchParams.get('v') || '';
    else if (url.pathname.startsWith('/shorts/') || url.pathname.startsWith('/live/') || url.pathname.startsWith('/embed/')) videoId = url.pathname.split('/')[2] || '';
  }
  videoId = videoId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 15);
  if (!videoId || videoId.length < 6) return null;
  return { videoId, canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`, thumbUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` };
}

function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}

function saveToHistory(video) {
  const existing = getHistory().filter((item) => item.videoId !== video.videoId);
  localStorage.setItem(HISTORY_KEY, JSON.stringify([video, ...existing].slice(0, 8)));
  renderHistory();
}

function renderHistory() {
  if (!historyList) return;
  const items = getHistory();
  historyList.innerHTML = '';
  if (!items.length) {
    historyList.innerHTML = '<p class="muted">No recent links yet.</p>';
    return;
  }
  items.forEach((item) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'history-item';
    wrapper.innerHTML = `<img class="history-thumb" src="${item.thumbUrl}" alt="Thumbnail for ${item.videoId}" loading="lazy" /><div class="history-meta"><p class="history-title">Video ${item.videoId}</p><p class="history-url">${item.canonicalUrl}</p></div><button type="button" class="secondary-btn history-play-btn">Play</button>`;
    wrapper.querySelector('button').addEventListener('click', () => { urlInput.value = item.canonicalUrl; loadVideoFromInput(); });
    historyList.appendChild(wrapper);
  });
}

function ensurePlayer(videoId) {
  if (!youtubeReady) return setStatus('YouTube player is still loading. Try again in a moment.', 'error');
  if (!player) {
    player = new YT.Player('player', { videoId, playerVars: { autoplay: 1, rel: 0, playsinline: 1 }, events: { onReady: () => placeholderEl.classList.add('hidden') } });
    return;
  }
  placeholderEl.classList.add('hidden');
  player.loadVideoById(videoId);
}

function updateCurrentVideo(video) {
  currentVideo = video;
  openYoutubeBtn.disabled = false;
  copyLinkBtn.disabled = false;
  castCurrentBtn.disabled = false;
  videoMetaEl.classList.remove('hidden');
  videoIdText.textContent = video.videoId;
}

function loadVideoFromInput() {
  const parsed = parseYouTubeLink(urlInput.value);
  if (!parsed) return setStatus('That does not look like a valid YouTube link.', 'error');
  ensurePlayer(parsed.videoId);
  updateCurrentVideo(parsed);
  saveToHistory(parsed);
  setStatus('Video loaded. Use the Cast icon in desktop Chrome to connect to your TV.', 'success');
}

async function copyCurrentLink() {
  if (!currentVideo) return;
  try {
    await navigator.clipboard.writeText(currentVideo.canonicalUrl);
    setStatus('Link copied to clipboard.', 'success');
  } catch {
    setStatus('Unable to copy the link on this device.', 'error');
  }
}

function openCurrentOnYouTube() {
  if (currentVideo) window.open(currentVideo.canonicalUrl, '_blank', 'noopener');
}

function updateDiagnosticsShell() {
  setText(diagAppId, CAST_APP_ID);
  setText(diagSecure, window.isSecureContext ? 'YES' : 'NO');
  setText(diagOnline, navigator.onLine ? 'YES' : 'NO');
  setText(diagOrigin, location.origin);
  setText(diagPageMode, isReceiverMode ? 'RECEIVER' : 'SENDER');
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const isChromeLike = /Chrome|CriOS|Edg|OPR/i.test(ua);
  const platformLabel = isIOS ? 'iPhone / iPad' : isAndroid ? 'Android' : 'Desktop';
  setText(diagPlatform, platformLabel);
  const browserLabel = isIOS ? 'Use native iOS Cast app, not web sender' : isChromeLike ? 'Chrome / Chromium-like' : 'Non-Chrome browser';
  setText(diagBrowser, browserLabel);
  appendLog(`Environment: ${platformLabel}, secure=${window.isSecureContext}, online=${navigator.onLine}`);
}

function initCastContext() {
  if (!window.cast?.framework || !window.chrome?.cast) return false;
  cast.framework.CastContext.getInstance().setOptions({
    receiverApplicationId: CAST_APP_ID,
    autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
    resumeSavedSession: true,
  });
  setText(diagCastApi, 'READY');
  castLauncher.classList.remove('hidden');
  castLauncher.style.display = 'grid';
  appendLog(`Cast SDK ready with App ID ${CAST_APP_ID}`);
  const context = cast.framework.CastContext.getInstance();
  context.addEventListener(cast.framework.CastContextEventType.CAST_STATE_CHANGED, (event) => {
    const state = event.castState || 'UNKNOWN';
    setText(diagCastState, state);
    if (state === cast.framework.CastState.NO_DEVICES_AVAILABLE) {
      setCastVisualState('ready', 'No devices found');
      setStatus('Chrome loaded Cast, but it cannot currently discover any Cast devices on this network.', 'error');
    } else if (state === cast.framework.CastState.CONNECTING) {
      setCastVisualState('connecting', 'Connecting');
    } else if (state === cast.framework.CastState.CONNECTED) {
      const deviceName = context.getCurrentSession()?.getCastDevice?.().friendlyName || 'Connected';
      setCastVisualState('connected', deviceName);
    } else {
      setCastVisualState('ready', 'Ready to cast');
    }
    appendLog(`CAST_STATE_CHANGED: ${state}`);
  });

  context.addEventListener(cast.framework.CastContextEventType.SESSION_STATE_CHANGED, (event) => {
    const sessionState = event.sessionState || 'UNKNOWN';
    setText(diagSessionState, sessionState);
    appendLog(`SESSION_STATE_CHANGED: ${sessionState}`);
    if (sessionState === cast.framework.SessionState.SESSION_STARTED || sessionState === cast.framework.SessionState.SESSION_RESUMED) {
      const deviceName = event.session?.getCastDevice?.().friendlyName || 'Connected';
      setCastVisualState('connected', deviceName);
      setStatus(`Connected to ${deviceName}.`, 'success');
      if (currentVideo) sendVideoToReceiver(currentVideo);
    }
    if (sessionState === cast.framework.SessionState.SESSION_START_FAILED) {
      setStatus('Cast session failed to start. Recheck the TV registration serial, same-Wi-Fi network, and whether you are testing from desktop Chrome.', 'error');
    }
  });
  return true;
}

function sendVideoToReceiver(video) {
  if (!castApiAvailable || !window.cast?.framework) {
    return setStatus('Cast is not available in this browser/device.', 'error');
  }
  const session = cast.framework.CastContext.getInstance().getCurrentSession();
  if (!session) {
    setStatus('Use the Cast icon first to connect to your TV.', 'error');
    return cast.framework.CastContext.getInstance().requestSession().catch(() => appendLog('requestSession() was cancelled or failed'));
  }
  session.sendMessage(CAST_NAMESPACE, { type: 'LOAD_YOUTUBE', videoId: video.videoId, originalUrl: video.canonicalUrl }).then(() => {
    const deviceName = session?.getCastDevice?.().friendlyName || 'your device';
    setStatus(`Casting video ${video.videoId} to ${deviceName}.`, 'success');
  }).catch(() => {
    setStatus('Connected, but the receiver did not accept the video. That usually means the TV registration or receiver launch is still not correct.', 'error');
  });
}

function bindSenderEvents() {
  form.addEventListener('submit', (event) => { event.preventDefault(); loadVideoFromInput(); });
  openYoutubeBtn.addEventListener('click', openCurrentOnYouTube);
  copyLinkBtn.addEventListener('click', copyCurrentLink);
  castCurrentBtn.addEventListener('click', () => {
    if (!currentVideo) return setStatus('Play a video first, then cast it.', 'error');
    sendVideoToReceiver(currentVideo);
  });
  clearHistoryBtn.addEventListener('click', () => { localStorage.removeItem(HISTORY_KEY); renderHistory(); setStatus('Recent links cleared.', 'success'); });
  clearLogBtn.addEventListener('click', () => { logLines = []; diagLog.textContent = ''; appendLog('Diagnostics log cleared'); });
  castHelpBtn.addEventListener('click', () => castHelpDialog.showModal());
  closeCastHelpBtn.addEventListener('click', () => castHelpDialog.close());
  window.addEventListener('online', () => setText(diagOnline, 'YES'));
  window.addEventListener('offline', () => setText(diagOnline, 'NO'));
}

function loadYouTubeApiForSender() {
  return new Promise((resolve, reject) => {
    window.onYouTubeIframeAPIReady = function () { youtubeReady = true; setStatus('Paste a valid YouTube link to begin.', ''); appendLog('YouTube sender API ready'); resolve(); };
    injectScript('https://www.youtube.com/iframe_api').catch(reject);
  });
}

function loadCastSenderApi() {
  return new Promise((resolve, reject) => {
    window.__onGCastApiAvailable = function (isAvailable) {
      castApiAvailable = Boolean(isAvailable);
      setText(diagCastApi, castApiAvailable ? 'LOADED' : 'UNAVAILABLE');
      appendLog(`__onGCastApiAvailable: ${castApiAvailable}`);
      if (castApiAvailable) initCastContext();
      else setStatus('The Cast SDK loaded, but Cast support is unavailable in this browser/device.', 'error');
      resolve();
    };
    injectScript('https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1').catch(reject);
  });
}

function loadYouTubeApiForReceiver() {
  return new Promise((resolve, reject) => {
    window.onYouTubeIframeAPIReady = function () { youtubeReady = true; resolve(); };
    injectScript('https://www.youtube.com/iframe_api').catch(reject);
  });
}

function loadReceiverScript() {
  return injectScript('https://www.gstatic.com/cast/sdk/libs/caf_receiver/v3/cast_receiver_framework.js');
}

function loadVideoOnReceiver(videoId) {
  if (!youtubeReady) { receiverQueuedVideoId = videoId; return; }
  receiverWaitingEl.classList.add('hidden');
  if (!receiverPlayer) {
    receiverPlayer = new YT.Player('receiver-player', { videoId, playerVars: { autoplay: 1, controls: 1, rel: 0 } });
    return;
  }
  receiverPlayer.loadVideoById(videoId);
}

function initReceiverMode() {
  appShell.classList.add('hidden');
  receiverShell.classList.remove('hidden');
  const context = cast.framework.CastReceiverContext.getInstance();
  context.addCustomMessageListener(CAST_NAMESPACE, (event) => {
    const data = event.data || {};
    if (data.type === 'LOAD_YOUTUBE' && data.videoId) loadVideoOnReceiver(data.videoId);
  });
  context.start();
  if (receiverQueuedVideoId) loadVideoOnReceiver(receiverQueuedVideoId);
}

async function start() {
  if (isReceiverMode) {
    try {
      await Promise.all([loadYouTubeApiForReceiver(), loadReceiverScript()]);
      initReceiverMode();
    } catch {
      receiverWaitingEl.innerHTML = '<h1>Receiver failed to load</h1><p>Check the receiver app URL and HTTPS hosting.</p>';
      appShell.classList.add('hidden');
      receiverShell.classList.remove('hidden');
    }
    return;
  }

  updateDiagnosticsShell();
  renderHistory();
  bindSenderEvents();
  copyLinkBtn.disabled = true;
  castCurrentBtn.disabled = true;
  setCastVisualState('ready', 'Loading');

  try {
    await loadYouTubeApiForSender();
  } catch {
    setStatus('Could not load the YouTube player SDK.', 'error');
  }

  try {
    await loadCastSenderApi();
  } catch {
    setText(diagCastApi, 'FAILED');
    setStatus('Could not load the Cast SDK. Reload the page or try again in desktop Chrome.', 'error');
  }
}

start();
