import os
import sys
import io
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))
import csv
import requests
from fastapi import FastAPI, Form, HTTPException
from fastapi.responses import JSONResponse
from config import FPS_CSV_PATH, DRES_BASE, EVALUATION_ID, SESSION_ID

app = FastAPI(title="DRES Submission API")


def load_fps_table(csv_path=FPS_CSV_PATH):
    fps_table = {}
    if not os.path.exists(csv_path):
        return fps_table
    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            vid = row.get("video_id") or row.get("VideoID") or row.get("id")
            fps = row.get("fps") or row.get("FPS")
            if vid and fps:
                try:
                    fps_table[vid.strip()] = float(fps)
                except:
                    continue
    return fps_table


FPS_TABLE = load_fps_table()


def get_fps(video_id: str) -> float:
    return FPS_TABLE.get(video_id, 30.0)


def frame_to_time_ms(video_id: str, frame_index: int) -> int:
    fps = get_fps(video_id)
    return int((frame_index / fps) * 1000)


@app.post("/api/submit-qa")
async def submit_qa(number: int = Form(...), videos_ID: str = Form(...), time: int = Form(...)):
    body_data = {
        "answerSets": [
            {"answers": [{"text": f"QA-{number}-{videos_ID}-{time}"}]}
        ]
    }
    url = f"{DRES_BASE}/submit/{EVALUATION_ID}"
    params = {"session": SESSION_ID}
    try:
        response = requests.post(url, params=params, json=body_data)
        response.raise_for_status()
        return JSONResponse(content=response.json())
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/submit-kis")
async def submit_kis(videos_ID: str = Form(...), frame_start: int = Form(...), frame_end: int = Form(...)):
    start_ms = frame_to_time_ms(videos_ID, frame_start)
    end_ms = frame_to_time_ms(videos_ID, frame_end)
    body_data = {
        "answerSets": [
            {
                "answers": [
                    {"mediaItemName": videos_ID, "start": start_ms, "end": end_ms}
                ]
            }
        ]
    }
    url = f"{DRES_BASE}/submit/{EVALUATION_ID}"
    params = {"session": SESSION_ID}
    try:
        response = requests.post(url, params=params, json=body_data)
        response.raise_for_status()
        return JSONResponse(content=response.json())
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/submit-trake")
async def submit_trake(videos_ID: str = Form(...), frame_ids: str = Form(...)):
    frames = [int(f.strip()) for f in frame_ids.split(",") if f.strip()]
    frames_str = ",".join(map(str, frames))
    body_data = {
        "answerSets": [
            {"answers": [{"text": f"TR-{videos_ID}-{frames_str}"}]}
        ]
    }
    url = f"{DRES_BASE}/submit/{EVALUATION_ID}"
    params = {"session": SESSION_ID}
    try:
        response = requests.post(url, params=params, json=body_data)
        response.raise_for_status()
        return JSONResponse(content=response.json())
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("submit_dres:app", host="0.0.0.0", port=8081, reload=True)
