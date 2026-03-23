"""FastAPI server for AIC2025 Video Search with DRES Submission & Gemini Query Refinement"""
import sys
import io
import os
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from fastapi import FastAPI, Form, File, UploadFile, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from PIL import Image

from config import KEYFRAME_ROOT, BASE_URL, PORT
from app_utils import make_json_safe, normalize_path
from milvus_beit3_v2 import encode_image, search_faiss, combine_results, run_search, index, metadata
from asr_search import search_asr_frames
from ocr_search import search_ocr
from object_filter import filter_results_by_objects

# === Import DRES and Gemini modules ===
try:
    from dres import get_fps, frame_to_time_ms, DRES_BASE, EVALUATION_ID, SESSION_ID
    import requests
    DRES_AVAILABLE = True
    print("✅ DRES module loaded")
except ImportError as e:
    print(f"⚠️ DRES module not available: {e}")
    DRES_AVAILABLE = False

try:
    from gemini_api import query_gemini
    GEMINI_AVAILABLE = True
    print("✅ Gemini module loaded")
except ImportError as e:
    print(f"⚠️ Gemini module not available: {e}")
    GEMINI_AVAILABLE = False

# === Setup App ===
app = FastAPI(title="AIC2025 Video Search API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# === Cache Middleware ===
class CacheMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        
        # Add cache headers for static files
        path = request.url.path
        if path.endswith(('.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.sw.js')):
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
            response.headers["Expires"] = "Thu, 31 Dec 2024 23:59:59 GMT"
        elif path.endswith(('.html', '.json')):
            response.headers["Cache-Control"] = "public, max-age=3600"
        elif path.startswith("/frames/"):
            # Cache images for 1 day
            response.headers["Cache-Control"] = "public, max-age=86400"
        
        return response

app.add_middleware(CacheMiddleware)

# === Mount Keyframes ===
app.mount("/frames", StaticFiles(directory=KEYFRAME_ROOT), name="frames")
print(f"✅ Mounted keyframes: {KEYFRAME_ROOT}")
print(f"✅ FAISS index: {index.ntotal} vectors")

# === Utilities ===
def path_to_url(path: str) -> str:
    """Convert normalized path to HTTP URL"""
    return f"{BASE_URL}/{path}"

# === Search API ===
@app.post("/api/search")
async def api_search(
    query: str = Form(""),
    next_q: str = Form(""),
    ocr_query: str = Form(""),
    asr_query: str = Form(""),
    objects: str = Form(""),
    require_all: bool = Form(False),
    topk: int = Form(100),
    image: UploadFile = File(None),
    use_expanded_prompt: bool = Form(True),
):
    """Multimodal search endpoint."""
    try:
        # Log received queries for debugging
        print(f"\n🔍 [SEARCH] Received query combination:")
        print(f"  Main query: '{query}'")
        print(f"  Next queries: '{next_q}'")
        print(f"  OCR query: '{ocr_query}'")
        print(f"  ASR query: '{asr_query}'")
        print(f"  Objects: '{objects}'")
        print(f"  TopK: {topk}")
        
        text_results, asr_results, ocr_results = [], [], []
        obj_filters = [o.strip() for o in objects.splitlines() if o.strip()]
        
        if query:
            print(f"📝 [SEARCH] Running text search for: '{query}'")
            text_results = run_search(
                search_query=query,
                next_queries=next_q.splitlines() if next_q else None,
                use_expanded_prompt=use_expanded_prompt,
                top_k=topk,
            )
            for r in text_results:
                r["path"] = normalize_path(r.get("file_path") or r.get("path"))
                r["file_path"] = r["path"]
            print(f"✅ [SEARCH] Text search returned {len(text_results)} results")
        
        if image and image.filename:
            try:
                content = await image.read()
                if len(content) > 0:
                    img = Image.open(io.BytesIO(content)).convert("RGB")
                    vec = encode_image(img)
                    img_results = search_faiss(vec, top_k=topk)
                    
                    existing_paths = {r["path"] for r in text_results}
                    for ir in img_results:
                        ir_path = normalize_path(ir["path"])
                        ir["path"] = ir_path
                        ir["file_path"] = ir_path
                        if ir_path in existing_paths:
                            for r in text_results:
                                if r["path"] == ir_path:
                                    r["similarity"] = max(r.get("similarity", 0), ir["similarity"])
                                    break
                        else:
                            text_results.append(ir)
            except Exception as e:
                print(f"⚠️ Image error: {e}")
        
        if ocr_query:
            print(f"📝 [SEARCH] Running OCR search for: '{ocr_query}'")
            ocr_results = search_ocr(ocr_query, top_k=topk)
            print(f"✅ [SEARCH] OCR search returned {len(ocr_results)} results")
        
        if asr_query:
            print(f"📝 [SEARCH] Running ASR search for: '{asr_query}'")
            asr_results = search_asr_frames(asr_query, top_k=topk)
            print(f"✅ [SEARCH] ASR search returned {len(asr_results)} results")
        
        print(f"🔄 [SEARCH] Combining results: text={len(text_results)}, asr={len(asr_results)}, ocr={len(ocr_results)}")
        combined = combine_results(text_results, asr_results, ocr_results)
        print(f"✅ [SEARCH] Combined results: {len(combined)} total")
        
        if obj_filters:
            combined = filter_results_by_objects(combined, obj_filters, require_all)
        
        results = combined[:topk]
        for r in results:
            r["url"] = path_to_url(r["path"])
        
        safe_results = make_json_safe(results)
        return JSONResponse({"status": "ok", "results": safe_results})
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


@app.get("/api/context/{frame_id}")
async def api_context(frame_id: str):
    """Get neighbor frames."""
    try:
        row = metadata[metadata["frame_id"] == frame_id]
        if row.empty:
            return JSONResponse({"status": "error", "message": f"Frame {frame_id} not found"}, status_code=404)
        
        idx = row.index[0]
        subset = metadata.iloc[max(0, idx - 12):min(len(metadata), idx + 13)]
        
        neighbors = [
            {"frame_id": str(r["frame_id"]), "path": normalize_path(r["path"]), "url": path_to_url(normalize_path(r["path"]))}
            for _, r in subset.iterrows()
        ]
        return JSONResponse({"status": "ok", "neighbors": neighbors})
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


@app.post("/api/submit-kis")
async def submit_kis(video_id: str = Form(...), frame_id: str = Form(...)):
    """Submit KIS to DRES"""
    if not DRES_AVAILABLE:
        raise HTTPException(status_code=503, detail="DRES module not available")
    try:
        frame_num = int(str(frame_id).lstrip('0') or '0')
        start_ms = frame_to_time_ms(video_id, frame_num)
        payload = {"answerSets": [{"answers": [{"mediaItemName": video_id, "start": start_ms, "end": start_ms}]}]}
        url = f"{DRES_BASE}/submit/{EVALUATION_ID}"
        r = requests.post(url, params={"session": SESSION_ID}, json=payload, timeout=15)
        r.raise_for_status()
        return JSONResponse(content={"status": "success", "data": r.json()})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/submit-qa")
async def submit_qa(video_id: str = Form(...), frame_id: str = Form(...), answer: str = Form(...)):
    """Submit QA to DRES - Format: QA-<answer>-<video_id>-<time_ms>"""
    if not DRES_AVAILABLE:
        raise HTTPException(status_code=503, detail="DRES module not available")
    try:
        # Convert frame_id to time_ms (same as KIS)
        frame_num = int(str(frame_id).lstrip('0') or '0')
        time_ms = frame_to_time_ms(video_id, frame_num)
        
        # Format: QA-<answer>-<video_id>-<time_ms>
        formatted_answer = f"QA-{answer}-{video_id}-{time_ms}"
        
        payload = {"answerSets": [{"answers": [{"text": formatted_answer}]}]}
        url = f"{DRES_BASE}/submit/{EVALUATION_ID}"
        r = requests.post(url, params={"session": SESSION_ID}, json=payload, timeout=15)
        r.raise_for_status()
        return JSONResponse(content={"status": "success", "data": r.json()})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/submit-trake")
async def submit_trake(frame_ids: str = Form(...)):
    """Submit TRAKE to DRES"""
    if not DRES_AVAILABLE:
        raise HTTPException(status_code=503, detail="DRES module not available")
    try:
        ids = [fid.strip() for fid in frame_ids.split(",") if fid.strip()]
        if not ids:
            raise ValueError("No frame IDs provided")
        first_id = ids[0]
        parts = first_id.split("_")
        if len(parts) >= 3:
            video_id = f"{parts[0]}_{parts[1]}"
            frames = [int(fid.split("_")[-1].lstrip('0') or '0') for fid in ids]
        else:
            raise ValueError(f"Invalid frame ID format: {first_id}")
        frames_str = ",".join(map(str, frames))
        payload = {"answerSets": [{"answers": [{"text": f"TR-{video_id}-{frames_str}"}]}]}
        url = f"{DRES_BASE}/submit/{EVALUATION_ID}"
        r = requests.post(url, params={"session": SESSION_ID}, json=payload, timeout=15)
        r.raise_for_status()
        return JSONResponse(content={"status": "success", "data": r.json()})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/refine-query")
async def refine_query(query: str = Form(...)):
    """Refine query using Gemini"""
    if not GEMINI_AVAILABLE:
        return JSONResponse(content={"status": "error", "message": "Gemini API not available"}, status_code=503)
    try:
        refined_query = query_gemini(query)
        return JSONResponse(content={"status": "success", "refined_query": refined_query})
    except Exception as e:
        return JSONResponse(content={"status": "error", "message": str(e)}, status_code=500)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)
