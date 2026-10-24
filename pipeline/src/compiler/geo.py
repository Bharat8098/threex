"""Geohash helpers. Tiles are geohash-4 cells (about 39 km x 20 km at the equator)."""

from typing import NamedTuple

_BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"
_DECODE = {c: i for i, c in enumerate(_BASE32)}


class Bounds(NamedTuple):
    min_lat: float
    min_lon: float
    max_lat: float
    max_lon: float


def encode(lat: float, lon: float, precision: int) -> str:
    lat_range = [-90.0, 90.0]
    lon_range = [-180.0, 180.0]
    out: list[str] = []
    bits = 0
    value = 0
    use_lon = True
    while len(out) < precision:
        rng, coord = (lon_range, lon) if use_lon else (lat_range, lat)
        mid = (rng[0] + rng[1]) / 2
        if coord >= mid:
            value = (value << 1) | 1
            rng[0] = mid
        else:
            value <<= 1
            rng[1] = mid
        use_lon = not use_lon
        bits += 1
        if bits == 5:
            out.append(_BASE32[value])
            bits = 0
            value = 0
    return "".join(out)


def bounds(geohash: str) -> Bounds:
    lat_range = [-90.0, 90.0]
    lon_range = [-180.0, 180.0]
    use_lon = True
    for char in geohash:
        value = _DECODE[char]
        for shift in range(4, -1, -1):
            rng = lon_range if use_lon else lat_range
            mid = (rng[0] + rng[1]) / 2
            if (value >> shift) & 1:
                rng[0] = mid
            else:
                rng[1] = mid
            use_lon = not use_lon
    return Bounds(lat_range[0], lon_range[0], lat_range[1], lon_range[1])


def contains(geohash: str, lat: float, lon: float) -> bool:
    return encode(lat, lon, len(geohash)) == geohash
