import math
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python

class Landmark:
    """
    Custom representation of a landmark object as a point in 3D space.
    Coordinates are absolute w.r.t the image.
    """

    def __init__(self, x, y, z):
        self.x = int(x)
        self.y = int(y)
        self.z = round(z, 2)

    @classmethod
    def from_mp(cls, lm, img_shape):
        """Create Landmark from Mediapipe landmark"""
        return cls(lm.x * img_shape[1], lm.y * img_shape[0], lm.z)

    @staticmethod
    def midpoint(l1, l2):
        """Return midpoint between two landmarks"""
        return Landmark(
            (l1.x + l2.x) / 2,
            (l1.y + l2.y) / 2,
            (l1.z + l2.z) / 2
        )

    def draw(self, img, radius=5, color=(255, 0, 0), thickness=2):
        return cv2.circle(img, (self.x, self.y), radius, color, thickness)

    def show_attr(self, img, attr):
        font = cv2.FONT_HERSHEY_SIMPLEX
        color = (255, 255, 255)
        line_type = cv2.LINE_AA
        return cv2.putText(
            img,
            f"{attr}",
            (int(self.x + 0.01 * img.shape[1]), int(self.y - 0.01 * img.shape[1])),
            font,
            0.5,
            color,
            1,
            line_type,
        )

def angle(l1: Landmark, l2: Landmark) -> float:
    """Angle between line l1-l2 and horizontal"""
    x_diff = abs(l1.x - l2.x)
    y_diff = abs(l1.y - l2.y)
    dist = math.hypot(x_diff, y_diff)
    if dist == 0:
        return 0.0
    return round(math.degrees(math.acos(x_diff / dist)), 2)

def depth_diff(l1: Landmark, l2: Landmark):
    """Normalized depth difference"""
    depths = [-l1.z, -l2.z]
    return round(1 - abs(min(depths) / (max(depths) + 1e-5)), 2)

def line(img, l1: Landmark, l2: Landmark, color=(255, 255, 255), thickness=2, lineType=cv2.LINE_AA):
    return cv2.line(img, (l1.x, l1.y), (l2.x, l2.y), color, thickness, lineType)

# Mediapipe objects
PoseLandmarkerOptions = mp.tasks.vision.PoseLandmarkerOptions
VisionRunningMode = mp.tasks.vision.RunningMode
PoseLandmarker = mp.tasks.vision.PoseLandmarker

def createModel(model_path: str):
    """Load Mediapipe PoseLandmarker in VIDEO mode"""
    with open(model_path, "rb") as f:
        model_data = f.read()
        base_options = python.BaseOptions(model_asset_buffer=model_data)
        options = PoseLandmarkerOptions(
            base_options=base_options,
            running_mode=VisionRunningMode.VIDEO
        )
        return PoseLandmarker.create_from_options(options)
