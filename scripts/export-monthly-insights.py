"""Build year-month region statistics from source hours, never from climatology.

Run through the existing ASCII junction C:/codex_climate_work for netCDF4.
The previous exports are read-only references. A separate payload is produced.
"""
from __future__ import annotations

import argparse
import calendar
import json
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
from netCDF4 import Dataset, num2date

ROOT = Path(__file__).absolute().parents[1]
PUBLIC = ROOT / "public/data"
VARIABLES = ("tas", "huss", "rsds", "sfcwind", "ps")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, required=True, help="Folder containing the five 2021_2030 source NetCDF files")
    args = parser.parse_args()
    evolution = json.loads((PUBLIC / "climate-evolution.json").read_text(encoding="utf-8"))
    coords = np.asarray(evolution["coordinates"])
    weights = np.cos(np.deg2rad(coords[:, 1]))
    years = evolution["years"]
    groups = {"中国沿海整体": list(range(len(coords)))}
    groups.update({p["name"]: p["indices"] for p in evolution["provinces"]})
    groups.update({
        "北部沿海": np.where(coords[:, 1] >= 35)[0].tolist(),
        "中部沿海": np.where((coords[:, 1] >= 25) & (coords[:, 1] < 35))[0].tolist(),
        "南部沿海": np.where(coords[:, 1] < 25)[0].tolist(),
    })
    payload = {
        "years": years,
        "days": [[calendar.monthrange(year, month)[1] for month in range(1, 13)] for year in years],
        "method": "Source hours -> daily mean -> monthly mean; cosine-latitude area weights. Calendar-year seasons use Jan/Feb/Dec for winter. Not observations.",
        "regions": {name: {"count": len(indices), "monthly": {}} for name, indices in groups.items()},
        "reconciliation": {},
    }
    for variable in VARIABLES:
        print(f"Monthly extraction: {variable}", flush=True)
        frames = []
        with Dataset(str(args.data_dir / f"mpi-esm1-2-hr_ssp245_{variable}_2021_2030.nc")) as ds:
            da = ds.variables[variable]
            assert da.dimensions == ("time", "location") and da.shape[0] == 87648
            time = ds.variables["time"]
            if "since" in time.units:
                dates = num2date(time[:], time.units, getattr(time, "calendar", "standard"))
            else:
                # These files declare only 'hours UTC+08', with offsets 0..87647.
                # Use the same filename-based epoch as the verified annual export.
                assert time.units == "hours UTC+08"
                assert np.array_equal(time[:], np.arange(87648))
                dates = [datetime(2021, 1, 1) + timedelta(hours=i) for i in range(87648)]
                payload["timeConvention"] = "UTC+08; epoch 2021-01-01 inferred from 2021_2030 source filename, verified against annual export and 87648 consecutive hours."
            lookup = {(round(float(lon), 5), round(float(lat), 5)): i for i, (lon, lat) in enumerate(zip(ds.variables["lon"][:], ds.variables["lat"][:]))}
            indices = [lookup[(round(lon, 5), round(lat, 5))] for lon, lat in coords]
            units = str(getattr(da, "units", "")).lower().replace(" ", "")
            offset = 0
            errors = []
            for yi, year in enumerate(years):
                hours = sum(payload["days"][yi]) * 24
                assert dates[offset].year == year and dates[offset].month == 1 and dates[offset].day == 1
                assert dates[offset + hours - 1].year == year and dates[offset + hours - 1].month == 12
                hourly = np.asarray(np.ma.filled(da[offset:offset + hours, indices], np.nan))
                assert np.isfinite(hourly).all(), "Missing source hours require a coverage-aware aggregation"
                offset += hours
                if variable == "tas" and (units in {"k", "kelvin"} or np.mean(hourly[0]) > 100):
                    hourly = hourly - 273.15
                elif variable == "huss" and ("kgkg" in units or units in {"1", "kg/kg"}):
                    hourly = hourly * 1000
                elif variable == "ps" and (("pa" in units and "hpa" not in units) or np.mean(hourly[0]) > 2000):
                    hourly = hourly / 100
                daily = np.mean(hourly.reshape(-1, 24, len(coords)), axis=1)
                months, day = [], 0
                for days in payload["days"][yi]:
                    months.append(np.mean(daily[day:day + days], axis=0, dtype=np.float64))
                    day += days
                monthly = np.asarray(months)
                reconstructed = np.average(monthly, axis=0, weights=payload["days"][yi])
                error = float(np.max(np.abs(reconstructed - np.asarray(evolution["annual"][variable][yi]))))
                assert error < 0.004, (variable, year, error)
                errors.append(error)
                frames.append(monthly)
                print(f"  {year}: 12 months, max annual grid error {error:.7f}", flush=True)
        frames = np.asarray(frames)
        for name, members in groups.items():
            monthly = np.average(frames[:, :, members], axis=2, weights=weights[members]).round(6).tolist() if members else [[None] * 12 for _ in years]
            payload["regions"][name]["monthly"][variable] = monthly
        payload["reconciliation"][variable] = {"maxAnnualGridError": max(errors), "months": 120}
    destination = PUBLIC / "climate-monthly.json"
    destination.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    print(f"Verified monthly payload: {destination}", flush=True)


if __name__ == "__main__":
    main()
