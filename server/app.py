from flask import Flask, request, jsonify
from flask_cors import CORS
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import base64
import io
from PIL import Image
import sys
import os

from util import Landmark, angle, depth_diff, createModel
from collections import deque, defaultdict

app = Flask(__name__)
CORS(app) 

model_path = os.path.join(os.path.dirname(__file__), 'pose_landmarker_heavy.task')
model = createModel(model_path)

# Simple temporal smoothing buffers per client
SMOOTH_WINDOW = 5
metric_history = defaultdict(lambda: deque(maxlen=SMOOTH_WINDOW))

def _client_key():
    # Use remote_addr + user-agent as a best-effort key
    try:
        ua = request.headers.get('User-Agent', '')
        return f"{request.remote_addr}|{ua[:64]}"
    except Exception:
        return "unknown"

def _detect_pose(mp_image):
    """Compatibility layer: prefer detect(); fall back to detect_for_image()."""
    if hasattr(model, 'detect'):
        return model.detect(mp_image)
    if hasattr(model, 'detect_for_image'):
        return model.detect_for_image(mp_image)
    raise AttributeError('PoseLandmarker has neither detect nor detect_for_image')

def process_image(image_data):
    """
    Process the base64 image data and return posture analysis
    """
    try:
        # Decode base64 image
        image_bytes = base64.b64decode(image_data.split(',')[1])
        image = Image.open(io.BytesIO(image_bytes))
        
        # Convert PIL image to OpenCV format
        frame = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        
        # Convert for Mediapipe
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)
        
        # Pose detection (IMAGE mode)
        result = _detect_pose(mp_image)
        
        if result.pose_landmarks and len(result.pose_landmarks) > 0:
            landmarks = result.pose_landmarks[0]
            
            # Extract key landmarks
            head = Landmark.from_mp(landmarks[0], frame.shape)
            left_shoulder = Landmark.from_mp(landmarks[11], frame.shape)
            right_shoulder = Landmark.from_mp(landmarks[12], frame.shape)
            between_shoulders = Landmark(
                (left_shoulder.x + right_shoulder.x)/2,
                (left_shoulder.y + right_shoulder.y)/2,
                (left_shoulder.z + right_shoulder.z)/2
            )
            # Calculate posture metrics (original four)
            head_angle = angle(head, between_shoulders)
            shoulder_angle = angle(left_shoulder, right_shoulder)
            side_twist = depth_diff(left_shoulder, right_shoulder)
            
            # Smoothing
            client_key = _client_key()
            current_metrics = {
                "head_angle": head_angle,
                "shoulder_angle": shoulder_angle,
                "side_twist": side_twist
            }
            metric_history[client_key].append(current_metrics)
            hist = metric_history[client_key]
            smoothed = {k: float(np.mean([m[k] for m in hist])) for k in current_metrics.keys()}

            # Posture classification (thresholds tuned conservatively)
            bad_posture = False
            issues = []
            
            if smoothed["head_angle"] < 80:
                bad_posture = True
                issues.append("Head angle too low")
            if smoothed["shoulder_angle"] > 3.5:
                bad_posture = True
                issues.append("Shoulders uneven")
            if smoothed["side_twist"] > 0.45:
                bad_posture = True
                issues.append("Side twist detected")
          
            
            return {
                "success": True,
                "posture": "Bad Posture" if bad_posture else "Good Posture",
                "is_good_posture": not bad_posture,
                "issues": issues,
                "metrics": {
                    "head_angle": round(smoothed["head_angle"], 2),
                    "shoulder_angle": round(smoothed["shoulder_angle"], 2),
                    "side_twist": round(smoothed["side_twist"], 2)
                }
            }
        else:
            return {
                "success": False,
                "error": "No pose detected in image"
            }
            
    except Exception as e:
        return {
            "success": False,
            "error": f"Pose analysis error: {str(e)}"
        }

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "healthy", "message": "PostureCare server is running"})

@app.route('/analyze_posture', methods=['POST'])
def analyze_posture():
    try:
        data = request.get_json()
        
        if not data or 'image' not in data:
            return jsonify({
                "success": False,
                "error": "No image data provided"
            }), 400
        
        result = process_image(data['image'])
        return jsonify(result)
        
    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"Server error: {str(e)}"
        }), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
