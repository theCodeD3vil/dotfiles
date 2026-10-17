#!/usr/bin/env python3
"""Apply a guarded local Headroom patch. Re-run after runtime updates."""

from __future__ import annotations

import argparse
import ast
import datetime
import os
from pathlib import Path
import shutil
import tempfile

DEFAULT_ROOT = (
    Path.home()
    / "Library/Application Support/Headroom/headroom/runtime/venv/lib/python3.12/site-packages/headroom"
)
HERE = Path(__file__).resolve().parent

CHANGES = {
    "proxy/server.py": [
        (
            '        forwarder_name: str = "server",\n'
            "        path_for_log: str | None = None,\n"
            "        timeout: httpx.Timeout | float | None = None,\n",
            '        forwarder_name: str = "server",\n'
            "        path_for_log: str | None = None,\n"
            "        timeout: httpx.Timeout | float | None = None,\n"
            "        on_response_headers: Callable[[httpx.Response], None] | None = None,\n",
        ),
        (
            "        for attempt in range(self.config.retry_max_attempts):\n"
            "            try:\n"
            "                if stream:\n",
            "        async def _post_response() -> httpx.Response:\n"
            "            if on_response_headers is None:\n"
            "                return await self.http_client.post(url, **post_kwargs)\n"
            "            # Read the headers before buffering the body. Desktop's\n"
            "            # buffered-upstream-stream shim passes this callback through.\n"
            '            async with self.http_client.stream("POST", url, **post_kwargs) as response:\n'
            "                on_response_headers(response)\n"
            "                await response.aread()\n"
            "                return response\n\n"
            "        for attempt in range(self.config.retry_max_attempts):\n"
            "            try:\n"
            "                if stream:\n",
        ),
        (
            "                    return await self.http_client.post(  # type: ignore[union-attr]\n"
            "                        url, **post_kwargs\n"
            "                    )\n",
            "                    return await _post_response()\n",
        ),
        (
            "                    response = await self.http_client.post(  # type: ignore[union-attr]\n"
            "                        url, **post_kwargs\n"
            "                    )\n",
            "                    response = await _post_response()\n",
        ),
    ],
    "proxy/handlers/anthropic.py": [
        (
            "from headroom.proxy.compression_decision import CompressionDecision\n",
            "from headroom.proxy.buffered_usage_headers import BufferedUsageHeaders\n"
            "from headroom.proxy.compression_decision import CompressionDecision\n",
        ),
        (
            "                    _salvageable_upstream: dict[str, Any] = {}\n\n"
            "                    async def _buffered_ccr_operation():\n",
            "                    _salvageable_upstream: dict[str, Any] = {}\n"
            "                    usage_headers = (\n"
            "                        BufferedUsageHeaders(self, url, headers)\n"
            "                        if buffered_stream_ccr else None\n"
            "                    )\n\n"
            "                    async def _buffered_ccr_operation():\n",
        ),
        (
            '                                path_for_log="/v1/messages",\n'
            "                                timeout=self._anthropic_buffered_request_timeout(),\n",
            '                                path_for_log="/v1/messages",\n'
            "                                timeout=self._anthropic_buffered_request_timeout(),\n"
            "                                **({\n"
            '                                    "on_response_headers": usage_headers.capture,\n'
            "                                } if usage_headers is not None else {}),\n",
        ),
        (
            "                        operation=operation,\n"
            "                        fmt=ANTHROPIC_ERROR_FORMAT,\n",
            "                        operation=operation,\n"
            "                        fmt=ANTHROPIC_ERROR_FORMAT,\n"
            "                        response_headers=usage_headers.headers,\n",
        ),
    ],
    "proxy/buffered_ccr_response.py": [
        (
            "    request_id: str,\n"
            ") -> Callable[[Any, Any, Any], Awaitable[None]]:\n",
            "    request_id: str,\n"
            "    response_headers: Callable[[], list[tuple[bytes, bytes]]] | None = None,\n"
            ") -> Callable[[Any, Any, Any], Awaitable[None]]:\n",
        ),
        (
            '                            "headers": [(b"content-type", b"text/event-stream")],\n',
            '                            "headers": [(b"content-type", b"text/event-stream")]\n'
            "                            + (response_headers() if response_headers else []),\n",
        ),
    ],
}


def prepare(root: Path) -> dict[Path, str]:
    """Validate every anchor before changing any file; tolerate a full reapply."""
    planned = {}
    for relative, replacements in CHANGES.items():
        path = root / relative
        source = path.read_text()
        for old, new in replacements:
            if source.count(new) == 1:
                continue
            if source.count(old) != 1:
                raise ValueError(f"{relative}: source changed; refusing an unsafe patch")
            source = source.replace(old, new, 1)
        ast.parse(source, filename=str(path))
        planned[path] = source
    helper = HERE / "buffered_usage_headers.py"
    source = helper.read_text()
    ast.parse(source)
    target = root / "proxy/buffered_usage_headers.py"
    if target.exists() and target.read_text() != source:
        raise ValueError(f"{target}: existing helper differs; refusing to overwrite")
    planned[target] = source
    return planned


def atomic_write(path: Path, source: str) -> None:
    mode = path.stat().st_mode & 0o777 if path.exists() else 0o644
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as output:
            output.write(source)
        os.chmod(temporary, mode)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--check", action="store_true", help="Validate without writing")
    args = parser.parse_args()
    planned = prepare(args.root)
    changed = {
        path: source
        for path, source in planned.items()
        if not path.exists() or path.read_text() != source
    }
    if args.check:
        print(f"Validated; {len(changed)} files would change")
        return
    if not changed:
        print("Already applied; no files changed")
        return
    backup = (
        Path.home()
        / ".headroom/local-patches/usage-headers"
        / datetime.datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    )
    backup.mkdir(parents=True)
    existing = {}
    for path in changed:
        if path.exists():
            relative = path.relative_to(args.root)
            destination = backup / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, destination)
            existing[path] = path.read_text()
    written = []
    try:
        for path, source in changed.items():
            atomic_write(path, source)
            written.append(path)
    except Exception:
        for path in reversed(written):
            if path in existing:
                atomic_write(path, existing[path])
            else:
                path.unlink()
        raise
    print(f"Applied to {len(changed)} files. Backup: {backup}")
    print("Restart Headroom after active Claude turns finish to load the patch.")


if __name__ == "__main__":
    main()
