# RainUSE Nexus

Commercial rainwater harvesting viability scoring on an interactive satellite map.  
**Stack:** FastAPI · React + Vite · Mapbox GL · Tailwind CSS

---

## Project structure

```
rainuse-nexus/
├── backend/          FastAPI scoring API
│   ├── main.py       Routes + seed building data (28 Austin, TX buildings)
│   ├── scoring.py    Viability score formula
│   ├── data.py       Open-Meteo rainfall + state water prices
│   ├── models.py     Pydantic response models
│   └── requirements.txt
└── frontend/         React + Vite SPA
    ├── src/
    │   ├── App.tsx
    │   ├── api.ts        Typed fetch wrappers
    │   ├── types.ts      Shared TypeScript interfaces
    │   └── components/
    │       ├── Map.tsx           Mapbox satellite map + scored markers
    │       ├── Header.tsx        Top bar with live stats
    │       ├── Sidebar.tsx       Score/type/ESG filters
    │       ├── BuildingDetail.tsx Right panel — score breakdown + CTA
    │       └── ScoreGauge.tsx    Animated SVG half-circle gauge
    └── ...config files
```

---

## Local development

### 1. Backend

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

API explorer: http://localhost:8000/docs

### 2. Frontend

```bash
cd frontend

# Copy env file and add your Mapbox token
cp .env.example .env
# Edit .env → set VITE_MAPBOX_TOKEN=pk.xxx

npm install
npm run dev
```

App: http://localhost:5173  
The Vite dev server proxies `/api` → `localhost:8000` automatically.

**Getting a Mapbox token (free)**  
1. Go to https://mapbox.com and create a free account  
2. Copy the default public token from your account dashboard  
3. Paste it into `frontend/.env` as `VITE_MAPBOX_TOKEN`  
4. Free tier: 50,000 map loads/month

---

## Deployment

### Backend → Railway (free $5 credit)

1. Push the repo to GitHub
2. New project on https://railway.app → Deploy from GitHub → select `backend/`
3. Set start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Copy the Railway public URL

### Frontend → Vercel (free)

1. New project on https://vercel.com → Import repo → set **Root Directory** to `frontend`
2. Add environment variable:
   - `VITE_MAPBOX_TOKEN` = your Mapbox token
   - `VITE_API_URL` = `https://your-railway-url.railway.app/api`
3. Deploy

---

## Scoring formula

```
harvestable_m³ = roof_area_m² × (annual_rainfall_mm / 1000) × 0.85
annual_value   = harvestable_m³ × water_price_per_m³
base_score     = min(100, annual_value / 50,000 × 100)

ESG bonuses:
  × 1.15  if company has SBTi near-term target
  × 1.10  if SEC 10-K filing mentions water ESG

final_score = min(100, base_score × esg_multiplier)
```

---

## Data sources (all free, zero signup)

| Data | Source | Setup time |
|------|--------|-----------|
| Building footprints + areas | Overture Maps CLI | 5 min |
| Annual precipitation by lat/lon | Open-Meteo Archive API | 1 min |
| Water prices by state | Hardcoded JSON from WPR | 0 min |
| ESG targets | SBTi Excel download | 5 min |
| Corporate water filings | SEC EDGAR EFTS API | 10 min |
| Satellite basemap | Mapbox satellite-streets | 10 min |

---

## Extending to real building footprints

Replace the `_RAW_BUILDINGS` list in `backend/main.py` with live Overture Maps data:

```bash
pip install overturemaps
overturemaps download --bbox=-97.8,30.2,-97.7,30.3 -f geojson --type=building -o austin.geojson
```

Then load with geopandas and project to EPSG:3857 for metric area:

```python
import geopandas as gpd
gdf = gpd.read_file("austin.geojson").to_crs("EPSG:3857")
gdf["roof_area_m2"] = gdf.geometry.area
commercial = gdf[gdf["roof_area_m2"] > 500]
```
