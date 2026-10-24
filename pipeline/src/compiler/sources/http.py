"""HTTP helpers: plain downloads and reading single members out of remote zip files."""

import io
import shutil
import time
import zipfile
from pathlib import Path

import httpx

USER_AGENT = "ThreeX-pipeline/0.1 (+https://github.com/Bharat8098/threex)"
_CHUNK = 1 << 20


def client() -> httpx.Client:
    """An HTTP client that honours HTTPS_PROXY and SSL_CERT_FILE from the environment."""
    return httpx.Client(
        headers={"User-Agent": USER_AGENT},
        timeout=httpx.Timeout(60, read=300),
        follow_redirects=True,
    )


def get_json(url: str, params: dict, attempts: int = 4) -> dict:
    """GET JSON, retrying transient network failures with exponential backoff."""
    for attempt in range(attempts):
        try:
            with client() as http:
                response = http.get(url, params=params)
                response.raise_for_status()
                return response.json()
        except (httpx.TransportError, httpx.HTTPStatusError) as error:
            retryable = isinstance(error, httpx.TransportError) or (
                error.response.status_code in (429, 500, 502, 503, 504)
            )
            if not retryable or attempt == attempts - 1:
                raise
            time.sleep(2 ** (attempt + 1))
    raise AssertionError("unreachable")


def is_fresh(path: Path, max_age_days: float | None) -> bool:
    if not path.exists():
        return False
    if max_age_days is None:
        return True
    return time.time() - path.stat().st_mtime < max_age_days * 86400


def download(url: str, dest: Path, *, max_age_days: float | None = None, params=None) -> Path:
    """Stream `url` to `dest` (atomically), unless a fresh copy is already there."""
    if is_fresh(dest, max_age_days):
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    partial = dest.with_name(dest.name + ".part")
    with client() as http, http.stream("GET", url, params=params) as response:
        response.raise_for_status()
        with partial.open("wb") as out:
            for chunk in response.iter_bytes(_CHUNK):
                out.write(chunk)
    partial.replace(dest)
    return dest


class _RangeReader(io.RawIOBase):
    """A seekable read-only file over HTTP range requests."""

    def __init__(self, url: str, http: httpx.Client) -> None:
        self._url = url
        self._http = http
        self._pos = 0
        head = http.head(url)
        head.raise_for_status()
        if head.headers.get("accept-ranges") != "bytes":
            raise OSError(f"{url} does not support range requests")
        self._size = int(head.headers["content-length"])

    def readable(self) -> bool:
        return True

    def seekable(self) -> bool:
        return True

    def tell(self) -> int:
        return self._pos

    def seek(self, offset: int, whence: int = io.SEEK_SET) -> int:
        base = {io.SEEK_SET: 0, io.SEEK_CUR: self._pos, io.SEEK_END: self._size}[whence]
        self._pos = base + offset
        return self._pos

    def readinto(self, buffer) -> int:
        if self._pos >= self._size:
            return 0
        end = min(self._pos + len(buffer), self._size) - 1
        response = self._http.get(self._url, headers={"Range": f"bytes={self._pos}-{end}"})
        response.raise_for_status()
        data = response.content
        buffer[: len(data)] = data
        self._pos += len(data)
        return len(data)


def fetch_zip_member(url: str, member: str, dest: Path) -> Path:
    """Copy one member of a remote zip to `dest`, downloading only that member's bytes."""
    if dest.exists():
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    partial = dest.with_name(dest.name + ".part")
    with client() as http:
        remote = io.BufferedReader(_RangeReader(url, http), buffer_size=16 * _CHUNK)
        with (
            zipfile.ZipFile(remote) as archive,
            archive.open(member) as src,
            partial.open("wb") as out,
        ):
            shutil.copyfileobj(src, out, _CHUNK)
    partial.replace(dest)
    return dest


def list_zip_members(url: str) -> list[str]:
    with client() as http:
        remote = io.BufferedReader(_RangeReader(url, http), buffer_size=_CHUNK)
        with zipfile.ZipFile(remote) as archive:
            return archive.namelist()
