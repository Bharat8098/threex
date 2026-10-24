"""Tide predictions from the open EOT20 model and from tide-gauge harmonics, and how well
each matches what the gauge actually recorded."""

from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

from compiler.models import TideEventKind
from compiler.tides.events import find_events

STATION_FIT_DAYS = 730
HOLDOUT_DAYS = 120
MIN_COVERAGE = 0.7
EVENT_MATCH_HOURS = 3.0


def hourly_times(start: datetime, hours: int) -> np.ndarray:
    """`hours + 1` hourly UTC instants from `start`, as naive datetime64[s]."""
    first = np.datetime64(start.replace(tzinfo=None), "s")
    return first + np.arange(hours + 1) * np.timedelta64(3600, "s")


# ---------------------------------------------------------------------------
# Predictors
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class StationModel:
    """Harmonic constants fitted to a gauge record (UTide)."""

    coef: object
    fit_start: np.datetime64
    fit_end: np.datetime64

    def predict(self, times: np.ndarray) -> np.ndarray:
        import utide

        return utide.reconstruct(times, self.coef, verbose=False).h  # cm, about MSL


def fit_window(
    times: np.ndarray, heights_cm: np.ndarray, before: np.datetime64 | None = None
) -> tuple[np.datetime64, np.datetime64] | None:
    """The most recent `STATION_FIT_DAYS` window, ending at or before `before`, that is at least
    `MIN_COVERAGE` complete. Gauges often go quiet for months; tidal constants barely change
    over a few years, so an older complete window beats a recent patchy one."""
    end = min(before, times[-1]) if before is not None else times[-1]
    span = np.timedelta64(STATION_FIT_DAYS, "D")
    step = np.timedelta64(30, "D")
    valid = ~np.isnan(heights_cm)
    while end - span >= times[0]:
        inside = (times > end - span) & (times <= end)
        if valid[inside].sum() >= MIN_COVERAGE * STATION_FIT_DAYS * 24:
            return end - span, end
        end = end - step
    return None


def fit_station(
    times: np.ndarray, heights_cm: np.ndarray, lat: float, before: np.datetime64 | None = None
) -> StationModel | None:
    """Fit harmonic constants on the best window (see `fit_window`); None if there is none."""
    import utide

    window = fit_window(times, heights_cm, before)
    if window is None:
        return None
    start, end = window
    ok = (times > start) & (times <= end) & ~np.isnan(heights_cm)
    observed = heights_cm[ok]
    coef = utide.solve(
        times[ok], observed - observed.mean(), lat=lat, method="ols", conf_int="none",
        trend=False, verbose=False,
    )  # fmt: skip
    return StationModel(coef, start, end)


def predict_eot20(model_dir: Path, lat: float, lon: float, times: np.ndarray) -> np.ndarray:
    """EOT20 heights (cm, about MSL) at a point, extrapolating up to 20 km from the model's
    nearest ocean cell for spots in harbours and backwaters the 1/8° grid treats as land."""
    import pyTMD.compute

    heights_m = pyTMD.compute.tide_elevations(
        np.array([lon]), np.array([lat]), times,
        directory=model_dir, model="EOT20", type="time series", standard="datetime",
        extrapolate=True, cutoff=20.0,
    )  # fmt: skip
    return np.asarray(heights_m).reshape(-1) * 100


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Skill:
    rmse_cm: float
    timing_error_minutes: float
    hours_compared: int


def _event_times(times: np.ndarray, heights: np.ndarray) -> dict[TideEventKind, np.ndarray]:
    """High and low water instants (POSIX seconds), found separately in each gap-free run of
    an hourly series (NaN marks a gap)."""
    by_kind: dict[TideEventKind, list[float]] = {TideEventKind.HIGH: [], TideEventKind.LOW: []}
    ok = ~np.isnan(heights)
    edges = np.flatnonzero(np.diff(np.concatenate([[0], ok.astype(int), [0]])))
    for begin, end in zip(edges[::2], edges[1::2], strict=True):
        if end - begin < 13:
            continue
        start = times[begin].astype("datetime64[s]").astype(datetime).replace(tzinfo=UTC)
        for event in find_events(start, 60, [int(round(h)) for h in heights[begin:end]]):
            by_kind[event.kind].append(event.time.timestamp())
    return {kind: np.array(stamps) for kind, stamps in by_kind.items()}


def skill(times: np.ndarray, observed_cm: np.ndarray, predicted_cm: np.ndarray) -> Skill | None:
    """RMSE after removing the observed mean, and the mean timing error of matched high and
    low waters. Gaps in the record are skipped; event timing uses only gap-free stretches."""
    ok = ~np.isnan(observed_cm)
    if ok.sum() < 24 * 14:
        return None
    residual = (observed_cm[ok] - observed_cm[ok].mean()) - predicted_cm[ok]
    rmse = float(np.sqrt(np.mean(residual**2)))

    observed_events = _event_times(times, observed_cm)
    predicted_events = _event_times(times, predicted_cm)
    errors = []
    for kind, stamps in observed_events.items():
        candidates = predicted_events[kind]
        for stamp in stamps:
            if candidates.size == 0:
                continue
            nearest = candidates[np.argmin(np.abs(candidates - stamp))]
            if abs(nearest - stamp) <= EVENT_MATCH_HOURS * 3600:
                errors.append(abs(nearest - stamp) / 60)
    if not errors:
        return None
    return Skill(round(rmse, 1), round(float(np.mean(errors)), 1), int(ok.sum()))


@dataclass(frozen=True)
class GaugeCheck:
    """Both methods scored on the same held-out stretch of a gauge's record."""

    station: Skill | None
    eot20: Skill | None
    test_start: np.datetime64 | None
    test_end: np.datetime64 | None


def check_gauge(
    model_dir: Path, lat: float, lon: float, times: np.ndarray, heights_cm: np.ndarray
) -> GaugeCheck:
    """Find the best fit window, hold out its last `HOLDOUT_DAYS`, fit the station on the
    rest, and score the station fit and EOT20 on the held-out days."""
    window = fit_window(times, heights_cm)
    if window is None:
        return GaugeCheck(None, None, None, None)
    _, end = window
    cut = end - np.timedelta64(HOLDOUT_DAYS, "D")
    test = (times > cut) & (times <= end)
    observed = heights_cm[test]
    model = fit_station(times, heights_cm, lat, before=cut)
    station = skill(times[test], observed, model.predict(times[test])) if model else None
    eot20 = skill(times[test], observed, predict_eot20(model_dir, lat, lon, times[test]))
    return GaugeCheck(station, eot20, cut, end)
