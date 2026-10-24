import math

import numpy as np
import pytest

from compiler.tides import predict

M2_HOURS = 12.4206
K1_HOURS = 23.9345


def _tide(times: np.ndarray, shift_minutes: float = 0.0) -> np.ndarray:
    hours = (times - times[0]).astype("timedelta64[s]").astype(float) / 3600 - shift_minutes / 60
    return 50 * np.cos(2 * math.pi * hours / M2_HOURS) + 20 * np.cos(2 * math.pi * hours / K1_HOURS)


def _times(days: int) -> np.ndarray:
    return np.datetime64("2022-01-01T00:00:00") + np.arange(days * 24) * np.timedelta64(3600, "s")


def test_skill_measures_offset_and_timing() -> None:
    times = _times(30)
    observed = _tide(times, shift_minutes=30) + 100  # gauge zero sits 1 m below MSL
    result = predict.skill(times, observed, _tide(times))
    assert result is not None
    assert result.timing_error_minutes == pytest.approx(30, abs=6)
    assert 5 < result.rmse_cm < 20


def test_skill_handles_gaps_without_inventing_events() -> None:
    times = _times(30)
    observed = _tide(times)
    observed[100:160] = np.nan
    result = predict.skill(times, observed, _tide(times))
    assert result.timing_error_minutes < 3 and result.rmse_cm < 1
    assert result.hours_compared == 30 * 24 - 60


def test_fit_window_prefers_recent_complete_stretch() -> None:
    times = _times(1200)
    heights = _tide(times)
    heights[-300 * 24 :] = np.nan  # the gauge went quiet for its last 300 days
    start, end = predict.fit_window(times, heights)
    inside = (times > start) & (times <= end)
    coverage = (~np.isnan(heights[inside])).mean()
    assert predict.MIN_COVERAGE <= coverage < predict.MIN_COVERAGE + 0.05  # the latest that passes
    assert end < times[-1]
    assert (end - start) == np.timedelta64(predict.STATION_FIT_DAYS, "D")
    assert predict.fit_window(times[:100], heights[:100]) is None


def test_station_fit_reproduces_the_tide() -> None:
    times = _times(800)
    model = predict.fit_station(times, _tide(times) + 300, lat=10.0)
    future = times[-1] + np.arange(1, 49) * np.timedelta64(3600, "s")
    expected = _tide(np.concatenate([times, future]))[-48:]
    assert np.max(np.abs(model.predict(future) - expected)) < 2.0
