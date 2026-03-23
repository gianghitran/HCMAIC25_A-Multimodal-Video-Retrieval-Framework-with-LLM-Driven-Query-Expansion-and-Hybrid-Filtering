"""Object detection filtering using MongoDB"""
from typing import List, Dict, Any
from pymongo import MongoClient
from pymongo.collection import Collection
from config import MONGO_URI, DB_NAME, COLLECTION_NAME

# MongoDB connection (created once at module load)
client = MongoClient(MONGO_URI)
collection = client[DB_NAME][COLLECTION_NAME]


def filter_results_by_objects(
    results: List[Dict[str, Any]], 
    filters: List[str],
    require_all: bool = False
) -> List[Dict[str, Any]]:
    """
    Filter search results by detected objects in frames.
    
    Args:
        results: Search results with frame_id
        filters: Object names to filter (e.g., ["person", "car"])
        require_all: True = ALL objects, False = ANY object
    
    Returns:
        Filtered results
    """
    if not filters:
        return results
    
    filtered = []
    
    for result in results:
        frame_id = str(result.get("frame_id", "")).strip()
        if not frame_id:
            continue
        
        # Parse frame_id: "L26_V001_00009" -> video_id="L26_V001", frame_num=9
        try:
            parts = frame_id.split("_")
            video_id = f"{parts[0]}_{parts[1]}"
            frame_num = int(parts[2])
        except (IndexError, ValueError):
            continue
        
        # Query MongoDB (try both "9.jpg" and "00009.jpg" formats)
        docs = collection.find(
            {
                "video_id": video_id,
                "keyframe_id": {"$in": [f"{frame_num}.jpg", f"{str(frame_num).zfill(5)}.jpg"]}
            },
            {"class": 1, "_id": 0}
        )
        
        detected = [doc["class"] for doc in docs if "class" in doc]
        
        if not detected:
            continue
        
        # Check if frame matches filter criteria
        matches = all(obj in detected for obj in filters) if require_all else any(obj in detected for obj in filters)
        
        if matches:
            filtered.append(result)
    
    return filtered