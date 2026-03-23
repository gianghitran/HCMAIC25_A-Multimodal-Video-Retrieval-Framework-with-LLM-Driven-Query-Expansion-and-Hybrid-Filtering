"""Configuration constants"""
import os

# === Paths ===
KEYFRAME_ROOT = "/home/w1-helio/Downloads/keyframes"
FAISS_INDEX = "/home/w1-helio/AIC25-v2/embeddings/beit3_faiss_flat.index"
METADATA_PATH = "/home/w1-helio/AIC25-v2/embeddings/beit3_all_metadata.parquet"
MODEL_WEIGHT = "/home/w1-helio/AIC25-v2/beit3/beit3_base_patch16_384_coco_retrieval.pth"
TOKENIZER_PATH = "/home/w1-helio/AIC25-v2/beit3/beit3.spm"

# === Elasticsearch ===
ASR_ELASTIC_URL = os.getenv("ASR_ELASTIC_URL", "https://9a399c3d9f33456097b1359c3e3b6e9d.us-central1.gcp.cloud.es.io:443")
ASR_API_KEY = os.getenv("ASR_API_KEY", "UjZhdUw1b0Jzc2FqRlMwdzBZdDc6Z2JDWWpjUTM3THRiU3AzbUp5ZkNtdw==")
ASR_INDEX = os.getenv("ASR_INDEX", "asr-search")
OCR_URL = os.getenv("OCR_ELASTIC_URL", "https://9a399c3d9f33456097b1359c3e3b6e9d.us-central1.gcp.cloud.es.io:443")
OCR_API_KEY = os.getenv("OCR_API_KEY", "UjZhdUw1b0Jzc2FqRlMwdzBZdDc6Z2JDWWpjUTM3THRiU3AzbUp5ZkNtdw==")
OCR_INDEX = os.getenv("OCR_INDEX", "ocr-search")

# === MongoDB ===
MONGO_URI = "mongodb+srv://nguyentheluan27052005vl_db_user:inseclabhelio123@cluster0.tidgump.mongodb.net/?retryWrites=true&w=majority"
DB_NAME = "obj-detection"
COLLECTION_NAME = "object-detection-results"

# === API ===
PORT = int(os.getenv("PORT", "7861"))
API_HOST = os.getenv("API_HOST", "127.0.0.1")
BASE_URL = os.getenv("BASE_URL", f"http://{API_HOST}:{PORT}/frames")

# === Gemini ===
_DEFAULT_GEMINI_KEY = "AIzaSyCsnnCSuGtihfmSJxX3cJxJpC_5z5G8Scs"
_raw_gemini_keys = os.getenv("GEMINI_API_KEYS", "").strip()

if _raw_gemini_keys:
    GEMINI_API_KEYS = [key.strip() for key in _raw_gemini_keys.split(",") if key.strip()]
else:
    fallback_keys = [
        os.getenv("AIzaSyCggYCEWlgD39zagzVJ8XY5c5mawFKVNH0"),
        os.getenv("GEMINI_API_KEY_PRIMARY"),
        os.getenv("GEMINI_API_KEY_SECONDARY"),
        os.getenv("GEMINI_API_KEY_TERTIARY"),
    ]
    GEMINI_API_KEYS = [key for key in fallback_keys if key]

if not GEMINI_API_KEYS:
    GEMINI_API_KEYS = [_DEFAULT_GEMINI_KEY]

# === DRES ===
DRES_BASE = os.getenv("DRES_BASE", "https://eventretrieval.oj.io.vn/api/v2")
EVALUATION_ID = os.getenv("DRES_EVALUATION_ID", "03a5b5b4-761e-4222-8478-c499900fb28f")
SESSION_ID = os.getenv("DRES_SESSION_ID", "_rKMVwCYMtxB9xaUSROWJHjJnR49ji3g")
FPS_CSV_PATH = os.getenv("FPS_CSV_PATH", "/home/w1-helio/AIC25-v2/backend/video_fps.csv")