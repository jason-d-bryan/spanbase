# SpanBase v6.2 Development TODO
**Current Version:** 6.1.14  
**Target Version:** 6.2.0

---

## FIXES & POLISH (To Address First)

### UI Fixes
- **Remove zoom indicator** - Bottom-left zoom display no longer needed
- **Preserve district colors in Maintenance tab** - District colors should remain until user moves a slider (don't switch to severity colors on tab click alone)
- **Fix tooltip anchoring** - Tooltip should anchor to bridge point center (not cursor position), 5px above point, horizontally centered
- **Hidden bridge cursor fix** - Bridges with opacity=0 still show link cursor, should show normal cursor
- **Inspection month-only behavior** - Need to clarify/fix bridge appearance when only months selected (no inspection types checked)

### Radial Menu Redesign
- **Title box: 100% opaque, darker blue background**
- **Move Google Maps & AssetWise links to title box** (new line beneath BARS number)
- **Button opacity: match standard panel opacity**
- **Center logo: Add circular WVDOT logo, increase size by 7px, overlap buttons slightly**
- **Bring buttons in 5px closer to center**
- **Rotate menu -30° counterclockwise:**
  - Inspection at 0° (right)
  - Narrative at 180° (left)
  - Geometry at 270° (bottom)
  - Keep all button text upright (don't rotate text)
- **Swap Narrative and Condition positions**
- **Prevent narrative popup resize** - Disable resize handles except title bar (for dragging only)

---

## PRIORITY ORDER (Most Complex → Least Complex)

### 1. LINK SHARING SYSTEM (HIGH COMPLEXITY)
**Purpose:** Allow users to share current view state via URL

**Components:**
- URL parameter encoding/decoding for:
  - Active districts (which on/off)
  - Active tab (Maintenance vs Inspection)
  - Slider positions (all 6 sliders)
  - Inspection checkboxes (types + months)
  - Map position (lat, lng, zoom)
  - Search query
  - Sufficiency mode (≤ or ≥)
- Share button in header (near search)
- Share button in Condition Filter panel
- Share popup with:
  - QR code (top)
  - Copy link button (clipboard icon)
  - Email link button (envelope icon)
  - Bridge-specific link option (if bridge recently selected)
- On page load: Parse URL params and restore state
- Count Report sharing (links to specific filtered views)

**Technical Challenges:**
- State serialization/deserialization
- URL length limits (may need compression)
- QR code generation library
- Email client integration
- Deep linking to specific bridges

---

### 2. INSPECTION COUNT REPORT BOX (MEDIUM-HIGH COMPLEXITY)
**Purpose:** Display live counts of inspection statuses with clickable filtering

**Location:** Next to Districts box, align top edges, 5px gap between boxes

**Visual Design:**
- Match Districts box styling
- Title: "Count Report" or "Inspection Status"
- Responsive height (fits contents)
- Three buttons with thin white stroke:
  - **Total (grey fill)** - count of all visible bridges
  - **Past Due (red fill)** - count of past due bridges
  - **Complete (green fill)** - count of completed bridges

**Button Click Behavior:**
- **Total** → Opens popup table with ALL visible bridges
- **Past Due** → Opens popup table with ONLY past due bridges  
- **Complete** → Opens popup table with ONLY completed bridges

**Popup Table Specs:**
- Match radial menu popup styling (draggable, closeable)
- Columns: Row #, Bridge Name, BARS, District, Status, Days
- Status column shows: "Past Due" or "Overdue" or "Complete"
- Days column shows numerical days (from existing inspection logic)
- Scrollable for large datasets
- Sortable columns (optional enhancement)

**Live Update Triggers:**
- District toggles
- Inspection type checkboxes
- Month checkboxes
- Search query changes
- Any filter that changes visible bridges

**Display Logic:**
- If multiple inspection types checked → combined counts across all types
- Show separate row for each selected inspection type
- Counts reflect ONLY currently visible bridges on map

**Technical Challenges:**
- Performance: Recalculating counts on every filter change (7,551 bridges)
- Need efficient filtering algorithm
- Popup table scrolling performance with 100s of rows
- Status/days calculation already exists, need to aggregate

---

### 3. MAINTENANCE COUNT REPORT BOX (MEDIUM COMPLEXITY)
**Purpose:** Display live counts by severity level with color filtering

**Location:** Same as Inspection box position (but shows in Maintenance tab)

**Visual Design:**
- Match Districts + Inspection boxes
- Title: "Count Report" or "Severity Breakdown"
- Five buttons with thin white stroke:
  - **Total (grey fill)** - all visible bridges
  - **Red (red fill)** - critical severity count
  - **Orange (orange fill)** - warning severity count
  - **Yellow (yellow fill)** - moderate severity count
  - **Green (green fill)** - good condition count

**Button Click Behavior:**
- **Total** → Shows all bridges (resets color filter)
- **Red** → Shows ONLY red (critical) bridges, hides others
- **Orange** → Shows ONLY orange bridges
- **Yellow** → Shows ONLY yellow bridges
- **Green** → Shows ONLY green bridges
- Click same button again to toggle off (return to all)
- Multiple colors can be selected simultaneously

**Color Definitions:**
- Based on weighted severity score from slider calculations
- Red: Score > X (define threshold)
- Orange: Score > Y
- Yellow: Score > Z
- Green: Score ≤ Z
- (Exact thresholds TBD - based on existing severity calculation)

**Live Update Triggers:**
- Slider movements (real-time as dragging)
- District toggles
- Search changes

**Sufficiency Independence:**
- Sufficiency filter operates separately
- Does NOT affect these counts/colors
- Sufficiency gets its own Count Report box (see #4)

**Technical Challenges:**
- Real-time count updates during slider drag (performance)
- May need debouncing/throttling
- Severity score calculation already exists
- Need to track which colors are active for filtering

---

### 4. SUFFICIENCY COUNT REPORT BOX (MEDIUM COMPLEXITY)
**Purpose:** Separate count report specifically for sufficiency ratings

**Location:** Below Maintenance Count Report box (when in Maintenance tab)

**Visual Design:**
- Same styling as other Count Report boxes
- Title: "Sufficiency Report"
- Buttons showing sufficiency ranges:
  - Distribution by sufficiency score ranges (0-2, 3-4, 5-6, 7-8, 9+)
  - OR similar color-coded system
  - (Exact breakdown TBD)

**Button Click Behavior:**
- Filter map to show only bridges in that sufficiency range
- Independent of main maintenance severity colors

**Live Updates:**
- Sufficiency slider changes
- District/search changes

**Technical Challenges:**
- Define meaningful sufficiency ranges
- Integration with existing sufficiency filter toggle (≤/≥ mode)

---

### 5. COUNT REPORT LINK SHARING (LOW-MEDIUM COMPLEXITY)
**Purpose:** Share specific filtered views from count reports

**Integration:**
- Add "Share" icon to each Count Report box
- Clicking generates link with current filters applied
- Uses same Link Sharing System infrastructure (Item #1)
- Pre-applies filters when recipient opens link

**Technical Challenges:**
- Depends on Link Sharing System being complete
- Need to encode filter states in URL

---

### 6. UI POLISH & STYLING (LOW COMPLEXITY)
**Minor adjustments:**
- Logo size: Keep at 60% (`width: calc(60% - 20px)`)
- Button stroke styling: thin white borders on all Count Report buttons
- Box alignment: Ensure top edges align perfectly
- Spacing: 5px gap between Districts and Count Report boxes
- Responsive behavior: All boxes scale properly at different resolutions

---

## TECHNICAL SPECIFICATIONS

### Color Definitions (Maintenance Mode):
```javascript
// Based on weighted severity score (0-10 scale)
function getSeverityColor(score) {
    if (score >= 7) return '#DC2626';      // Red - Critical
    if (score >= 5) return '#F97316';      // Orange - Warning  
    if (score >= 3) return '#FCD34D';      // Yellow - Moderate
    return '#10B981';                       // Green - Good
}
```

### URL Parameter Structure (Link Sharing):
```
?districts=1,2,3,5
&tab=inspection
&types=routine,indepth
&months=1,2,3
&zoom=10
&lat=38.5
&lng=-80.4
&search=bridge
&deck=50
&super=30
&sub=0
&bearings=0
&joints=40
&suff=100
&suffmode=lte
&bridge=03A128
```

### Performance Considerations:
- Debounce count updates during slider drag (300ms delay)
- Use efficient array filtering methods
- Cache calculated scores to avoid recalculation
- Lazy load popup tables (render on demand)
- Virtual scrolling for large tables (100+ rows)

---

## ESTIMATED COMPLEXITY BREAKDOWN

| Feature | Complexity | Est. Iterations | Key Challenges |
|---------|-----------|-----------------|----------------|
| Link Sharing | HIGH | 3-4 | State serialization, QR codes, deep linking |
| Inspection Count Report | MED-HIGH | 2-3 | Popup tables, live updates, performance |
| Maintenance Count Report | MEDIUM | 2 | Color filtering, real-time slider updates |
| Sufficiency Count Report | MEDIUM | 1-2 | Range definitions, integration |
| Count Report Sharing | LOW-MED | 1 | Depends on Link Sharing completion |
| UI Polish | LOW | 1 | Minor adjustments |

**Total Estimated Iterations: 10-13 versions**

---

## DEPENDENCIES

```
Link Sharing System (Item #1)
    ↓
Count Report Sharing (Item #5)

Inspection Count Report (Item #2)
    ↓
Popup Table Component (reusable)

Maintenance Count Report (Item #3)
    ↓
Sufficiency Count Report (Item #4)
```

---

## QUESTIONS TO RESOLVE

1. **Severity thresholds:** Exact score ranges for red/orange/yellow/green?
2. **Sufficiency ranges:** How to break down 0-9 sufficiency scale into meaningful categories?
3. **Multi-color selection:** In Maintenance mode, can user have red+orange both active?
4. **Popup table sorting:** Should columns be sortable by clicking headers?
5. **Performance target:** Max acceptable delay for count updates during slider drag?
6. **QR code library:** Which JS library for QR generation? (suggest `qrcode.js`)
7. **Email integration:** Use `mailto:` links or proper email modal?

---

## CURRENT STABLE STATE (v6.1.14)

✅ All core functionality working  
✅ Inspection cycle logic with intervals  
✅ Severity scoring with sufficiency filter  
✅ District filtering with zoom  
✅ Search with auto-zoom  
✅ Tooltip styling with bridge colors  
✅ Reset button functionality  
✅ Panel opacity at 70%  
✅ Logo at 60% width  
✅ Maintenance sliders in styled boxes  
✅ Inspection boxes match sufficiency styling  

---

**Next Session Priority:** Start with Inspection Count Report (Item #2) as foundation, then build Link Sharing System (Item #1) for maximum user value.
