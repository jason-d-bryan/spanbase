# SpanBase - Recent Changes & TODO

## ✅ COMPLETED in This Version:

### 1. Fixed N/A Bridge Behavior
- **When sliders at ZERO**: N/A bridges show at 85% opacity (fully visible)
- **When ANY slider active**: N/A bridges are hidden (0% opacity)
- This fixes the Durbin Truss and Rt Fork Cow Run Bridge issues

### 2. Zoom-Based Name Tooltips  
- Bridge names only appear on hover when zoom > 11
- Prevents clutter at lower zoom levels

### 3. Radial Menu Improvements
- Circles increased to 110px
- Diagonal arrangement (NW/NE/SE/SW)
- Font sizes increased (outer: 12pt, center: 11pt)
- Title moved to 225px above center

### 4. Evaluation Mode Colors
- Uses condition colors (green=good, red=poor) instead of district colors
- Opacity ranges from 20% (best bridges) to 85% (worst bridges)

---

## 🚧 TODO (Not Yet Implemented):

### High Priority:

**1. Radial Menu Persistence**
- Menu should stay visible when opening popup windows
- Menu and title should gray out (opacity 0.3) when popup open
- Menu returns to normal opacity when popup closes
- Click outside menu to close it

**2. Bridge Name in Popup Titles**
- Format: `[Bridge Name]` (16pt, bold)
           `[Section Title]` (12pt)
- Applies to all 4 popup windows

**3. Copy Button for Narratives**
- Add copy button to Narratives popup
- Copies all text with paragraph formatting
- Strips colors/styles (plain text with structure)

**4. Bridge Snapshot Export (.docx)**
- Button labeled "Snapshot" in center circle under AssetWise
- Generates .docx file with all 4 sections
- Filename: `[BridgeName] - D[X] - [BARS].docx`
- Header includes: name, BARS, date, location, county, district
- Tables for geometry/attributes, paragraphs for narratives
- Shows "No data available" for empty sections

**5. Improved Search**
- Incremental filtering as you type BARS number
- Shows ONLY matching bridge when complete number typed
- Hides all other bridges
- Search state persists through zoom changes

**6. Drag Cursor Visual**
- Four-way cross cursor only shows on draggable header
- No cursor change on non-draggable parts of popup

---

## Notes:

**Paint Dimension**: Adding paint rating would require:
- Paint rating column from Excel (format: "X - STATUS - description")
- Add slider to Condition Filter panel
- Include in weighted calculations
- ~15-20 minutes of work once data available

