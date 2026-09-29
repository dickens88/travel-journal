#!/usr/bin/env python3
"""Probe a Huawei Cloud MaaS vision model the way the app calls it.

Runs each request shape against each base URL, streaming and not, and prints what came back,
so a failure can be pinned on the endpoint, the transport, or the prompt.

  MAAS_API_KEY=... python3 scripts/test-maas-vision.py [image.jpg]

Env (also read from .env.local): MAAS_API_KEY (required), MAAS_VISION_MODEL (default qwen2.5-vl-72b),
MAAS_BASE_URLS (comma-separated, default v1 and v2 on api.modelarts-maas.com), MAAS_EDGES (long edges
to try, default 1024), MAAS_STREAM (both | on | off, default both), MAAS_TIMEOUT (seconds, default 90).
Docs: https://support.huaweicloud.com/model-call-maas/model-call-020.html
"""
import base64
import io
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent

# Copy of PROMPT in src/ai/analyzePhotos.ts
APP_PROMPT = """以上是一次旅行中的照片，每张前面标了照片 id、当地拍摄时间、系统查到的地名（可能缺失）、GPS 坐标和根据太阳位置推算的光线。
请逐张描述，用于之后写游记：场景（认得出的地标写出名称）、主体、氛围、光线、一句简短图注，以及是否适合当封面。
只描述照片里看得到的内容，不确定的地标不要硬猜。所有字段用中文。"""


def load_env():
    env = ROOT / ".env.local"
    if env.exists():
        for line in env.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"'))


def schema_instruction():
    # Same text as jsonInstruction(PhotoAnalysisSchema) in src/ai/openai.ts, generated from the real schema
    js = (
        "import('./src/ai/schemas.ts').then(async (m) => { const { z } = await import('zod');"
        " console.log(JSON.stringify(z.toJSONSchema(m.PhotoAnalysisSchema))); })"
    )
    schema = subprocess.run(
        ["node", "--experimental-strip-types", "--no-warnings", "-e", js], cwd=ROOT, capture_output=True, text=True, check=True
    ).stdout.strip()
    return f"只输出一个 JSON 对象，不要输出任何其他文字，也不要用代码块包裹。JSON 必须符合这个 JSON Schema：\n{schema}"


def image_url(path, edge):
    im = Image.open(path).convert("RGB")
    im.thumbnail((edge, edge))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=80)
    print(f"image: {path} -> {im.size[0]}x{im.size[1]}, {len(buf.getvalue()) // 1024} KB")
    return {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()}}


def call(base, key, body, stream):
    req = urllib.request.Request(
        base.rstrip("/") + "/chat/completions",
        data=json.dumps({**body, "stream": stream}).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
    )
    t = time.time()
    try:
        with urllib.request.urlopen(req, timeout=int(os.environ.get('MAAS_TIMEOUT', '90'))) as res:
            raw = res.read().decode()
    except urllib.error.HTTPError as e:
        return f"HTTP {e.code}", e.read().decode()[:400], time.time() - t
    except (TimeoutError, urllib.error.URLError, OSError) as e:
        return f"{type(e).__name__}", str(e), time.time() - t
    if not stream:
        c = json.loads(raw)["choices"][0]
        return c.get("finish_reason"), c["message"].get("content") or "", time.time() - t
    text, finish = "", None
    for line in raw.splitlines():
        if not line.startswith("data:") or line.strip() == "data: [DONE]":
            continue
        chunk = json.loads(line[5:])
        for c in chunk.get("choices", []):
            text += (c.get("delta") or {}).get("content") or ""
            finish = c.get("finish_reason") or finish
    return finish, text, time.time() - t


def main():
    load_env()
    key = os.environ.get("MAAS_API_KEY")
    if not key:
        sys.exit("Set MAAS_API_KEY (env or .env.local)")
    model = os.environ.get("MAAS_VISION_MODEL", "qwen2.5-vl-72b")
    bases = os.environ.get("MAAS_BASE_URLS", "https://api.modelarts-maas.com/v1,https://api.modelarts-maas.com/v2").split(",")
    path = sys.argv[1] if len(sys.argv) > 1 else Path.home() / "Downloads/IMG_20260823_150700_1.jpg"
    # 1024 is ANALYZE_EDGE in src/ai/analyzePhotos.ts; chat sends the stored 1568 copy
    edges = [int(e) for e in os.environ.get("MAAS_EDGES", "1024").split(",")]
    streams = {"both": (False, True), "on": (True,), "off": (False,)}[os.environ.get("MAAS_STREAM", "both")]
    instruction = schema_instruction()
    label = "照片 id=test1｜2026-08-23 15:07｜地名未知｜坐标 59.9071,10.7473｜日光"
    cases = {}
    for edge in edges:
        img = image_url(path, edge)
        # The documented example: image first, then a question
        cases[f"describe@{edge}"] = [{"role": "user", "content": [img, {"type": "text", "text": "描述下图片里的内容"}]}]
        # Exactly what analyzeBatch sends for one photo
        cases[f"app@{edge}"] = [{"role": "user", "content": [{"type": "text", "text": label}, img, {"type": "text", "text": APP_PROMPT}, {"type": "text", "text": instruction}]}]
    print(f"model: {model}\n")
    for base in bases:
        # Text only, to separate "endpoint unreachable" from "images break it"
        finish, text, secs = call(base, key, {"model": model, "max_tokens": 64, "messages": [{"role": "user", "content": "用一句话打个招呼"}]}, False)
        print(f"== {base} | text only | finish={finish} | {secs:.1f}s\n   {text.strip()[:200]}\n")
        for name, messages in cases.items():
            for stream in streams:
                finish, text, secs = call(base, key, {"model": model, "max_tokens": 8000, "messages": messages}, stream)
                try:
                    json.loads(text[text.index("{") : text.rindex("}") + 1])
                    ok = "JSON ok"
                except ValueError:
                    ok = "no JSON" if name.startswith("app") else ""
                print(f"== {base} | {name} | stream={stream} | finish={finish} | {secs:.1f}s {ok}")
                print("   " + text.strip().replace("\n", "\n   ")[:500] + "\n")


main()
