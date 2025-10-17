/* global chrome */

import React, { useState, useRef, useEffect } from "react";

function App() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [postureResult, setPostureResult] = useState(null);
  const [error, setError] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const continuousTimerRef = useRef(null);
  const [backgroundRunning, setBackgroundRunning] = useState(false);

  const SERVER_URL = "http://localhost:5000";

  const explainPermissionError = (err) => {
    const name = err && err.name ? err.name : "";
    const msg = err && err.message ? err.message : "";

    if (name === "NotAllowedError" || msg.toLowerCase().includes("permission")) {
      return (
        "Camera permission was dismissed or denied. " +
        "Please click Allow on the browser prompt. If the popup closes, " +
        "open the extension in a new tab and try again."
      );
    }
    if (name === "NotFoundError" || msg.toLowerCase().includes("no camera")) {
      return "No camera found. Please connect a camera and try again.";
    }
    return "Failed to access camera: " + msg;
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480, facingMode: "user" } 
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsStreaming(true);
      setError(null);
    } catch (err) {
      setError(explainPermissionError(err));
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsStreaming(false);
    if (continuousTimerRef.current) {
      clearInterval(continuousTimerRef.current);
      continuousTimerRef.current = null;
    }
  };

  const drawOverlay = (ctx, width, height, result, errMsg) => {
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, width, 70);

    ctx.fillStyle = "#fff";
    ctx.font = "16px sans-serif";

    if (errMsg) {
      ctx.fillStyle = "#fecaca";
      ctx.fillRect(0, height - 40, width, 40);
      ctx.fillStyle = "#991b1b";
      ctx.fillText(errMsg, 12, height - 15);
    }

    if (!result) {
      ctx.fillStyle = "#e5e7eb";
      ctx.fillText("Waiting for analysis...", 12, 28);
      return;
    }

    const isGood = !!result.is_good_posture;
    ctx.fillStyle = isGood ? "#22c55e" : "#ef4444";
    ctx.font = "bold 20px sans-serif";
    ctx.fillText(result.posture || (isGood ? "Good Posture" : "Bad Posture"), 12, 28);

    ctx.font = "14px sans-serif";
    ctx.fillStyle = "#e5e7eb";

    if (result.metrics) {
      const m = result.metrics;
      const metricsText = `Head: ${m.head_angle}\u00B0  Shoulder: ${m.shoulder_angle}\u00B0  Twist: ${m.side_twist}  Lean: ${m.forward_lean}`;
      ctx.fillText(metricsText, 12, 52);
    }

    if (result.issues && result.issues.length > 0) {
      ctx.fillStyle = "#fecaca";
      ctx.fillRect(0, 70, width, Math.min(24 + result.issues.length * 18, 120));
      ctx.fillStyle = "#7f1d1d";
      ctx.font = "14px sans-serif";
      ctx.fillText("Issues:", 12, 90);
      ctx.font = "13px sans-serif";
      result.issues.forEach((issue, i) => {
        ctx.fillText(`• ${issue}`, 18, 110 + i * 16);
      });
    }
  };

  const captureAndAnalyze = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    setIsAnalyzing(true);
    setError(null);

    try {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      const ctx = canvas.getContext('2d');

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      ctx.drawImage(video, 0, 0);

      const imageData = canvas.toDataURL('image/jpeg', 0.8);

      const response = await fetch(`${SERVER_URL}/analyze_posture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image: imageData }),
      });

      const result = await response.json();

      if (result.success) {
        setPostureResult(result);
        drawOverlay(ctx, canvas.width, canvas.height, result, null);
      } else {
        const errMsg = result.error || "Analysis failed";
        setError(errMsg);
        drawOverlay(ctx, canvas.width, canvas.height, postureResult, errMsg);
      }
    } catch (err) {
      const errMsg = "Failed to analyze posture: " + err.message;
      setError(errMsg);
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        drawOverlay(ctx, canvas.width, canvas.height, postureResult, errMsg);
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const startContinuousAnalysis = () => {
    if (continuousTimerRef.current) return;
    continuousTimerRef.current = setInterval(() => {
      if (isStreaming && !isAnalyzing) {
        captureAndAnalyze();
      }
    }, 2000);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  useEffect(() => {
    const loadState = async () => {
      try {
        const { posture_running } = await chrome.storage?.local?.get('posture_running') || {};
        setBackgroundRunning(!!posture_running);
        if (posture_running && !isStreaming) {
          await startCamera();
        }
      } catch (_) {}
    };
    loadState();

    const onMsg = (msg) => {
      if (!msg) return;
      if (msg.type === 'START' || msg.type === 'OFFSCREEN_START') setBackgroundRunning(true);
      if (msg.type === 'STOP' || msg.type === 'OFFSCREEN_STOP') setBackgroundRunning(false);
    };
    try { chrome.runtime.onMessage.addListener(onMsg); } catch (_) {}
    return () => {
      try { chrome.runtime.onMessage.removeListener(onMsg); } catch (_) {}
    };
  }, [isStreaming]);

  useEffect(() => {
    if (isStreaming) {
      startContinuousAnalysis();
    } else if (continuousTimerRef.current) {
      clearInterval(continuousTimerRef.current);
      continuousTimerRef.current = null;
    }
  }, [isStreaming]);

  const startBackground = async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'START_BACKGROUND_ANALYSIS' });
      setError(null);
      setBackgroundRunning(true);
      if (!isStreaming) {
        await startCamera();
      }
    } catch (e) {
      setError('Failed to start background analysis.');
    }
  };

  const stopBackground = async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'STOP_BACKGROUND_ANALYSIS' });
      setBackgroundRunning(false);
      stopCamera();
    } catch (_) {}
  };

  return (
    <div className="p-4 flex flex-col items-center justify-start bg-gray-100 h-full min-h-[600px]">
      <h1 className="text-xl font-bold mb-4 text-center">PostureCare</h1>
 
      <div className="w-full mb-4 relative">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full max-w-sm mx-auto rounded-lg"
          style={{ display: isStreaming ? 'block' : 'none' }}
        />
        <canvas
          ref={canvasRef}
          className="w-full max-w-sm mx-auto rounded-lg absolute top-0 left-1/2 -translate-x-1/2"
          style={{ display: isStreaming ? 'block' : 'none', pointerEvents: 'none' }}
        />
      </div>

  <div className="w-full max-w-sm mt-4 p-3 rounded-lg border bg-white">
    <div className="flex items-center justify-between">
      <div className="text-sm font-semibold">Background Analysis</div>
      <div className={`text-xs ${backgroundRunning ? 'text-green-600' : 'text-gray-500'}`}>
        {backgroundRunning ? 'Running' : 'Stopped'}
      </div>
    </div>
    <div className="mt-2 flex gap-2">
      {!backgroundRunning ? (
        <button
          className="px-3 py-1 bg-indigo-500 text-white rounded hover:bg-indigo-600"
          onClick={startBackground}
        >
          Start
        </button>
      ) : (
        <button
          className="px-3 py-1 bg-gray-700 text-white rounded hover:bg-gray-800"
          onClick={stopBackground}
        >
          Stop 
        </button>
      )}
    </div>
  
  </div>

      {postureResult && (
        <div className="w-full max-w-sm mt-4 p-4 rounded-lg border">
          <div className={`text-center font-bold text-lg mb-2 ${
            postureResult.is_good_posture ? 'text-green-600' : 'text-red-600'
          }`}>
            {postureResult.posture}
          </div>
          
          {postureResult.issues && postureResult.issues.length > 0 && (
            <div className="mb-3">
              <h3 className="font-semibold text-sm mb-1">Issues:</h3>
              <ul className="text-sm text-red-600">
                {postureResult.issues.map((issue, index) => (
                  <li key={index}>• {issue}</li>
                ))}
              </ul>
            </div>
          )}

          {postureResult.metrics && (
            <div className="text-xs text-gray-600">
              <div>Head Angle: {postureResult.metrics.head_angle}°</div>
              <div>Shoulder Angle: {postureResult.metrics.shoulder_angle}°</div>
              <div>Side Twist: {postureResult.metrics.side_twist}</div>
              <div>Forward Lean: {postureResult.metrics.forward_lean}</div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="w-full max-w-sm mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          <div className="mb-2">{error}</div>
         
            <button
              className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600"
              onClick={startCamera}
            >
              Error in fetching data
            </button>
       
        </div>
      )}

    </div>
  );
}

export default App;
