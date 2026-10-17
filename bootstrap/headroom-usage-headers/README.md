# Headroom buffered usage headers

Local proxy fix for Claude's missing five-hour and weekly usage readings.
It leaves Claude's mods and Headroom's keepalives unchanged.

The patch captures upstream headers before buffering the response body and
forwards utilization/reset pairs when the buffered response starts keepalives.
If upstream headers arrive too late, a recent reading from the same upstream
URL and credentials is used. No credentials are saved. Expired windows, readings
older than 30 minutes, malformed values, and old quota-rejection flags are not
forwarded. A first request with late headers may have no reading; its next
request can use the captured figures.

## Apply or reapply after a Headroom update

```sh
python3 -B ~/dotfiles/bootstrap/headroom-usage-headers/apply.py --check
python3 -B ~/dotfiles/bootstrap/headroom-usage-headers/apply.py
```

The script checks every source anchor before writing, backs up changed runtime
files under `~/.headroom/local-patches/usage-headers/`, and is idempotent. It
refuses to overwrite an incompatible runtime or a different existing helper.
The default runtime path is Headroom's macOS Python 3.12 installation; use
`--root /absolute/path/to/site-packages/headroom` for another installation.

Finish active Claude turns, then quit and reopen Headroom to load the patch.
The script does not restart anything. Headroom updates may replace the patch.

## Tests

```sh
"$HOME/Library/Application Support/Headroom/headroom/runtime/venv/bin/python" \
  -B -m unittest discover \
  -s "$HOME/dotfiles/bootstrap/headroom-usage-headers/tests" -v
```

Tests use fake upstream responses and temporary files, not live accounts.
