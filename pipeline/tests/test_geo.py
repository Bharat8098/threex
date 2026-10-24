import pytest

from compiler import geo


@pytest.mark.parametrize(
    ("lat", "lon", "expected"),
    [
        (57.64911, 10.40744, "u4pruydqqvj"),  # reference value from the geohash spec
        (9.9667, 76.2386, "t9y0wy7k"),
        (-25.382708, -49.265506, "6gkzwgjzn820"),
    ],
)
def test_encode(lat: float, lon: float, expected: str) -> None:
    assert geo.encode(lat, lon, len(expected)) == expected


def test_bounds_contain_the_encoded_point() -> None:
    box = geo.bounds("t9y0")
    assert box.min_lat <= 9.9667 <= box.max_lat
    assert box.min_lon <= 76.2386 <= box.max_lon
    assert box.max_lat - box.min_lat == pytest.approx(180 / 2**10)
    assert box.max_lon - box.min_lon == pytest.approx(360 / 2**10)


def test_contains() -> None:
    assert geo.contains("t9y0", 9.9667, 76.2386)
    assert not geo.contains("t9y3", 9.9667, 76.2386)
