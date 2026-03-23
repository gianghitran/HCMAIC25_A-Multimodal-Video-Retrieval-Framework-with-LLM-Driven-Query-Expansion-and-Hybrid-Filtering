"""ASR (Automatic Speech Recognition) search using Elasticsearch 9.x"""
from typing import List, Dict, Any, Optional
import logging
import math
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

from config import ASR_ELASTIC_URL, ASR_API_KEY, ASR_INDEX, KEYFRAME_ROOT
from app_utils import compose_frame_id, normalize_path

logger = logging.getLogger(__name__)
client = Elasticsearch(ASR_ELASTIC_URL, api_key=ASR_API_KEY)


def search_asr_frames(
    query: str,
    top_k: int = 20,
    video_id: Optional[str] = None,
    time_from: Optional[float] = None,
    time_to: Optional[float] = None,
    mode: str = "match",
    normalize_method: str = "max_score"
) -> List[Dict[str, Any]]:
    """
    Search keyframes by ASR transcript.
    
    Args:
        query: Search text
        top_k: Number of results (max 10000)
        video_id: Filter by specific video
        time_from: Time range start (seconds)
        time_to: Time range end (seconds)
        mode: "match" | "match_phrase" | "fuzzy"
        normalize_method: "max_score" | "sigmoid" | "clip"
    
    Returns:
        List of frames with similarity scores
    """
    _validate_inputs(query, top_k, time_from, time_to, mode)
    
    # Build query
    query_body = _build_query(query, mode, video_id, time_from, time_to)
    query_body["size"] = min(top_k, 10000)
    query_body["sort"] = [{"_score": {"order": "desc"}}]
    query_body["_source"] = [
        "video_id", "text", "start_time", "end_time",
        "frames", "frame_paths", "keyframe_index", "keyframe_path"
    ]
    
    # Execute search
    try:
        response = client.search(index=ASR_INDEX, **query_body)
    except ES_ERRORS as e:
        logger.error(f"ES search failed: {e}")
        raise
    
    # Parse results
    frames = _parse_results(response, normalize_method=normalize_method)
    
    _log_search_info(query, mode, video_id, time_from, time_to, response, frames)
    return frames


def _validate_inputs(
    query: str, 
    top_k: int, 
    time_from: Optional[float],
    time_to: Optional[float],
    mode: str
) -> None:
    """Validate search parameters"""
    if not query or not query.strip():
        raise ValueError("Query cannot be empty")
    
    if top_k <= 0:
        raise ValueError(f"top_k must be > 0, got: {top_k}")
    
    if time_from is not None and time_to is not None and time_from > time_to:
        raise ValueError(f"time_from ({time_from}) > time_to ({time_to})")
    
    valid_modes = {"match", "match_phrase", "fuzzy"}
    if mode not in valid_modes:
        raise ValueError(f"Invalid mode: {mode}. Must be one of: {valid_modes}")


def _build_query(
    query: str,
    mode: str,
    video_id: Optional[str],
    time_from: Optional[float],
    time_to: Optional[float]
) -> dict:
    """Build Elasticsearch query"""
    # Text query
    text_queries = {
        "match": {"match": {"text": {"query": query, "operator": "or"}}},
        "match_phrase": {"match_phrase": {"text": query}},
        "fuzzy": {"fuzzy": {"text": {"value": query, "fuzziness": "AUTO"}}}
    }
    
    # Filters
    filters = []
    if video_id:
        filters.append({"term": {"video_id": video_id}})
    
    # Time range: segment overlaps with [time_from, time_to]
    if time_from is not None:
        filters.append({"range": {"end_time": {"gte": time_from}}})
    if time_to is not None:
        filters.append({"range": {"start_time": {"lte": time_to}}})
    
    return {
        "query": {
            "bool": {
                "must": [text_queries[mode]],
                "filter": filters
            }
        }
    }


def _parse_results(response: dict, normalize_method: str) -> List[Dict[str, Any]]:
    """Parse Elasticsearch response to frame list"""
    hits = response.get("hits", {})
    max_score = hits.get("max_score") or 1.0
    
    frames = []
    for hit in hits.get("hits", []):
        src = hit["_source"]
        raw_score = hit.get("_score", 0.0)
        
        # Extract frame data
        keyframe_idx = _get_keyframe_index(src)
        frame_path = _get_frame_path(src)
        
        # Skip if no frame available (silently)
        if keyframe_idx is None and not frame_path:
            continue
        
        # Normalize path
        if frame_path:
            frame_path = _normalize_frame_path(frame_path)
        
        # Generate frame_id
        frame_id = _generate_frame_id(src.get("video_id"), keyframe_idx, frame_path)
        
        frames.append({
            "frame_id": frame_id,
            "path": frame_path,
            "file_path": frame_path,
            "video_id": src.get("video_id"),
            "asr_text": src.get("text", ""),
            "start_time": src.get("start_time"),
            "end_time": src.get("end_time"),
            "score": raw_score,
            "similarity": _normalize_score(raw_score, max_score, normalize_method)
        })
    
    return frames


def _get_keyframe_index(src: dict) -> Optional[int]:
    """Extract keyframe index from source"""
    frames = src.get("frames")
    if frames and len(frames) > 0:
        return frames[0]
    return src.get("keyframe_index")


def _get_frame_path(src: dict) -> Optional[str]:
    """Extract frame path from source"""
    frame_paths = src.get("frame_paths")
    if frame_paths and len(frame_paths) > 0:
        return frame_paths[0]
    return src.get("keyframe_path")


def _normalize_frame_path(path: str) -> str:
    """Convert absolute path to relative"""
    if path.startswith(KEYFRAME_ROOT):
        path = path.replace(KEYFRAME_ROOT + "/", "")
    return normalize_path(path)


def _generate_frame_id(
    video_id: Optional[str], 
    keyframe_idx: Optional[int],
    frame_path: Optional[str]
) -> Optional[str]:
    """Generate unique frame identifier"""
    if keyframe_idx is not None:
        return compose_frame_id(video_id, keyframe_idx)
    
    if frame_path:
        safe_path = frame_path.replace('/', '_').replace('.', '_')
        return f"{video_id}_{safe_path}"
    
    return None


def _normalize_score(raw_score: float, max_score: float, method: str) -> float:
    """Normalize raw score to [0, 1]"""
    if method == "sigmoid":
        return 1 / (1 + math.exp(-raw_score / 5))
    
    if method == "clip":
        return min(raw_score / 20.0, 1.0)
    
    # Default: max_score
    return raw_score / max_score if max_score > 0 else 0.0


def _log_search_info(
    query: str,
    mode: str,
    video_id: Optional[str],
    time_from: Optional[float],
    time_to: Optional[float],
    response: dict,
    frames: List[dict]
) -> None:
    """Log search information"""
    total = response.get("hits", {}).get("total", {}).get("value", 0)
    logger.info(
        f"ASR search: query='{query[:50]}...', mode={mode}, "
        f"video={video_id or 'all'}, time=[{time_from}, {time_to}], "
        f"found={len(frames)}/{total}"
    )


# ============ HELPER FUNCTIONS ============

def validate_asr_index() -> bool:
    """Check if ASR index exists and has data"""
    try:
        if not client.indices.exists(index=ASR_INDEX):
            logger.error(f"ASR index does not exist: {ASR_INDEX}")
            return False
        
        count = client.count(index=ASR_INDEX)["count"]
        logger.info(f"ASR index '{ASR_INDEX}' has {count:,} documents")
        return count > 0

    except ES_ERRORS as e:
        logger.error(f"Failed to validate ASR index: {e}")
        return False


def get_asr_stats() -> Dict[str, Any]:
    """Get statistics about ASR index"""
    try:
        # Total documents
        total = client.count(index=ASR_INDEX)["count"]
        
        # Aggregations
        agg_response = client.search(
            index=ASR_INDEX,
            size=0,
            aggs={
                "unique_videos": {
                    "cardinality": {"field": "video_id"}
                },
                "avg_duration": {
                    "avg": {
                        "script": {
                            "source": """
                                if (doc['end_time'].size() == 0 || doc['start_time'].size() == 0) {
                                    return 0;
                                }
                                return doc['end_time'].value - doc['start_time'].value;
                            """,
                            "lang": "painless"
                        }
                    }
                },
                "total_duration": {
                    "sum": {
                        "script": {
                            "source": """
                                if (doc['end_time'].size() == 0 || doc['start_time'].size() == 0) {
                                    return 0;
                                }
                                return doc['end_time'].value - doc['start_time'].value;
                            """,
                            "lang": "painless"
                        }
                    }
                }
            }
        )
        
        aggs = agg_response["aggregations"]
        avg_duration = aggs["avg_duration"]["value"]
        total_duration = aggs["total_duration"]["value"]
        
        return {
            "total_segments": total,
            "unique_videos": int(aggs["unique_videos"]["value"]),
            "avg_segment_duration": round(avg_duration, 2),
            "total_duration_hours": round(total_duration / 3600, 2)
        }
    
    except ES_ERRORS as e:
        logger.error(f"Failed to get ASR stats: {e}")
        return {}


def health_check() -> Dict[str, Any]:
    """Comprehensive health check"""
    try:
        # Cluster health
        cluster = client.cluster.health()
        
        # Index exists
        index_exists = client.indices.exists(index=ASR_INDEX)
        
        # Document count
        doc_count = 0
        if index_exists:
            doc_count = client.count(index=ASR_INDEX)["count"]
        
        return {
            "status": "healthy" if cluster["status"] == "green" else "degraded",
            "cluster_status": cluster["status"],
            "index_exists": index_exists,
            "document_count": doc_count,
            "can_search": index_exists and doc_count > 0
        }
    
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            "status": "unhealthy",
            "error": str(e)
        }