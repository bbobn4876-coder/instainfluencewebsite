"""A tiny JSON HTTP helper, on the standard library only.

The whole bot installs nothing: python3 and this file are the dependencies.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from config import HTTP_TIMEOUT


class HttpError(RuntimeError):
    """Carries the server's own wording — a guessed explanation misleads."""

    def __init__(self, status: int, body: str):
        self.status = status
        self.body = body
        super().__init__(f"HTTP {status}: {body[:200]}" if body else f"HTTP {status}")


def get_json(
    url: str,
    params: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    timeout: float | None = None,
) -> Any:
    if params:
        clean = {key: str(value) for key, value in params.items() if value is not None}
        url = f"{url}?{urllib.parse.urlencode(clean)}"
    request = urllib.request.Request(url, headers={"accept": "application/json", **(headers or {})})
    return _send(request, timeout)


def post_json(
    url: str,
    payload: dict[str, Any],
    headers: dict[str, str] | None = None,
    timeout: float | None = None,
) -> Any:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"content-type": "application/json", "accept": "application/json", **(headers or {})},
        method="POST",
    )
    return _send(request, timeout)


def _send(request: urllib.request.Request, timeout: float | None) -> Any:
    try:
        with urllib.request.urlopen(request, timeout=timeout or HTTP_TIMEOUT) as response:
            body = response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as error:
        raise HttpError(error.code, error.read().decode("utf-8", "replace")) from None
    except urllib.error.URLError as error:
        raise RuntimeError(f"сеть недоступна: {error.reason}") from None
    return json.loads(body) if body else None
