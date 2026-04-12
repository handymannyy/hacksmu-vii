import requests
import math

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

def get_buildings_in_bounds(south: float, west: float, north: float, east: float):
    query = f"""
    [out:json][timeout:25];
    way["building"]({south},{west},{north},{east});
    out geom;
    """
    resp = requests.post(OVERPASS_URL, data=query, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    results = []
    for el in data.get("elements", []):
        if el.get("type") != "way" or not el.get("geometry"):
            continue

        coords = [[p["lon"], p["lat"]] for p in el["geometry"]]
        if coords[0] != coords[-1]:
            coords.append(coords[0])
        if len(coords) < 4:
            continue

        polygon = {"type": "Polygon", "coordinates": [coords]}
        area_m2 = _polygon_area_m2(coords)
        sqft = area_m2 * 10.764

        if sqft < 5000:
            continue

        confidence = _confidence(area_m2)

        results.append({
            "osm_id": el["id"],
            "geometry": polygon,
            "area_m2": round(area_m2),
            "sqft": round(sqft),
            "confidence": confidence,
            "cooling_tower": False,
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


def _confidence(area_m2):
    sqft = area_m2 * 10.764
    if sqft > 500000: return 94
    if sqft > 300000: return 89
    if sqft > 200000: return 85
    if sqft > 100000: return 78
    return 70