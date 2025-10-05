import math
import cv2
import numpy
import mediapipe as mp
from mediapipe.tasks import python
class Landmark:
   

    def __init__(self, x, y, z):
        self.x = int(x)
        self.y = int(y)
        self.z = round(z, 2)

    @classmethod
    def from_mp(cls, lm, img_shape):
        """
        Alternative constructor for Landmark object.
        Creates a landmark object from a mediapipe:landmark object
        """
        return cls(lm.x * img_shape[1], lm.y * img_shape[0], lm.z)

    def __str__(self):
        """
        Returns the string representation of the object
        """
        return f"{self.x}, {self.y}, {self.z}"

    def draw(
        self,
        img: numpy.ndarray,
        radius: int = 5,
        color: tuple = (255, 0, 0),
        thickness: int = 2,
    ):
        """
        Returns an image with the given landmark drawn on it
        """
        return cv2.circle(img, (self.x, self.y), radius, color, thickness)

    def show_attr(self, img: numpy.ndarray, attr):
        """
        Puts a given attribute of Landmark L next ot it on the image as text
        """
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
    """
    Returns the angle (in degrees) between a line (defined by two points; l1,l2) relative to a horizontal line
    """
    x_diff = abs(l1.x - l2.x)
    y_diff = abs(l1.y - l2.y)
    dist = pow(pow(x_diff, 2) + pow(y_diff, 2), 0.5)
    angle = round(math.degrees(math.acos(x_diff / dist)), 2)
    return angle


def depth_diff(l1: Landmark, l2: Landmark):
    """
    Returns the normalized difference between the two given landmarks' depth coordinates
    """
    depths = [-l1.z, -l2.z]
    return round(1 - abs((min(depths) / (max(depths) + 0.00001))), 1)


def line(
    img: numpy.ndarray,
    l1: Landmark,
    l2: Landmark,
    color: tuple = (255, 255, 255),
    thickness: int = 2,
    lineType=cv2.LINE_AA,
):
    """
    Returns an image with a line drawn between the two given landmarks
    """
    return cv2.line(img, (l1.x, l1.y), (l2.x, l2.y), color, thickness, lineType)

# objects for model initialization
PoseLandmarkerOptions = mp.tasks.vision.PoseLandmarkerOptions
VisionRunningMode = mp.tasks.vision.RunningMode
BaseOptions = mp.tasks.BaseOptions
PoseLandmarker = mp.tasks.vision.PoseLandmarker


def createModel(model_path: str):
    """
    Takes a model path and returns a mediapipe Poselandmarker obj with the specified model loaded.
    """
    with open(model_path, "rb") as f:
        model_data = f.read()
        model_options = python.BaseOptions(model_asset_buffer=model_data)
        options = PoseLandmarkerOptions(
            base_options=model_options,
            running_mode=VisionRunningMode.IMAGE,
        )
        return PoseLandmarker.create_from_options(options)