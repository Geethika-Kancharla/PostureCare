const SERVER_URL = 'http://localhost:5000';
const video = document.getElementById('v');
const canvas = document.getElementById('c');
let stream = null;
let timer = null;

async function start() {
  if (stream) return;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } });
    video.srcObject = stream;
    await video.play().catch(() => {});
    loop();
  } catch (e) {
    // Permission may require user gesture; retries will be triggered by keepalive
  }
}

async function analyzeOnce() {
  if (!video.videoWidth || !video.videoHeight) return;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0);
  const imageData = canvas.toDataURL('image/jpeg', 0.8);
  try {
    await fetch(`${SERVER_URL}/analyze_posture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: imageData })
    });
  } catch (_) {}
}

function loop() {
  if (timer) return;
  timer = setInterval(analyzeOnce, 2000);
}

async function isRunning() {
  try {
    const { posture_running } = await chrome.storage?.local?.get('posture_running') || {};
    return !!posture_running;
  } catch (_) {
    return false;
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg) return;
  if (msg.type === 'KEEPALIVE') {
    isRunning().then((running) => { if (running && !stream) start(); });
  } else if (msg.type === 'OFFSCREEN_START') {
    start();
  } else if (msg.type === 'OFFSCREEN_STOP') {
    if (timer) { clearInterval(timer); timer = null; }
    if (stream) {
      try { stream.getTracks().forEach(t => t.stop()); } catch (_) {}
      stream = null;
    }
  }
});


