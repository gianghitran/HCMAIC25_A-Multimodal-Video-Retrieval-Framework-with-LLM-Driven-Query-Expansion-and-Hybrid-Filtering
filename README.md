# HCMAIC25_A-Multimodal-Video-Retrieval-Framework-with-LLM-Driven-Query-Expansion-and-Hybrid-Filtering
A high-performance Multimodal Video Retrieval framework featuring LLM-driven query expansion (Gemini/GPT) and hybrid vector-text filtering. Top 50 Finalist at HCMC AI Challenge 2025.
Our paper is accepted publication pending at Proceedings of the 14th International Symposium on Information and Communication Technology (SOICT 2025)

# About 
HCMAIC25: Multimodal Video Retrieval Framework LLM-Driven Query Expansion & Hybrid Filtering
This repository contains the source code for our project in the HHo Chi Minh AI Challenge 2025 https://aichallenge.hochiminhcity.gov.vn/ (Top 50 Finalist). We developed a unified framework for large-scale video event retrieval, inspired by international benchmarks like LSC and VBS.

### Key Features
- Multimodal Search: Seamlessly retrieves video segments using natural language queries (Text-to-Video).
- LLM-Driven Expansion: Leverages Gemini/GPT-4o to refine, decompose, and expand Vietnamese queries into structured semantic units.
- Hybrid Filtering: Combines semantic vector search (Milvus) with lexical metadata filtering (ElasticSearch) for maximum precision.
- Advanced Extraction: Integrated pipeline using CLIP/BEiT-3 for visual embeddings, YOLOv12 for object detection, and ASR/OCR for temporal context.
- Vietnamese-Centric: Optimized for native Vietnamese linguistic nuances and complex natural language understanding.
### Technical Stack
- Models: CLIP, BEiT-3, YOLOv12, TransNetV2, Gemini/GPT APIs.
- Databases: Milvus (Vector DB), ElasticSearch, MongoDB.
- Backend: Python, PyTorch, FastAPI.