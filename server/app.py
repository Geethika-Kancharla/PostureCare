from flask import Flask, Response, jsonify, request
from flask_cors import CORS
import cv2
import time
import mediapipe as mp
import numpy as np
import os
from util import Landmark, angle, line, depth_diff, createModel
import base64
from collections import deque

app = Flask(__name__)
CORS(app)

# Load model
model_path = os.path.join(os.path.dirname(__file__), "models", "pose_landmarker_heavy.task")
model = createModel(model_path)

# ---------- Video Capture ----------
cap = cv2.VideoCapture(0)

# Add midpoint method to Landmark
def landmark_midpoint(lm1: Landmark, lm2: Landmark) -> Landmark:
    return Landmark(
        (lm1.x + lm2.x) / 2,
        (lm1.y + lm2.y) / 2,
        (lm1.z + lm2.z) / 2
    )

Landmark.midpoint = staticmethod(landmark_midpoint)

# ---------- Smoothing & stability ----------
history_len = 5
stable_len = 3  # consecutive frames needed to trigger bad posture

metric_histories = {
    "head_angle": deque(maxlen=history_len),
    "shoulder_angle": deque(maxlen=history_len),
    "side_twist": deque(maxlen=history_len),
    "forward_lean": deque(maxlen=history_len)
}

posture_histories = {
    "head": deque(maxlen=stable_len),
    "shoulders": deque(maxlen=stable_len),
    "side_twist": deque(maxlen=stable_len),
    "forward_lean": deque(maxlen=stable_len)
}

def smooth(metric_name, value):
    history = metric_histories[metric_name]
    history.append(value)
    return sum(history) / len(history)

def check_stable(metric_name, is_bad):
    history = posture_histories[metric_name]
    history.append(is_bad)
    return sum(history) >= stable_len

# ---------- Analyze posture ----------
def analyze_posture_metrics(head, left_shoulder, right_shoulder):
    between_shoulders = Landmark.midpoint(left_shoulder, right_shoulder)

    # Raw metrics
    raw_head_angle = angle(head, between_shoulders)
    raw_shoulder_angle = angle(left_shoulder, right_shoulder)
    raw_side_twist = depth_diff(left_shoulder, right_shoulder)
    raw_forward_lean = depth_diff(head, between_shoulders)

    # Smoothed metrics
    head_angle = smooth("head_angle", raw_head_angle)
    shoulder_angle = smooth("shoulder_angle", raw_shoulder_angle)
    side_twist = smooth("side_twist", raw_side_twist)
    forward_lean = smooth("forward_lean", raw_forward_lean)

    # Check posture per metric
    bad_head = check_stable("head", head_angle < 80)
    bad_shoulders = check_stable("shoulders", abs(shoulder_angle) > 3.5)
    bad_side = check_stable("side_twist", side_twist > 0.45)
    bad_forward = check_stable("forward_lean", forward_lean < 0.75)

    # Aggregate issues
    issues = []
    if bad_head: issues.append("Head forward / rounded back")
    if bad_shoulders: issues.append("Shoulders uneven")
    if bad_side: issues.append("Side twist / lean")
    if bad_forward: issues.append("Forward lean detected")

    is_good_posture = len(issues) == 0

    metrics = {
        "head_angle": round(head_angle, 1),
        "shoulder_angle": round(shoulder_angle, 1),
        "side_twist": round(side_twist, 2),
        "forward_lean": round(forward_lean, 2)
    }

    return metrics, issues, is_good_posture, between_shoulders

# ---------- Helper function to analyze frame ----------
def analyze_frame(frame):
    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)
    timestamp = round(time.time() * 1000)
    result = model.detect_for_video(mp_image, timestamp)

    metrics = {}
    issues = []
    posture_text = "Good Posture"
    bad_posture = False

    if result.pose_landmarks:
        landmarks = result.pose_landmarks[0]

        head = Landmark.from_mp(landmarks[0], frame.shape)
        left_shoulder = Landmark.from_mp(landmarks[11], frame.shape)
        right_shoulder = Landmark.from_mp(landmarks[12], frame.shape)

        metrics, issues, is_good_posture, between_shoulders = analyze_posture_metrics(head, left_shoulder, right_shoulder)
        bad_posture = not is_good_posture
        posture_text = "Good Posture" if is_good_posture else "Bad Posture"

        # ---------- Draw on frame ----------
        frame_color = (0, 255, 0) if is_good_posture else (0, 0, 255)
        frame = head.draw(frame)
        frame = left_shoulder.draw(frame)
        frame = right_shoulder.draw(frame)
        frame = between_shoulders.draw(frame)
        frame = line(frame, head, between_shoulders, color=frame_color)
        frame = line(frame, left_shoulder, right_shoulder, color=frame_color)

        font = cv2.FONT_HERSHEY_SIMPLEX
        frame = head.show_attr(frame, f"Head: {metrics['head_angle']}°")
        frame = left_shoulder.show_attr(frame, f"Shoulder: {metrics['shoulder_angle']}°")
        frame = cv2.putText(frame, f"Side Twist: {metrics['side_twist']}", (10, 80), font, 0.7, frame_color, 2, cv2.LINE_AA)
        frame = cv2.putText(frame, f"Forward Lean: {metrics['forward_lean']}", (10, 110), font, 0.7, frame_color, 2, cv2.LINE_AA)
        frame = cv2.putText(frame, f"Posture: {posture_text}", (10, 140), font, 1, frame_color, 2, cv2.LINE_AA)

    return frame, metrics, issues, not bad_posture

# ---------- Video Feed ----------
def generate_frames():
    while True:
        success, frame = cap.read()
        if not success:
            break
        frame, _, _, _ = analyze_frame(frame)
        ret, buffer = cv2.imencode(".jpg", frame)
        frame_bytes = buffer.tobytes()
        yield (b"--frame\r\n"
               b"Content-Type: image/jpeg\r\n\r\n" + frame_bytes + b"\r\n")

@app.route("/video_feed")
def video_feed():
    return Response(generate_frames(),
                    mimetype="multipart/x-mixed-replace; boundary=frame")

# ---------- Health Check ----------
@app.route("/health")
def health():
    return jsonify({"status": "healthy", "message": "PostureCare active"})

# ---------- Analyze Posture Endpoint ----------
@app.route("/analyze_posture", methods=["POST"])
def analyze_posture():
    try:
        data = request.get_json()
        image_data = data.get("image")
        if not image_data:
            return jsonify({"success": False, "error": "No image provided"}), 400

        image_bytes = base64.b64decode(image_data.split(",")[1])
        np_arr = np.frombuffer(image_bytes, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        _, metrics, issues, is_good_posture = analyze_frame(frame)

        return jsonify({
            "success": True,
            "metrics": metrics,
            "issues": issues,
            "is_good_posture": is_good_posture
        })

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
