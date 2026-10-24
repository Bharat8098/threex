import io
import zipfile

import httpx

from compiler.sources import http


def _zip_bytes() -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("ocean_tides.zip", b"ocean" * 1000)
        archive.writestr("load_tides.zip", b"load" * 100_000)
    return buffer.getvalue()


def test_fetch_zip_member_reads_only_ranges(tmp_path, monkeypatch) -> None:
    payload = _zip_bytes()
    served = []

    def handler(request: httpx.Request) -> httpx.Response:
        headers = {"accept-ranges": "bytes", "content-length": str(len(payload))}
        if request.method == "HEAD":
            return httpx.Response(200, headers=headers)
        start, end = request.headers["range"].removeprefix("bytes=").split("-")
        chunk = payload[int(start) : int(end) + 1]
        served.append(len(chunk))
        return httpx.Response(206, content=chunk)

    monkeypatch.setattr(
        http, "client", lambda: httpx.Client(transport=httpx.MockTransport(handler))
    )
    dest = http.fetch_zip_member("https://example.org/a.zip", "ocean_tides.zip", tmp_path / "o.zip")
    assert dest.read_bytes() == b"ocean" * 1000
    assert http.list_zip_members("https://example.org/a.zip") == [
        "ocean_tides.zip",
        "load_tides.zip",
    ]


def test_get_json_retries_transient_failures(monkeypatch) -> None:
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(1)
        if len(calls) < 3:
            raise httpx.ConnectError("reset", request=request)
        return httpx.Response(200, json={"ok": True})

    monkeypatch.setattr(
        http, "client", lambda: httpx.Client(transport=httpx.MockTransport(handler))
    )
    monkeypatch.setattr(http.time, "sleep", lambda _: None)
    assert http.get_json("https://example.org/api", {}) == {"ok": True}
    assert len(calls) == 3
