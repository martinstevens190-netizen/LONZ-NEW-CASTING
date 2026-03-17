const CAST_NAMESPACE = 'urn:x-cast:com.linkcast.youtube';
const HISTORY_KEY = 'linkcast-history-v1';
const CAST_ID_KEY = 'linkcast-cast-app-id-v1';

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

let player;
let currentVideo = null;
let youtubeReady = false;
let castApiAvailable = false;
let castListenersBound = false;

function setStatus(message, type = '') {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`.trim();
}

function sanitizeCastAppId(value) {
  return (value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 32);
}

function getSavedCastAppId() {
  return sanitizeCastAppId(localStorage.getItem(CAST_ID_KEY) || '');
}

function saveCastAppId(appId) {
  localStorage.setItem(CAST_ID_KEY, appId);
}

function clearCastAppId() {
  localStorage.removeItem(CAST_ID_KEY);
}

function setCastVisualState(kind, label) {
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

function saveToHistory(video) {
  const existing = getHistory().filter((item) => item.videoId !== video.videoId);
  const next = [video, ...existing].slice(0, 8);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  renderHistory();
}

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

function renderHistory() {
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
  if (!castApiAvailable || !appId) return false;
  const context = cast.framework.CastContext.getInstance();

  context.setOptions({
    receiverApplicationId: appId,
    autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
    resumeSavedSession: true,
  });

  if (!castListenersBound) {
    castListenersBound = true;

    context.addEventListener(
      cast.framework.CastContextEventType.CAST_STATE_CHANGED,
      (event) => {
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
      }
    );

    context.addEventListener(
      cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
      (event) => {
        if (event.sessionState === cast.framework.SessionState.SESSION_STARTED || event.sessionState === cast.framework.SessionState.SESSION_RESUMED) {
          const deviceName = event.session?.getCastDevice?.().friendlyName || 'Connected';
          setCastVisualState('connected', deviceName);
          setStatus(`Connected to ${deviceName}.`, 'success');
          if (currentVideo) sendVideoToReceiver(currentVideo);
        }

        if (event.sessionState === cast.framework.SessionState.SESSION_START_FAILED) {
          setCastVisualState('ready', 'Ready to cast');
          setStatus('Could not open the Cast device chooser or start the Cast session on this device/browser.', 'error');
        }

        if (event.sessionState === cast.framework.SessionState.SESSION_ENDED) {
          setCastVisualState('ready', 'Ready to cast');
          setStatus('Cast session ended.', '');
        }
      }
    );
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
    setStatus('Cast is not available here. Use a Cast-supported browser on HTTPS, or a native iOS/Android Cast app.', 'error');
    return;
  }

  const session = cast.framework.CastContext.getInstance().getCurrentSession();
  if (!session) {
    setStatus('Pick a device from the Cast icon first.', 'error');
    return;
  }

  session
    .sendMessage(CAST_NAMESPACE, {
      type: 'LOAD_YOUTUBE',
      videoId: video.videoId,
      originalUrl: video.canonicalUrl,
    })
    .then(() => {
      const deviceName = session?.getCastDevice?.().friendlyName || 'your device';
      setStatus(`Casting video ${video.videoId} to ${deviceName}.`, 'success');
    })
    .catch(() => {
      setStatus('Connected, but the receiver did not accept the video. Check your receiver app ID and HTTPS hosting.', 'error');
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
    setStatus('Cast chooser is unavailable here. This usually means the page is not on HTTPS, the browser is not Cast-enabled, or Cast support is not available on this device.', 'error');
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
    setStatus('No device was selected, or the Cast chooser could not open on this device/browser.', 'error');
  }
}

function loadSavedCastIdIntoUi() {
  receiverAppIdInput.value = getSavedCastAppId();
}

window.__onGCastApiAvailable = function (isAvailable) {
  castApiAvailable = Boolean(isAvailable);
  if (castApiAvailable) {
    const appId = getSavedCastAppId();
    if (appId) {
      initCastContext(appId);
    } else {
      setCastVisualState('ready', 'Add Cast ID');
    }
  } else {
    setCastVisualState('ready', 'Cast unavailable');
  }
};

window.onYouTubeIframeAPIReady = function () {
  youtubeReady = true;
  setStatus('Paste a valid YouTube link to begin.', '');
};

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
  receiverAppIdInput.value = '';
  setCastVisualState('ready', 'Add Cast ID');
  setStatus('Saved Cast receiver app ID cleared.', 'success');
});

copyLinkBtn.disabled = true;
castCurrentBtn.disabled = true;
renderHistory();
loadSavedCastIdIntoUi();
setCastVisualState('ready', getSavedCastAppId() ? 'Ready to cast' : 'Add Cast ID');
