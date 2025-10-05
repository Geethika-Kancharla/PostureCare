// Background service worker to keep analysis running via offscreen document

const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';
const OFFSCREEN_REASON = 'camera-analysis';
const ALARM_NAME = 'posture-analysis-loop';
const LOOP_INTERVAL_MINUTES = 1; // keepalive ping to avoid SW sleeping
const STORAGE_KEY_RUNNING = 'posture_running';

async function ensureOffscreenDocument() {
  const hasOffscreen = await chrome.offscreen.hasDocument?.();
  if (hasOffscreen) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ['USER_MEDIA'],
    justification: 'Continuous webcam capture and posture analysis in background'
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureOffscreenDocument();
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: LOOP_INTERVAL_MINUTES });
  const { [STORAGE_KEY_RUNNING]: running } = await chrome.storage.local.get(STORAGE_KEY_RUNNING);
  if (running) {
    chrome.runtime.sendMessage({ type: 'START' });
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureOffscreenDocument();
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: LOOP_INTERVAL_MINUTES });
  const { [STORAGE_KEY_RUNNING]: running } = await chrome.storage.local.get(STORAGE_KEY_RUNNING);
  if (running) {
    chrome.runtime.sendMessage({ type: 'START' });
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  try {
    await ensureOffscreenDocument();
    // ping offscreen to continue loop
    chrome.runtime.sendMessage({ type: 'KEEPALIVE' });
  } catch (e) {
    // no-op
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, _sendResponse) => {
  // allow popup to request starting background analysis
  if (!msg) return;
  if (msg.type === 'START_BACKGROUND_ANALYSIS' || msg.type === 'START') {
    chrome.storage.local.set({ [STORAGE_KEY_RUNNING]: true });
    ensureOffscreenDocument().then(() => {
      chrome.runtime.sendMessage({ type: 'OFFSCREEN_START' });
    });
  } else if (msg.type === 'STOP_BACKGROUND_ANALYSIS' || msg.type === 'STOP') {
    chrome.storage.local.set({ [STORAGE_KEY_RUNNING]: false });
    chrome.runtime.sendMessage({ type: 'OFFSCREEN_STOP' });
  }
});


