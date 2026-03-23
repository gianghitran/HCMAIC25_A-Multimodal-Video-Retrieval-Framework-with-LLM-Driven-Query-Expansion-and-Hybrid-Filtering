"""Shared utility functions"""
import os
import re
import numpy as np
from config import KEYFRAME_ROOT

def normalize_path(path: str) -> str:
    """Chuẩn hóa path từ nhiều format về local path"""
    if not path:
        return ""
    
    kaggle_prefixes = [
        "/kaggle/input/aic25-keyframes",
        "/kaggle/input/aic-keyframes",
        "/home/w1-helio/kaggle/input/aic-keyframes",
        "D:/kaggle/input/aic-keyframes"
    ]
    
    # Remove kaggle prefix
    for prefix in kaggle_prefixes:
        if path.startswith(prefix):
            path = path.replace(prefix + "/", "")
            break
    
    # Remove keyframe root if exists
    if path.startswith(KEYFRAME_ROOT):
        path = path.replace(KEYFRAME_ROOT + "/", "")
    
    # Add Videos_ prefix if missing
    if re.match(r"^([LK]\d+)_V\d+/", path):
        batch = path[:3]  # L01, K10, etc
        path = f"Videos_{batch}/{path}"
    
    return path


def make_json_safe(obj):
    """Convert NumPy/Pandas types to native Python for JSON"""
    if isinstance(obj, dict):
        return {k: make_json_safe(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [make_json_safe(i) for i in obj]
    elif isinstance(obj, (np.integer,)):
        return int(obj)
    elif isinstance(obj, (np.floating,)):
        return float(obj)
    elif isinstance(obj, (np.ndarray,)):
        return obj.tolist()
    return obj


def path_to_frame_id(path: str) -> str:
    """Convert path to frame_id: L01_V001/123.jpg -> L01_V001_00123"""
    parts = path.split("/")
    if len(parts) >= 2:
        video = parts[-2]  # L01_V001
        frame = parts[-1].split(".")[0].zfill(5)  # 00123
        return f"{video}_{frame}"
    return path


def compose_frame_id(video_id: str, keyframe_index: int) -> str:
    """Compose frame_id from video_id and keyframe_index"""
    try:
        return f"{video_id}_{str(int(keyframe_index)).zfill(5)}"
    except:
        return None