# SpanBase - Complete Build

## EVERYTHING YOU NEED IS HERE

This package contains the COMPLETE SpanBase application with ALL requested features implemented.

## Quick Start

1. Extract this entire folder
2. Open terminal/command prompt in this folder
3. Run: `python -m http.server 8000`
4. Open browser: `http://localhost:8000`

## Files Included

- **index.html** - Complete application (ALL features)
- **app.js** - Fully rebuilt with ALL functionality
- **bridges_data.json** - Complete dataset (32 MB, 7,634 bridges, ALL fields)
- **logo.svg** - SpanBase logo (Concept 2)
- **README.md** - This file

## ALL FEATURES IMPLEMENTED ✓

### ✅ Data
- 7,634 bridges with complete data
- All geometry fields (W-AX columns)
- All narratives (C-J columns)
- All condition ratings (AZ-BF columns) - numeric 1-9
- All attributes (P-V, AJ-AT columns)

### ✅ Radial Menu (4 Nodes)
- **Click bridge points** to open menu
- **Geometry** (Top) - All measurements, dimensions, age
- **Attributes** (Right) - Location, route, utilities
- **Narratives** (Bottom) - All inspection text
- **Condition** (Left) - Numeric ratings 1-9

### ✅ Clickable Title
- **Bridge Name** → Opens Google Maps at coordinates
- **BARS Number** → Opens AssetWise (from hyperlink column)

### ✅ Hover Tooltip
- Mouseover shows bridge name only
- Disappears on: mouse move, zoom change, click
- Does NOT open radial menu

### ✅ Evaluation Mode
- **Left sidebar** with 5 sliders
- **Deck, Superstructure, Substructure, Bearings, Joints**
- Sliders default to 0 (off)
- Active sliders (>0) calculate weighted average
- Worse conditions = larger bridge points
- Color shows worst rating when sliders inactive
- Collapsible panel (arrow button)

### ✅ Other Features
- District color-coding (10 districts)
- Search (BARS, name, county, route)
- Debug panel (zoom, sizes, metrics)
- Stats panel (counts)
- Mode switching button
- Menu closes on zoom change

## How To Use

### Basic Navigation
- **Pan**: Click and drag map
- **Zoom**: Mouse wheel or +/- buttons
- **Search**: Type in search box

### Bridge Information
1. **Hover over bridge** → See name
2. **Click bridge** → Open 4-node radial menu
3. **Click any node** → View detailed panel
4. **Click title links** → Open Google Maps or AssetWise

### Evaluation Mode
1. Click "Enter Evaluation Mode" button
2. Slider panel appears on left
3. Adjust sliders to weight criteria (0-10)
4. Click "Apply" to resize points
5. Worse bridges become larger
6. Click "Exit Evaluation Mode" to return

### Radial Menu Nodes
- **📐 Geometry**: Bridge dimensions, spans, clearances
- **📋 Attributes**: Location, route, functional class
- **📝 Narratives**: Full inspection text (8 sections)
- **🔍 Condition**: Numeric ratings (1=poor, 9=excellent)

## Data Details

### Condition Rating Scale
- **1-3**: Poor condition (red/orange)
- **4-6**: Fair condition (yellow/teal)
- **7-9**: Good condition (green)

### Evaluation Slider Logic
- Each slider weights that component (0-10)
- Formula: `weighted_avg = (deck_rating × deck_weight + super_rating × super_weight + ...) / (total_weights)`
- Point size = `base_size + (base_size × 2 × severity_factor)`
- Only sliders >0 are included in calculation

## Technical Specs

- **Frontend**: Vanilla JavaScript (no frameworks)
- **Mapping**: Leaflet.js 1.9.4
- **Basemap**: OpenStreetMap
- **Data Format**: JSON (32 MB uncompressed)
- **Browser**: Any modern browser (Chrome, Firefox, Edge)
- **Server**: Python 3 http.server

## Troubleshooting

**Map doesn't load:**
- Check console (F12) for errors
- Verify server is running on port 8000
- Try: `http://localhost:8000/` to see file listing

**Data too slow:**
- Normal - 32 MB takes 3-5 seconds to load
- Watch loading spinner
- Check console for "Loaded X bridges" message

**Features not working:**
- Hard refresh: Ctrl+F5 (Windows) or Cmd+Shift+R (Mac)
- Clear browser cache
- Verify all files extracted properly

## Version

**SpanBase v2.0 - Complete Build**
Built: January 19, 2026
Data: WVDOT Bridge Asset Management System

---

**This is the COMPLETE application with EVERY requested feature.**
