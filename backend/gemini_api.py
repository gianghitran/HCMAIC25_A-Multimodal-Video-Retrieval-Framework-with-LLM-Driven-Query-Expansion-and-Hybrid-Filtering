# 📄 gemini_api.py
import os
from typing import Optional

import google.generativeai as genai

from config import GEMINI_API_KEYS


def _extract_text(response) -> Optional[str]:
    """Normalize Gemini SDK response objects to plain string."""
    if response is None:
        return None

    if hasattr(response, "text") and response.text:
        return response.text.strip()

    if hasattr(response, "output_text") and response.output_text:
        return response.output_text.strip()

    if hasattr(response, "candidates") and response.candidates:
        candidate = response.candidates[0]
        if hasattr(candidate, "text") and candidate.text:
            return candidate.text.strip()

        content = getattr(candidate, "content", None)
        if content and hasattr(content, "parts") and content.parts:
            first_part = content.parts[0]
            if hasattr(first_part, "text") and first_part.text:
                return first_part.text.strip()

    return None


def query_gemini(prompt: str, model: str = "") -> str:
    """
    Gửi prompt tới Gemini và trả về phản hồi text (hỗ trợ SDK mới).
    Tự động thử lần lượt các API key cho đến khi thành công.
    """
    system_prompt = """
    You are a Query Refinement Assistant for a multimodal video retrieval system (BEiT3 model).
    Your task: rewrite vague or non-English user queries into a compact and descriptive English sentence
    that clearly depicts the visual scene, objects, and actions mentioned.

    Output ONLY the refined English sentence — concise, natural, and grammatically correct.
    Do NOT include explanations or section headers.
    """

    last_error: Optional[Exception] = None

    for idx, api_key in enumerate(GEMINI_API_KEYS):
        try:
            genai.configure(api_key=api_key)
            use_model = model or os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
            gmodel = genai.GenerativeModel(use_model)
            response = gmodel.generate_content(f"{system_prompt}\nUser query: {prompt}")

            extracted = _extract_text(response)
            if extracted:
                return extracted

            return "⚠️ No valid text found in response."

        except Exception as exc:  # noqa: BLE001
            last_error = exc
            print(f"❌ Gemini key #{idx + 1} failed: {exc}")
            continue

    if last_error is not None:
        return f"Error: {last_error}"

    return "⚠️ No valid Gemini API key succeeded."
