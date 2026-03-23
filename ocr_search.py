"""OCR (Optical Character Recognition) search using Elasticsearch"""
from typing import List, Dict, Any, Optional
import logging
from elasticsearch import Elasticsearch

# Compatibility: exception types across elasticsearch client versions (v7→v9)
try:
    from elasticsearch import exceptions as es_exceptions  # type: ignore
    ES_ERRORS = tuple(
        e for e in [
            getattr(es_exceptions, "ApiError", None),
            getattr(es_exceptions, "TransportError", None),
            getattr(es_exceptions, "ConnectionError", None),
            getattr(es_exceptions, "NotFoundError", None),
            getattr(es_exceptions, "AuthenticationException", None),
            getattr(es_exceptions, "ElasticsearchException", None),
        ] if e is not None
    )
except Exception:
    try:
        from elastic_transport import ApiError as _ApiError, ConnectionError as _ConnectionError  # type: ignore
        ES_ERRORS = (_ApiError, _ConnectionError)
    except Exception:
        ES_ERRORS = (Exception,)

from config import OCR_URL, OCR_API_KEY, OCR_INDEX, KEYFRAME_ROOT
from app_utils import path_to_frame_id, normalize_path

logger = logging.getLogger(__name__)
client = Elasticsearch(OCR_URL, api_key=OCR_API_KEY)

def _frame_id_to_path(frame_id: str) -> Optional[str]:
    """Best-effort: convert frame_id (e.g., L01_V001_00123) to path 'Videos_L01/L01_V001/123.jpg'"""
    try:
        video, frame = frame_id.rsplit("_", 1)
        batch = video[:3]
        frame_num = str(int(frame))  # remove leading zeros
        return f"Videos_{batch}/{video}/{frame_num}.jpg"
    except Exception:
        return None

def _vid_num_to_path(video_id: Optional[str], frame_id_num: Optional[int]) -> Optional[str]:
    """Construct path from (video_id, frame_id as number), e.g., K01_V008 + 28500 -> Videos_K01/K01_V008/28500.jpg"""
    try:
        if not video_id or frame_id_num is None:
            return None
        batch = video_id[:3]
        return f"Videos_{batch}/{video_id}/{int(frame_id_num)}.jpg"
    except Exception:
        return None


def search_ocr(
    query: str, 
    top_k: int = 20,
    mode: str = "match"
) -> List[Dict[str, Any]]:
    """
    Tìm frames theo OCR text.
    
    Args:
        query: Search text
        top_k: Number of results (max 10000)
        mode: "match" | "match_phrase" | "fuzzy"
    
    Returns:
        List[Dict]: [{frame_id, path, file_path, ocr_text, score, similarity}]
    """
    # Validate inputs
    if not query or not query.strip():
        logger.warning("Empty OCR query provided")
        return []
    
    if top_k <= 0:
        raise ValueError(f"top_k must be > 0, got: {top_k}")
    
    valid_modes = {"match", "match_phrase", "fuzzy"}
    if mode not in valid_modes:
        raise ValueError(f"Invalid mode: {mode}. Must be one of: {valid_modes}")
    
    # Build query
    text_queries = {
        "match": {"match": {"text": {"query": query, "operator": "or"}}},
        "match_phrase": {"match_phrase": {"text": query}},
        "fuzzy": {"fuzzy": {"text": {"value": query, "fuzziness": "AUTO"}}}
    }
    
    query_body = {
        "size": min(top_k, 10000),
        "query": text_queries[mode],
        "sort": [{"_score": {"order": "desc"}}]
    }
    
    # Execute search with error handling
    try:
        # Try new API first (ES 8+)
        try:
            res = client.search(index=OCR_INDEX, **query_body)
        except TypeError:
            # Fallback to old API (ES 7)
            res = client.search(index=OCR_INDEX, body=query_body)
    except ES_ERRORS as e:
        logger.error(f"OCR Elasticsearch search failed: {e}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error in OCR search: {e}")
        raise
    
    hits_section = res.get("hits", {})
    max_score = hits_section.get("max_score") or 1.0
    
    hits = []
    for hit in hits_section.get("hits", []):
        src = hit.get("_source", {})
        path = src.get("path", "")
        
        if not path:
            # Fallback 1: build path from (video_id, frame_id number)
            path = _vid_num_to_path(src.get("video_id"), src.get("frame_id")) or ""
        if not path:
            # Fallback 2: build path from string frame_id like L01_V001_00123
            fid = src.get("doc_id") or src.get("frame_id") or hit.get("_id")
            if isinstance(fid, str):
                path = _frame_id_to_path(fid) or ""
        
        if not path:
            continue
        
        # Normalize path (convert absolute to relative)
        if path.startswith(KEYFRAME_ROOT):
            path = path.replace(KEYFRAME_ROOT + "/", "")
        path = normalize_path(path)
        
        # Normalize ES score by this query's max_score -> [0, 1]
        raw_score = hit.get("_score", 0.0)
        normalized_score = (raw_score / max_score) if max_score and max_score > 0 else 0.0
        
        hits.append({
            "frame_id": path_to_frame_id(path),
            "path": path,
            "file_path": path,
            "ocr_text": src.get("text", ""),
            "score": raw_score,
            "similarity": normalized_score
        })
    
    return hits