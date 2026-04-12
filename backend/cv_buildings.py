import requests
import math

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

def get_buildings_in_bounds(south: float, west: float, north: float, east: float):
    query = f"""
    [out:json][timeout:25];
    (
      way["building"]({south},{west},{north},{east});
      node["man_made"="cooling_tower"]({south},{west},{north},{east});
      way["man_made"="cooling_tower"]({south},{west},{north},{east});
    );
    out geom;
    """
    resp = requests.post(OVERPASS_URL, data=query, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    elements = data.get("elements", [])

    # Collect cooling tower centroids from the same response
    cooling_tower_points = []
    for el in elements:
        if el.get("tags", {}).get("man_made") != "cooling_tower":
            continue
        if el["type"] == "node":
            cooling_tower_points.append((el["lon"], el["lat"]))
        elif el["type"] == "way" and el.get("geometry"):
            lons = [p["lon"] for p in el["geometry"]]
            lats = [p["lat"] for p in el["geometry"]]
            cooling_tower_points.append((
                sum(lons) / len(lons),
                sum(lats) / len(lats),
            ))

    results = []
    for el in elements:
        if el.get("type") != "way" or not el.get("geometry"):
            continue
        if el.get("tags", {}).get("man_made") == "cooling_tower":
            continue

        coords = [[p["lon"], p["lat"]] for p in el["geometry"]]
        if coords[0] != coords[-1]:
            coords.append(coords[0])
        if len(coords) < 4:
            continue

        polygon = {"type": "Polygon", "coordinates": [coords]}
        area_m2 = _polygon_area_m2(coords)
        sqft = area_m2 * 10.764

        if sqft < 100000:
            continue

        confidence = _confidence(area_m2)
        has_cooling_tower = any(
            _point_in_polygon(ct, coords) for ct in cooling_tower_points
        )

        results.append({
            "osm_id": el["id"],
            "geometry": polygon,
            "area_m2": round(area_m2),
            "sqft": round(sqft),
            "confidence": confidence,
            "cooling_tower": has_cooling_tower,
        })

    return results


def _polygon_area_m2(coords):
    if len(coords) < 3:
        return 0.0
    R = 6371000
    total = 0.0
    n = len(coords) - 1
    for i in range(n):
        lon1, lat1 = math.radians(coords[i][0]), math.radians(coords[i][1])
        lon2, lat2 = math.radians(coords[(i+1) % n][0]), math.radians(coords[(i+1) % n][1])
        total += (lon2 - lon1) * (2 + math.sin(lat1) + math.sin(lat2))
    return abs(total * R * R / 2)


def _point_in_polygon(point: tuple, ring: list) -> bool:
    """Ray casting point-in-polygon test. ring is [[lon, lat], ...]."""
    px, py = point
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if ((yi > py) != (yj > py)) and (px < (xj - xi) * (py - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def _confidence(area_m2):
    sqft = area_m2 * 10.764
    if sqft > 500000: return 94
    if sqft > 300000: return 89
    if sqft > 200000: return 85
    if sqft > 100000: return 78
    return 70