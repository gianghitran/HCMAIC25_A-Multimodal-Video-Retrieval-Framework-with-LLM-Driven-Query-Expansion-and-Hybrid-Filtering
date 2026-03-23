"""BEiT3 embedding model for multimodal search"""
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent / "beit3" / "unilm" / "beit3"))

import numpy as np
import torch
from torch.nn.functional import normalize
from torchvision import transforms
from PIL import Image
from transformers import XLMRobertaTokenizer
from googletrans import Translator
import faiss
import pandas as pd
import nltk
from nltk.corpus import wordnet
from config import FAISS_INDEX, METADATA_PATH, MODEL_WEIGHT, TOKENIZER_PATH
from app_utils import normalize_path

# === Setup ===
device = "cuda" if torch.cuda.is_available() else "cpu"
nltk.download("wordnet", quiet=True)
translator = Translator()

# === Load Model ===
from modeling_finetune import beit3_base_patch16_384_retrieval

def load_model():
    model = beit3_base_patch16_384_retrieval(pretrained=True)
    checkpoint = torch.load(MODEL_WEIGHT, map_location="cpu")
    model.load_state_dict(checkpoint["model"])
    return model.to(device).eval()

beit3_model = load_model()
tokenizer = XLMRobertaTokenizer(vocab_file=TOKENIZER_PATH)

# === Load FAISS Index ===
def load_faiss(index_path, metadata_path):
    """Load FAISS index with optimizations"""
    idx = faiss.read_index(index_path)
    meta = pd.read_parquet(metadata_path)
    
    # Display index info
    index_type = type(idx).__name__
    print(f"📊 FAISS Index Type: {index_type}")
    print(f"📊 Total vectors: {idx.ntotal:,}")
    
    # Optimize IVF indexes
    if hasattr(idx, 'nprobe'):
        # Set nprobe for better speed/accuracy balance
        # Higher nprobe = more accurate but slower
        idx.nprobe = 32  # Good balance: ~10-20ms, 97-99% recall
        print(f"📊 Set nprobe: {idx.nprobe}")
    
    # Try to move to GPU if available
    use_gpu = torch.cuda.is_available()
    if use_gpu:
        try:
            gpu_res = faiss.StandardGpuResources()
            # Move index to GPU
            idx = faiss.index_cpu_to_gpu(gpu_res, 0, idx)
            print(f"✅ FAISS index moved to GPU (CUDA device 0)")
        except Exception as e:
            print(f"⚠️  Could not move index to GPU: {e}")
            print(f"   Using CPU instead")
    else:
        print(f"📊 Using CPU (no GPU available)")
    
    return idx, meta

index, metadata = load_faiss(FAISS_INDEX, METADATA_PATH)

# === Encoders ===
def encode_text(query: str, max_len=64):
    """Encode text to embedding vector"""
    tokens = tokenizer.tokenize(query)
    token_ids = tokenizer.convert_tokens_to_ids(tokens)[:max_len - 2]
    tokens = [tokenizer.bos_token_id] + token_ids + [tokenizer.eos_token_id]
    
    padding_len = max_len - len(tokens)
    tokens_tensor = torch.tensor(tokens + [tokenizer.pad_token_id] * padding_len).reshape(1, -1).to(device)
    mask_tensor = torch.tensor([0] * len(tokens) + [1] * padding_len).reshape(1, -1).to(device)
    
    with torch.no_grad():
        _, text_emb = beit3_model(text_description=tokens_tensor, padding_mask=mask_tensor, only_infer=True)
        text_emb = normalize(text_emb, p=2, dim=-1)
    
    return text_emb.cpu().numpy().astype("float32")


def encode_image(image: Image.Image, image_size=384):
    """Encode image to embedding vector"""
    transform = transforms.Compose([
        transforms.Resize((image_size, image_size), interpolation=transforms.InterpolationMode.BICUBIC),
        transforms.ToTensor(),
    ])
    img = transform(image).unsqueeze(0).to(device)
    
    with torch.no_grad():
        feats, _ = beit3_model(image=img, only_infer=True)
        feats = normalize(feats, p=2, dim=-1)
    
    return feats.cpu().numpy().astype("float32")

# === Query Processing ===
def translate_to_english(text: str) -> str:
    """Translate text to English"""
    try:
        result = translator.translate(text, dest="en", src="auto")
        return result.text if result else text
    except:
        return text


def expand_query(query: str) -> str:
    """Expand query with synonyms using WordNet"""
    words = query.split()
    expanded = []
    
    for word in words:
        expanded.append(word)
        synonyms = set()
        for syn in wordnet.synsets(word):
            for lemma in syn.lemmas():
                synonyms.add(lemma.name())
        # Add 1 relevant synonym
        relevant = [s for s in synonyms if s != word][:1]
        expanded.extend(relevant)
    
    unique_words = " ".join(dict.fromkeys(expanded))
    return f"Find images related to: '{query}'. The scene may include: {unique_words}."

# === FAISS Search ===
def search_faiss(query_vec, top_k=100):
    """Search FAISS index and return enriched results (optimized)"""
    query_vec = np.array(query_vec).reshape(1, -1).astype("float32")
    faiss.normalize_L2(query_vec)
    
    # Optimize: reduce top_k if too large (faster search)
    # But keep at least top_k for user request
    search_k = min(top_k, 200)  # Cap at 200 for speed
    
    scores, ids = index.search(query_vec, search_k)
    
    # If we searched more than requested, trim results
    if search_k > top_k:
        scores = scores[:, :top_k]
        ids = ids[:, :top_k]
    
    results = []
    for rank, idx in enumerate(ids[0]):
        if idx == -1:
            continue
        
        row = metadata.iloc[idx]
        path = normalize_path(row["path"])
        
        results.append({
            "frame_id": row.get("frame_id", ""),
            "frame": row.get("index", -1),
            "path": path,
            "file_path": path,
            "similarity": float(scores[0][rank]),
            "combined_score": float(scores[0][rank]),
            "ocr_text": row.get("ocr_text", "")
        })
    
    return results

# === Result Fusion ===
def combine_results(text_results, asr_results, ocr_results, weights=(0.7, 0.15, 0.15)):
    """
    Kết hợp kết quả từ 3 modalities: Text (FAISS), ASR, OCR.
    
    Args:
        text_results: FAISS embedding search results
        asr_results: ASR Elasticsearch results
        ocr_results: OCR Elasticsearch results
        weights: (w_text, w_asr, w_ocr)
    
    Returns:
        Merged and sorted results by combined_score
    """
    combined = {}
    
    print(f"🔄 [COMBINE] Starting combination with weights: text={weights[0]}, asr={weights[1]}, ocr={weights[2]}")
    print(f"  Input: text={len(text_results)}, asr={len(asr_results)}, ocr={len(ocr_results)}")
    
    # 1. Process text results
    for r in text_results:
        fp = normalize_path(r.get("file_path") or r.get("path"))
        combined[fp] = r.copy()
        combined[fp]["file_path"] = fp
        combined[fp]["path"] = fp
        similarity = r.get("similarity", 0)
        combined[fp]["text_similarity"] = similarity  # Store original for debugging
        combined[fp]["combined_score"] = weights[0] * similarity
    
    print(f"  After text: {len(combined)} unique paths")
    
    # 2. Process ASR results
    asr_merged = 0
    asr_new = 0
    for r in asr_results:
        fp = normalize_path(r.get("file_path") or r.get("path"))
        
        similarity = r.get("similarity", 0)
        
        if fp not in combined:
            combined[fp] = r.copy()
            combined[fp]["file_path"] = fp
            combined[fp]["path"] = fp
            combined[fp]["combined_score"] = 0
            combined[fp]["text_similarity"] = 0  # No text match
            asr_new += 1
        else:
            # Merge ASR metadata
            if "asr_text" in r:
                combined[fp]["asr_text"] = r["asr_text"]
            asr_merged += 1
        
        # Store ASR similarity and add to combined score
        combined[fp]["asr_similarity"] = similarity
        combined[fp]["combined_score"] += weights[1] * similarity
    
    print(f"  After ASR: {len(combined)} total paths (merged: {asr_merged}, new: {asr_new})")
    
    # 3. Process OCR results
    ocr_merged = 0
    ocr_new = 0
    for r in ocr_results:
        fp = normalize_path(r.get("file_path") or r.get("path"))
        
        similarity = r.get("similarity", 0)
        
        if fp not in combined:
            combined[fp] = r.copy()
            combined[fp]["file_path"] = fp
            combined[fp]["path"] = fp
            combined[fp]["combined_score"] = 0
            combined[fp]["text_similarity"] = 0  # No text match
            combined[fp]["asr_similarity"] = 0  # No ASR match
            ocr_new += 1
        else:
            # Merge OCR metadata
            if "ocr_text" in r:
                combined[fp]["ocr_text"] = r["ocr_text"]
            ocr_merged += 1
        
        # Store OCR similarity and add to combined score
        combined[fp]["ocr_similarity"] = similarity
        combined[fp]["combined_score"] += weights[2] * similarity
    
    print(f"  After OCR: {len(combined)} total paths (merged: {ocr_merged}, new: {ocr_new})")
    
    # Sort by combined_score before normalization
    sorted_results = sorted(combined.values(), key=lambda x: x["combined_score"], reverse=True)
    
    # Normalize combined_score to [0, 1] so max score = 1.0 (100%)
    # This ensures consistent scoring whether searching individually or with fusion
    if sorted_results:
        max_combined = max(r["combined_score"] for r in sorted_results)
        if max_combined > 0:
            for r in sorted_results:
                r["combined_score"] /= max_combined
                # Set similarity field for compatibility with v7 frontend
                r["similarity"] = r["combined_score"]
        else:
            # If all scores are 0, set similarity to 0
            for r in sorted_results:
                r["similarity"] = 0.0
    
    # Log top 3 scores for debugging with detailed breakdown
    if sorted_results:
        print(f"  Top 3 combined scores (after normalization):")
        for i, r in enumerate(sorted_results[:3]):
            path = r.get('path', 'N/A')[:50]
            combined_score = r.get('combined_score', 0)
            
            # Get stored similarities (if available)
            text_sim = r.get("text_similarity", 0)
            asr_sim = r.get("asr_similarity", 0)
            ocr_sim = r.get("ocr_similarity", 0)
            
            text_contrib = weights[0] * text_sim
            asr_contrib = weights[1] * asr_sim
            ocr_contrib = weights[2] * ocr_sim
            
            print(f"    [{i+1}] {path}...")
            print(f"        Combined (normalized): {combined_score:.4f} = {text_contrib:.4f} (text) + {asr_contrib:.4f} (asr) + {ocr_contrib:.4f} (ocr)")
            print(f"        Raw sims: text={text_sim:.4f}, asr={asr_sim:.4f}, ocr={ocr_sim:.4f}")
    
    return sorted_results

# === Main Search ===
def run_search(
    search_query: str,
    next_queries=None,
    use_expanded_prompt=False,
    top_k=100,
    verbose=True
):
    """
    Text embedding search with multi-query fusion.
    
    NOTE: 
    - OCR/ASR search handled separately in main.py
    - Object filtering applied AFTER combine_results() in main.py
    
    Args:
        search_query: Main search query
        next_queries: List of additional queries for boosting overlapping frames
        use_expanded_prompt: Expand query with synonyms using WordNet
        top_k: Number of results to return
        verbose: Print debug info
    """
    # 1. Translate & expand
    translated = translate_to_english(search_query)
    prompt = expand_query(translated) if use_expanded_prompt else translated
    
    # 2. Main query search
    # Optimize: encode once, reuse if needed
    main_embedding = encode_text(prompt)
    results = search_faiss(main_embedding, top_k=top_k)
    for r in results:
        r["_source"] = "main"
    
    if verbose:
        print(f"🔍 Main: '{search_query}' -> {len(results)} results")
    
    # 3. Next queries (boost overlapping frames only)
    if next_queries:
        for nq in next_queries:
            tq = translate_to_english(nq)
            # Optimize: encode and search next query
            next_embedding = encode_text(tq)
            next_res = search_faiss(next_embedding, top_k=top_k)
            
            overlap_count = 0
            for nr in next_res:
                if nr["similarity"] < 0.45:  # Skip low similarity
                    continue
                
                # Find matching frame in main results
                matching = next((r for r in results if r["file_path"] == nr["file_path"]), None)
                if matching:
                    boost = 0.5 * nr["similarity"]
                    matching["combined_score"] += boost
                    matching.setdefault("_boosts", []).append({"query": nq, "boost": boost})
                    overlap_count += 1
            
            if verbose:
                print(f"↪️  Next: '{nq}' -> {overlap_count} frames boosted")
    
    # 4. Normalize scores & sort
    max_score = max((r["combined_score"] for r in results), default=1.0)
    for r in results:
        r["combined_score"] /= max_score
        # Set similarity field for compatibility with v7 frontend
        r["similarity"] = r["combined_score"]
    
    return sorted(results, key=lambda x: x["combined_score"], reverse=True)[:top_k]