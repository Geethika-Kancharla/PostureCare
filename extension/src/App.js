import React, { useState, useRef, useEffect } from "react";

function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [postureResult, setPostureResult] = useState(null);
  const [error, setError] = useState(null);

  const SERVER_URL = "http://localhost:5000";

  // Start camera
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
      });
      videoRef.current.srcObject = stream;

      videoRef.current.onloadedmetadata = () => {
        videoRef.current.play();
        setIsStreaming(true);
        adjustCanvasSize();
      };
    } catch (err) {
      setError("Failed to access camera: " + err.message);
    }
  };

  // Adjust canvas to container size
  const adjustCanvasSize = () => {
    if (!canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;

    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
  };

  // Capture & analyze
  const captureAndAnalyze = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    setIsAnalyzing(true);
    setError(null);

    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

      const imageData = canvas.toDataURL("image/jpeg", 0.8);

      const response = await fetch(`${SERVER_URL}/analyze_posture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: imageData }),
      });

      const result = await response.json();

      if (result.success) {
        setPostureResult(result);
      } else {
        setError(result.error || "Analysis failed");
      }
    } catch (err) {
      setError("Analysis error: " + err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Draw overlay
  const drawOverlay = () => {
    if (!canvasRef.current || !videoRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    // Draw video frame
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

    if (!postureResult) return;
    const { metrics, issues, is_good_posture } = postureResult;

    // Posture status
    ctx.font = "bold 24px sans-serif";
    ctx.fillStyle = is_good_posture ? "lime" : "red";
    ctx.fillText(is_good_posture ? "Good Posture" : "Bad Posture", 20, 30);

    // Metrics
    if (metrics) {
      ctx.font = "18px monospace";
      ctx.fillStyle = "#fff";
      ctx.fillText(`Head Angle: ${metrics.head_angle}°`, 20, 60);
      ctx.fillText(`Shoulder Angle: ${metrics.shoulder_angle}°`, 20, 85);
      ctx.fillText(`Side Twist: ${metrics.side_twist}`, 20, 110);
      ctx.fillText(`Forward Lean: ${metrics.forward_lean}`, 20, 135);
    }

    // Issues
    if (issues && issues.length > 0) {
      ctx.font = "16px sans-serif";
      ctx.fillStyle = "yellow";
      issues.forEach((issue, i) => {
        ctx.fillText(`• ${issue}`, 20, 165 + i * 22);
      });
    }
  };

  // Continuous analysis
  useEffect(() => {
    let interval = null;
    if (isStreaming) {
      interval = setInterval(() => {
        if (!isAnalyzing) captureAndAnalyze();
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [isStreaming, isAnalyzing]);

  // Redraw overlay when postureResult updates
  useEffect(() => {
    drawOverlay();
  }, [postureResult]);

  // Adjust canvas on window resize
  useEffect(() => {
    window.addEventListener("resize", adjustCanvasSize);
    return () => window.removeEventListener("resize", adjustCanvasSize);
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
          className="absolute top-0 left-0 w-full h-full object-cover"
        />
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 w-full h-full pointer-events-none"
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
