const CAST_NAMESPACE = 'urn:x-cast:com.linkcast.youtube';
const HISTORY_KEY = 'linkcast-history-v1';
const CAST_ID_KEY = 'linkcast-cast-app-id-v1';
const DEFAULT_CAST_APP_ID = '7A03A2F5';

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
const castButton = document.getElementById('cast-button');
const castHelpBtn = document.getElementById('cast-help-btn');
const castHelpDialog = document.getElementById('cast-help-dialog');
const closeCastHelpBtn = document.getElementById('close-cast-help-btn');
const receiverAppIdInput = document.getElementById('receiver-app-id');
const saveCastIdBtn = document.getElementById('save-cast-id-btn');
const clearCastIdBtn = document.getElementById('clear-cast-id-btn');
const castStatePill = document.getElementById('cast-state-pill');
const receiverWaitingEl = document.getElementById('receiver-waiting');

let player;
let currentVideo = null;
let youtubeReady = false;
let castApiAvailable = false;
let castListenersBound = false;
let receiverPlayer;
let receiverQueuedVideoId = null;

function injectScript(src) {
  return new Promise((resolve, reject) => {
    if ([...document.scripts].some((s) => s.src === src)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

function sanitizeCastAppId(value) {
  return (value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 32);
}

function getSavedCastAppId() {
  const saved = sanitizeCastAppId(localStorage.getItem(CAST_ID_KEY) || '');
  return saved || DEFAULT_CAST_APP_ID;
}

function saveCastAppId(appId) {
  localStorage.setItem(CAST_ID_KEY, appId);
}

function clearCastAppId() {
  localStorage.removeItem(CAST_ID_KEY);
}

function ensureDefaultCastId() {
  const existing = sanitizeCastAppId(localStorage.getItem(CAST_ID_KEY) || '');
  if (!existing) {
    saveCastAppId(DEFAULT_CAST_APP_ID);
  }
}

function setStatus(message, type = '') {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = `status ${type}`.trim();
}

function setCastVisualState(kind, label) {
  if (!castButton || !castStatePill) return;
  castButton.classList.remove('ready', 'connecting', 'connected');
  castStatePill.classList.remove('connecting', 'connected');
  castStatePill.textContent = label;

  if (kind === 'ready') castButton.classList.add('ready');
  if (kind === 'connecting') {
    castButton.classList.add('connecting');
    castStatePill.classList.add('connecting');
  }
  if (kind === 'connected') {
    castButton.classList.add('connected');
    castStatePill.classList.add('connected');
  }
}

function parseYouTubeLink(rawValue) {
  if (!rawValue) return null;

  let url;
  try {
    url = new URL(rawValue.trim());
  } catch {
    return null;
  }

  const hostname = url.hostname.replace(/^www\./, '');
  let videoId = '';

  if (hostname === 'youtu.be') {
    videoId = url.pathname.split('/').filter(Boolean)[0] || '';
  } else if (hostname === 'youtube.com' || hostname === 'm.youtube.com' || hostname === 'music.youtube.com') {
    if (url.pathname === '/watch') {
      videoId = url.searchParams.get('v') || '';
    } else if (url.pathname.startsWith('/shorts/')) {
      videoId = url.pathname.split('/')[2] || '';
    } else if (url.pathname.startsWith('/live/')) {
      videoId = url.pathname.split('/')[2] || '';
    } else if (url.pathname.startsWith('/embed/')) {
      videoId = url.pathname.split('/')[2] || '';
    }
  }

  videoId = videoId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 15);
  if (!videoId || videoId.length < 6) return null;

  return {
    videoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    thumbUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };
}

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveToHistory(video) {
  const existing = getHistory().filter((item) => item.videoId !== video.videoId);
  const next = [video, ...existing].slice(0, 8);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
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
    wrapper.innerHTML = `
      <img class="history-thumb" src="${item.thumbUrl}" alt="Thumbnail for ${item.videoId}" loading="lazy" />
      <div class="history-meta">
        <p class="history-title">Video ${item.videoId}</p>
        <p class="history-url">${item.canonicalUrl}</p>
      </div>
      <button type="button" class="secondary-btn history-play-btn">Play</button>
    `;

    wrapper.querySelector('button').addEventListener('click', () => {
      urlInput.value = item.canonicalUrl;
      loadVideoFromInput();
    });

    historyList.appendChild(wrapper);
  });
}

function ensurePlayer(videoId) {
  if (!youtubeReady) {
    setStatus('YouTube player is still loading. Try again in a moment.', 'error');
    return;
  }

  if (!player) {
    player = new YT.Player('player', {
      videoId,
      playerVars: {
        autoplay: 1,
        rel: 0,
        playsinline: 1,
      },
      events: {
        onReady: () => {
          placeholderEl.classList.add('hidden');
        },
      },
    });
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
  if (!parsed) {
    setStatus('That does not look like a valid YouTube watch, shorts, live, embed, or youtu.be link.', 'error');
    return;
  }

  ensurePlayer(parsed.videoId);
  updateCurrentVideo(parsed);
  saveToHistory(parsed);
  setStatus('Video loaded. Tap the Cast icon to choose a device and send this video.', 'success');
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
  if (!currentVideo) return;
  window.open(currentVideo.canonicalUrl, '_blank', 'noopener');
}

function initCastContext(appId) {
  if (!castApiAvailable || !appId || !window.cast?.framework || !window.chrome?.cast) return false;
  const context = cast.framework.CastContext.getInstance();

  context.setOptions({
    receiverApplicationId: appId,
    autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
    resumeSavedSession: true,
  });

  if (!castListenersBound) {
    castListenersBound = true;

    context.addEventListener(cast.framework.CastContextEventType.CAST_STATE_CHANGED, (event) => {
      const state = event.castState;
      if (state === cast.framework.CastState.NO_DEVICES_AVAILABLE) {
        setCastVisualState('ready', 'No devices found');
      } else if (state === cast.framework.CastState.CONNECTING) {
        setCastVisualState('connecting', 'Connecting');
      } else if (state === cast.framework.CastState.CONNECTED) {
        const session = context.getCurrentSession();
        const deviceName = session?.getCastDevice?.().friendlyName || 'Connected';
        setCastVisualState('connected', deviceName);
      } else {
        setCastVisualState('ready', 'Ready to cast');
      }
    });

    context.addEventListener(cast.framework.CastContextEventType.SESSION_STATE_CHANGED, (event) => {
      if (event.sessionState === cast.framework.SessionState.SESSION_STARTED || event.sessionState === cast.framework.SessionState.SESSION_RESUMED) {
        const deviceName = event.session?.getCastDevice?.().friendlyName || 'Connected';
        setCastVisualState('connected', deviceName);
        setStatus(`Connected to ${deviceName}.`, 'success');
        if (currentVideo) sendVideoToReceiver(currentVideo);
      }

      if (event.sessionState === cast.framework.SessionState.SESSION_START_FAILED) {
        setCastVisualState('ready', 'Ready to cast');
        setStatus('The Cast session could not start. If your receiver is unpublished, add your TV or Chromecast as an authorized device, wait 5–15 minutes, reboot it, then try again in desktop Chrome.', 'error');
      }

      if (event.sessionState === cast.framework.SessionState.SESSION_ENDED) {
        setCastVisualState('ready', 'Ready to cast');
        setStatus('Cast session ended.', '');
      }
    });
  }

  setCastVisualState('ready', 'Ready to cast');
  return true;
}

function sendVideoToReceiver(video) {
  const appId = getSavedCastAppId();
  if (!appId) {
    setStatus('Save your Cast receiver app ID first in the Cast setup section.', 'error');
    receiverAppIdInput.focus();
    return;
  }

  if (!castApiAvailable || !initCastContext(appId)) {
    setStatus('Cast is not available here. Open this site in desktop Chrome on HTTPS, or use the native Android/iPhone version for phone casting.', 'error');
    return;
  }

  const session = cast.framework.CastContext.getInstance().getCurrentSession();
  if (!session) {
    setStatus('Pick a device from the Cast icon first.', 'error');
    return;
  }

  session.sendMessage(CAST_NAMESPACE, {
    type: 'LOAD_YOUTUBE',
    videoId: video.videoId,
    originalUrl: video.canonicalUrl,
  }).then(() => {
    const deviceName = session?.getCastDevice?.().friendlyName || 'your device';
    setStatus(`Casting video ${video.videoId} to ${deviceName}.`, 'success');
  }).catch(() => {
    setStatus('Connected, but the receiver did not accept the video. Check the receiver URL, app ID, and unpublished-device authorization.', 'error');
  });
}

async function openDeviceChooserAndCast() {
  const appId = getSavedCastAppId();
  if (!appId) {
    setStatus('Save your Cast receiver app ID first in the Cast setup section.', 'error');
    receiverAppIdInput.focus();
    return;
  }

  if (!castApiAvailable || !initCastContext(appId)) {
    setStatus('Cast chooser is unavailable here. Open this site in desktop Chrome on HTTPS. On iPhone or iPad, use the native app version instead of the web page.', 'error');
    return;
  }

  const context = cast.framework.CastContext.getInstance();
  const existingSession = context.getCurrentSession();
  if (existingSession) {
    if (currentVideo) {
      sendVideoToReceiver(currentVideo);
    } else {
      setStatus('Connected to a Cast device. Play a video first to send it.', '');
    }
    return;
  }

  try {
    setCastVisualState('connecting', 'Opening devices');
    await context.requestSession();
    if (!currentVideo) {
      setStatus('Device selected. Now play or load a video and tap Cast again.', 'success');
    }
  } catch {
    setCastVisualState('ready', 'Ready to cast');
    setStatus('No device was selected, or the Cast chooser could not open here. Try again in desktop Chrome on the same Wi‑Fi as the TV/Chromecast.', 'error');
  }
}

function bindSenderEvents() {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    loadVideoFromInput();
  });

  openYoutubeBtn.addEventListener('click', openCurrentOnYouTube);
  copyLinkBtn.addEventListener('click', copyCurrentLink);
  castCurrentBtn.addEventListener('click', () => {
    if (!currentVideo) {
      setStatus('Play a video first, then cast it.', 'error');
      return;
    }
    openDeviceChooserAndCast();
  });
  castButton.addEventListener('click', openDeviceChooserAndCast);
  clearHistoryBtn.addEventListener('click', () => {
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
    setStatus('Recent links cleared.', 'success');
  });
  castHelpBtn.addEventListener('click', () => castHelpDialog.showModal());
  closeCastHelpBtn.addEventListener('click', () => castHelpDialog.close());

  saveCastIdBtn.addEventListener('click', () => {
    const appId = sanitizeCastAppId(receiverAppIdInput.value);
    if (!appId) {
      setStatus('Enter a valid Cast receiver app ID first.', 'error');
      receiverAppIdInput.focus();
      return;
    }
    receiverAppIdInput.value = appId;
    saveCastAppId(appId);
    if (castApiAvailable) initCastContext(appId);
    setStatus('Cast receiver app ID saved. Tap the Cast icon to choose a device.', 'success');
  });

  clearCastIdBtn.addEventListener('click', () => {
    clearCastAppId();
    receiverAppIdInput.value = DEFAULT_CAST_APP_ID;
    saveCastAppId(DEFAULT_CAST_APP_ID);
    if (castApiAvailable) initCastContext(DEFAULT_CAST_APP_ID);
    setStatus('Cast receiver app ID reset to the default app ID.', 'success');
  });
}

function setupSenderUi() {
  ensureDefaultCastId();
  receiverAppIdInput.value = getSavedCastAppId();
  copyLinkBtn.disabled = true;
  castCurrentBtn.disabled = true;
  renderHistory();
  setCastVisualState('ready', 'Loading Cast');
}

function loadYouTubeApiForSender() {
  return new Promise((resolve, reject) => {
    window.onYouTubeIframeAPIReady = function () {
      youtubeReady = true;
      setStatus('Paste a valid YouTube link to begin.', '');
      resolve();
    };
    injectScript('https://www.youtube.com/iframe_api').catch(reject);
  });
}

function loadCastSenderApi() {
  return new Promise((resolve, reject) => {
    window.__onGCastApiAvailable = function (isAvailable) {
      castApiAvailable = Boolean(isAvailable);
      if (castApiAvailable) {
        initCastContext(getSavedCastAppId());
        resolve();
      } else {
        setCastVisualState('ready', 'Cast unavailable');
        setStatus('The Cast SDK loaded, but Cast support is not available in this browser/device. Use desktop Chrome or the native mobile app.', 'error');
        resolve();
      }
    };

    injectScript('https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1').catch(reject);
  });
}

function loadYouTubeApiForReceiver() {
  return new Promise((resolve, reject) => {
    window.onYouTubeIframeAPIReady = function () {
      youtubeReady = true;
      resolve();
    };
    injectScript('https://www.youtube.com/iframe_api').catch(reject);
  });
}

function loadReceiverScript() {
  return injectScript('https://www.gstatic.com/cast/sdk/libs/caf_receiver/v3/cast_receiver_framework.js');
}

function loadVideoOnReceiver(videoId) {
  if (!youtubeReady) {
    receiverQueuedVideoId = videoId;
    return;
  }

  receiverWaitingEl.classList.add('hidden');

  if (!receiverPlayer) {
    receiverPlayer = new YT.Player('receiver-player', {
      videoId,
      playerVars: {
        autoplay: 1,
        controls: 1,
        rel: 0,
      },
    });
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
    if (data.type === 'LOAD_YOUTUBE' && data.videoId) {
      loadVideoOnReceiver(data.videoId);
    }
  });
  context.start();

  if (receiverQueuedVideoId) {
    loadVideoOnReceiver(receiverQueuedVideoId);
  }
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

  setupSenderUi();
  bindSenderEvents();

  try {
    await loadYouTubeApiForSender();
  } catch {
    setStatus('Could not load the YouTube player SDK.', 'error');
  }

  try {
    await loadCastSenderApi();
  } catch {
    setCastVisualState('ready', 'Cast unavailable');
    setStatus('Could not load the Cast SDK. Reload the page or try again in desktop Chrome.', 'error');
  }
}

start();
