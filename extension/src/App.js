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

  // Start camera on mount
  useEffect(() => {
    startCamera();
  }, []);

  return (
    <div className="flex flex-col items-center p-6 bg-gray-900 min-h-screen text-white">
      <h1 className="text-3xl font-bold mb-6 text-center">PostureCare Live</h1>

      <div
        ref={containerRef}
        className="relative w-full max-w-4xl aspect-video border-2 border-gray-700 rounded-xl overflow-hidden shadow-lg"
      >
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

      {error && (
        <div className="mt-4 p-2 bg-red-800 text-red-100 rounded">
          {error}
        </div>
      )}
    </div>
  );
}

export default App;
