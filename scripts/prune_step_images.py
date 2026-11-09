#!/usr/bin/env python3
"""Drop stored step images for days older than the most recent ones.

Keeps step files for the newest --keep-days dates in data/index.json that
are on or before --today (default: today in Asia/Shanghai). Older days get
steps[].image.local set to null, and images/<date>/steps/ is removed.
Cover photos stay. Safe to run again.
"""

import argparse
import json
import re
import shutil
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
ROOT = Path(__file__).resolve().parents[1]


def shanghai_today():
    clock = datetime.now(timezone(timedelta(hours=8)))
    return clock.date().isoformat()


def load_index_dates(index_path):
    try:
        data = json.loads(index_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"读不到 {index_path}: {exc}") from exc
    dates = []
    for item in data.get("dates") or []:
        if not isinstance(item, dict):
            continue
        day = item.get("date")
        if isinstance(day, str) and DATE_RE.match(day):
            dates.append(day)
    return dates


def clear_locals(day_path):
    try:
        text = day_path.read_text(encoding="utf-8")
        data = json.loads(text)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"跳过 {day_path.name}: {exc}", file=sys.stderr)
        return False
    changed = False
    for entry in data.get("entries") or []:
        if not isinstance(entry, dict):
            continue
        for step in entry.get("steps") or []:
            if not isinstance(step, dict):
                continue
            image = step.get("image")
            if not isinstance(image, dict):
                continue
            if image.get("local") is not None:
                image["local"] = None
                changed = True
    if not changed:
        return False
    day_path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return True


def main():
    parser = argparse.ArgumentParser(description="清掉超过保留天数的本地步骤图")
    parser.add_argument("--keep-days", type=int, default=7, help="保留最近几天的步骤图，默认 7")
    parser.add_argument("--today", help="YYYY-MM-DD，默认北京时间今天")
    parser.add_argument("--root", type=Path, default=ROOT, help="仓库根目录")
    args = parser.parse_args()
    if args.keep_days < 0:
        raise SystemExit("--keep-days 不能小于 0")
    today = args.today or shanghai_today()
    if not DATE_RE.match(today):
        raise SystemExit("--today 要写成 YYYY-MM-DD")

    root = args.root.resolve()
    dates = sorted({day for day in load_index_dates(root / "data" / "index.json") if day <= today}, reverse=True)
    keep = set(dates[: args.keep_days])
    prune = [day for day in dates if day not in keep]
    if not prune:
        print(f"没有需要清理的日子（保留 {len(keep)} 天，今天 {today}）。")
        return

    for day in prune:
        day_path = root / "data" / f"{day}.json"
        if day_path.is_file() and clear_locals(day_path):
            print(f"已去掉 {day} 的步骤图本地路径")
        steps_dir = root / "images" / day / "steps"
        if steps_dir.is_dir():
            shutil.rmtree(steps_dir)
            print(f"已删除 {steps_dir.relative_to(root)}")
        elif not day_path.is_file():
            print(f"跳过 {day}: 没有 data/{day}.json")


if __name__ == "__main__":
    main()
