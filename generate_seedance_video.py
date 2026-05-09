#!/usr/bin/env python3
"""Create and download a short Seedance video task.

The script reads the API key from NEWAPI_API_KEY, or ARK_API_KEY as a fallback.
It supports the New API gateway content payload shape and the official
Volcengine Ark shape.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen


DEFAULT_BASE_URL = "https://newapi.isnothing.net/"
DEFAULT_MODEL = "seedance-2.0-720p"
DEFAULT_PROMPT = (
    "真人质感，@1 骑着马在沙尘暴之间坚定地向前跑去，近景，俯视，@1 低着头，"
    "他头上的斗笠遮住了他的眼睛，只能看到鼻子和嘴"
)
DEFAULT_REFERENCE_IMAGE_URL = "https://videohub.taijiai.online/public/assets/asset_afecd273d72049cf0ae8.jpg"
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
TERMINAL_STATUSES = {"completed", "succeeded", "failed", "failure", "cancelled", "canceled", "expired"}
SUCCESS_STATUSES = {"completed", "succeeded"}


class ApiError(RuntimeError):
    pass


def redact(value: str) -> str:
    return re.sub(r"sk-[A-Za-z0-9._-]+", "sk-<redacted>", value)


def join_url(base_url: str, path: str) -> str:
    return urljoin(base_url.rstrip("/") + "/", path.lstrip("/"))


def request_json(
    method: str,
    url: str,
    api_key: str,
    payload: dict[str, Any] | None = None,
    timeout: int = 60,
) -> dict[str, Any]:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
    }
    data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = Request(url, data=data, method=method, headers=headers)

    try:
        with urlopen(req, timeout=timeout) as resp:
            text = resp.read().decode("utf-8", "replace")
    except HTTPError as exc:
        text = exc.read().decode("utf-8", "replace")
        raise ApiError(f"HTTP {exc.code} from {url}: {redact(text)}") from exc
    except URLError as exc:
        raise ApiError(f"Request failed for {url}: {exc}") from exc

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ApiError(f"Non-JSON response from {url}: {redact(text[:500])}") from exc
    if isinstance(parsed, dict) and parsed.get("error"):
        raise ApiError(f"API error from {url}: {redact(json.dumps(parsed, ensure_ascii=False))}")
    return parsed


def nested_get(data: dict[str, Any], *paths: str) -> Any:
    for path in paths:
        cur: Any = data
        for part in path.split("."):
            if not isinstance(cur, dict) or part not in cur:
                cur = None
                break
            cur = cur[part]
        if cur:
            return cur
    return None


def build_content(args: argparse.Namespace) -> list[dict[str, Any]]:
    content: list[dict[str, Any]] = [
        {
            "type": "text",
            "text": args.content_text or args.prompt,
        }
    ]

    for url in args.reference_image_url:
        content.append(
            {
                "type": "image_url",
                "role": "reference_image",
                "subject_type": args.reference_subject_type,
                "image_url": {
                    "url": url,
                },
            }
        )

    for url in args.reference_video_url:
        content.append(
            {
                "type": "video_url",
                "role": "reference_video",
                "video_url": {
                    "url": url,
                },
            }
        )

    for url in args.reference_audio_url:
        content.append(
            {
                "type": "audio_url",
                "role": "reference_audio",
                "audio_url": {
                    "url": url,
                },
            }
        )

    return content


def build_newapi_payload(args: argparse.Namespace) -> dict[str, Any]:
    payload = {
        "model": args.model,
        "duration": args.duration,
        "ratio": args.ratio,
        "resolution": args.resolution,
        "generate_audio": args.generate_audio,
        "prompt": args.prompt,
        "content": build_content(args),
    }
    if args.include_size:
        payload["width"] = args.width
        payload["height"] = args.height
    if args.include_n:
        payload["n"] = 1
    if args.watermark:
        payload["metadata"] = {"watermark": True}
    return payload


def create_newapi_task(args: argparse.Namespace, api_key: str) -> tuple[str, str]:
    url = join_url(args.base_url, "/v1/video/generations")
    payload = build_newapi_payload(args)
    print(f"Creating New API video task: {url}")
    created = request_json("POST", url, api_key, payload, timeout=args.request_timeout)
    task_id = nested_get(created, "task_id", "id", "data.task_id", "data.id")
    if not task_id:
        raise ApiError(f"Create response did not include a task id: {json.dumps(created, ensure_ascii=False)}")
    print(f"Task created: {task_id}")
    return "newapi", str(task_id)


def create_ark_task(args: argparse.Namespace, api_key: str) -> tuple[str, str]:
    url = join_url(args.base_url, "/api/v3/contents/generations/tasks")
    payload = {
        "model": args.model,
        "content": build_content(args),
        "resolution": args.resolution,
        "ratio": args.ratio,
        "duration": args.duration,
        "watermark": args.watermark,
        "generate_audio": args.generate_audio,
    }
    print(f"Creating Ark video task: {url}")
    created = request_json("POST", url, api_key, payload, timeout=args.request_timeout)
    task_id = nested_get(created, "id", "task_id", "data.id", "data.task_id")
    if not task_id:
        raise ApiError(f"Create response did not include a task id: {json.dumps(created, ensure_ascii=False)}")
    print(f"Task created: {task_id}")
    return "ark", str(task_id)


def get_task(args: argparse.Namespace, api_key: str, mode: str, task_id: str) -> dict[str, Any]:
    if mode == "ark":
        url = join_url(args.base_url, f"/api/v3/contents/generations/tasks/{task_id}")
    else:
        url = join_url(args.base_url, f"/v1/video/generations/{task_id}")
    return request_json("GET", url, api_key, timeout=args.request_timeout)


def poll_task(args: argparse.Namespace, api_key: str, mode: str, task_id: str) -> dict[str, Any]:
    deadline = time.monotonic() + args.timeout
    consecutive_errors = 0
    while True:
        try:
            result = get_task(args, api_key, mode, task_id)
            consecutive_errors = 0
        except ApiError as exc:
            consecutive_errors += 1
            if consecutive_errors > args.max_poll_errors or time.monotonic() >= deadline:
                raise
            print(f"Polling failed ({consecutive_errors}/{args.max_poll_errors}), retrying: {exc}", flush=True)
            time.sleep(args.poll_interval)
            continue

        status = str(nested_get(result, "status", "data.status", "data.data.status") or "").lower()
        print(f"Task status: {status or 'unknown'}", flush=True)

        if status in SUCCESS_STATUSES:
            return result
        if status in TERMINAL_STATUSES:
            fail_reason = nested_get(
                result,
                "fail_reason",
                "message",
                "data.fail_reason",
                "data.message",
                "data.error.message",
                "data.data.error.message",
            )
            details = f", reason={fail_reason}" if fail_reason else ""
            raise ApiError(f"Task ended with status={status}{details}: {json.dumps(result, ensure_ascii=False)}")
        if time.monotonic() >= deadline:
            raise ApiError(f"Timed out waiting for task {task_id}")
        time.sleep(args.poll_interval)


def find_video_url(result: dict[str, Any]) -> str:
    video_url = nested_get(
        result,
        "url",
        "video_url",
        "content.video_url",
        "data.url",
        "data.video_url",
        "data.content.video_url",
        "data.data.video_url",
        "output.url",
        "output.video_url",
    )
    if not video_url:
        raise ApiError(f"Completed task did not include a video URL: {json.dumps(result, ensure_ascii=False)}")
    return str(video_url)


def download(url: str, output_path: Path, timeout: int) -> None:
    req = Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urlopen(req, timeout=timeout) as resp:
            output_path.write_bytes(resp.read())
    except HTTPError as exc:
        text = exc.read().decode("utf-8", "replace")
        raise ApiError(f"Download failed with HTTP {exc.code}: {redact(text)}") from exc
    except URLError as exc:
        raise ApiError(f"Download failed: {exc}") from exc


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate and download a short Seedance video.")
    parser.add_argument("--base-url", default=os.getenv("NEWAPI_BASE_URL", DEFAULT_BASE_URL))
    parser.add_argument("--model", default=os.getenv("SEEDANCE_MODEL", DEFAULT_MODEL))
    parser.add_argument("--prompt", default=DEFAULT_PROMPT)
    parser.add_argument("--content-text", default="", help="Text item for content[0]. Defaults to --prompt.")
    parser.add_argument("--duration", type=int, default=5)
    parser.add_argument("--width", type=int, default=1280)
    parser.add_argument("--height", type=int, default=720)
    parser.add_argument("--ratio", default="16:9")
    parser.add_argument("--resolution", default="720p")
    parser.add_argument("--generate-audio", action=argparse.BooleanOptionalAction, default=False)
    parser.add_argument("--watermark", action="store_true")
    parser.add_argument(
        "--reference-image-url",
        action="append",
        default=[],
        help="Reference image URL. May be passed multiple times. Defaults to the sample URL.",
    )
    parser.add_argument("--no-default-reference-image", action="store_true")
    parser.add_argument("--reference-subject-type", default="generic", choices=("generic", "person", "product", "scene"))
    parser.add_argument("--reference-video-url", action="append", default=[])
    parser.add_argument("--reference-audio-url", action="append", default=[])
    parser.add_argument("--include-size", action="store_true", help="Also send width/height for gateways that require them.")
    parser.add_argument("--include-n", action="store_true", help="Also send n=1 for gateways that require it.")
    parser.add_argument("--output", default="seedance_test_5s.mp4")
    parser.add_argument("--mode", choices=("newapi", "ark", "auto"), default="auto")
    parser.add_argument("--task-id", default="", help="Resume polling an existing task id instead of creating a new task.")
    parser.add_argument("--timeout", type=int, default=20 * 60)
    parser.add_argument("--poll-interval", type=int, default=15)
    parser.add_argument("--max-poll-errors", type=int, default=5)
    parser.add_argument("--request-timeout", type=int, default=60)
    parser.add_argument("--dry-run", action="store_true", help="Print the request payload without calling the API.")
    args = parser.parse_args()
    if not args.reference_image_url and not args.no_default_reference_image:
        args.reference_image_url = [DEFAULT_REFERENCE_IMAGE_URL]
    return args


def main() -> int:
    args = parse_args()
    if args.dry_run:
        payload = build_newapi_payload(args) if args.mode != "ark" else {
            "model": args.model,
            "content": build_content(args),
            "resolution": args.resolution,
            "ratio": args.ratio,
            "duration": args.duration,
            "watermark": args.watermark,
            "generate_audio": args.generate_audio,
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    api_key = os.getenv("NEWAPI_API_KEY") or os.getenv("ARK_API_KEY")
    if not api_key:
        print("Set NEWAPI_API_KEY first, for example: export NEWAPI_API_KEY='sk-...'", file=sys.stderr)
        return 2

    try:
        if args.task_id:
            mode = "ark" if args.mode == "ark" else "newapi"
            task_id = args.task_id
            print(f"Resuming {mode} task: {task_id}", flush=True)
        elif args.mode == "ark":
            mode, task_id = create_ark_task(args, api_key)
        elif args.mode == "newapi":
            mode, task_id = create_newapi_task(args, api_key)
        elif "volces.com" in args.base_url or "/api/v3" in args.base_url:
            mode, task_id = create_ark_task(args, api_key)
        else:
            mode, task_id = create_newapi_task(args, api_key)

        result = poll_task(args, api_key, mode, task_id)
        video_url = find_video_url(result)
        output_path = Path(args.output).expanduser().resolve()
        download(video_url, output_path, timeout=args.request_timeout)
        print(f"Saved video: {output_path}")
        return 0
    except ApiError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
