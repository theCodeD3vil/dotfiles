#!/usr/bin/env python3
"""Capture an idle installed OpenCode TUI without submitting a model message."""

import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import select
import signal
import struct
import subprocess
import termios
import time


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--columns", type=int, default=120)
    parser.add_argument("--rows", type=int, default=36)
    parser.add_argument("--seconds", type=float, default=12)
    parser.add_argument("--directory", default="/private/tmp/opencode-ember-footer-smoke")
    parser.add_argument("--server", help="Use a separately owned temporary loopback server")
    parser.add_argument("--session", help="Use only a newly created temporary verification session")
    args = parser.parse_args()
    directory = Path(args.directory)
    workspace = directory / "workspace"
    workspace.mkdir(parents=True, exist_ok=True)
    capture = directory / f"footer-{args.columns}.ansi"
    metadata = directory / f"footer-{args.columns}.json"
    master, slave = os.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", args.rows, args.columns, 0, 0))
    environment = dict(os.environ, TERM="xterm-256color", COLORTERM="truecolor", LANG="en_US.UTF-8")
    command = ["opencode"] + (["--server", args.server] if args.server else ["--standalone"])
    if args.session:
        command += ["--session", args.session]
    command.append(str(workspace))
    child = subprocess.Popen(
        command,
        stdin=slave, stdout=slave, stderr=slave, env=environment,
        start_new_session=True,
    )
    os.close(slave)
    output = bytearray()
    tail = b""
    answered = set()
    query = re.compile(
        rb"\x1b\[(?:>|\?)?[0-9;]*c|\x1b\[6n|"
        rb"\x1b\]1[01];\?(?:\x07|\x1b\\)|"
        rb"\x1b\]\d;[0-9]+;\?(?:\x07|\x1b\\)|"
        rb"\x1b\[\?[0-9]+\$p|\x1bP\+q[^\x1b]*\x1b\\"
    )
    started = time.monotonic()
    try:
        while time.monotonic() - started < args.seconds and child.poll() is None:
            ready, _, _ = select.select([master], [], [], 0.2)
            if not ready:
                continue
            try:
                data = os.read(master, 65536)
            except OSError:
                break
            if not data:
                break
            offset = len(output) - len(tail)
            combined = tail + data
            output.extend(data)
            for match in query.finditer(combined):
                position = offset + match.start()
                if position in answered:
                    continue
                answered.add(position)
                request = match.group()
                if request.endswith(b"c"):
                    response = b"\x1b[>0;0;0c" if request.startswith(b"\x1b[>") else b"\x1b[?1;2c"
                elif request == b"\x1b[6n":
                    response = b"\x1b[1;1R"
                elif request.startswith(b"\x1b]11;"):
                    response = b"\x1b]11;rgb:0a0a/0a0a/0a0a\x07"
                elif request.startswith(b"\x1b]10;"):
                    response = b"\x1b]10;rgb:e9e9/e6e6/dcdc\x07"
                elif request.startswith(b"\x1b[?") and request.endswith(b"$p"):
                    response = request[:-2] + b";2$y"
                elif request.startswith(b"\x1bP+q"):
                    response = b"\x1bP0+r" + request[4:-2] + b"\x1b\\"
                else:
                    response = request.replace(b";?", b";rgb:0a0a/0a0a/0a0a")
                os.write(master, response)
            tail = combined[-256:]
        # Save while the alternate buffer is still active. Shutdown bytes are excluded.
        capture.write_bytes(output)
        capture.chmod(0o600)
        metadata.write_text(json.dumps({
            "columns": args.columns, "rows": args.rows, "bytes": len(output),
            "durationSeconds": round(time.monotonic() - started, 3),
            "childWasRunning": child.poll() is None, "queriesAnswered": len(answered),
            "temporarySessionFixture": bool(args.session),
        }, indent=2) + "\n")
        metadata.chmod(0o600)
    finally:
        if child.poll() is None:
            os.write(master, b"\x03")
            try:
                child.wait(timeout=3)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGTERM)
                try:
                    child.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    os.killpg(child.pid, signal.SIGKILL)
                    child.wait(timeout=3)
        os.close(master)
    print(json.dumps({"capture": str(capture), "metadata": str(metadata), "bytes": len(output)}))


if __name__ == "__main__":
    main()
