# SpanBase TODO
**Current Version:** 7.6.2+
**Last Updated:** February 05, 2026

---

## COMPLETED (v7.5.0 - v7.6.2+)

### Count Report System (v7.5.x - v7.6.x)
- CR with Critical/Emergent/Satisfactory/NA/Total buttons
- CR visibility: only shows when evaluation, inspection, or attributes filter active
- CR buttons enabled when evaluation or attributes filter active
- CR category filtering uses actual condition data (not fillColor) via getBridgeCategory()
- CR respects all active filters (districts, search, attributes) for accurate counts
- Multi-select category toggling (click to show/hide categories)
- Double-click to solo a category

### Bug Fixes (v7.6.2+ session)
- CR no longer shows on initial page load
- CR buttons remain active after maintenance reset
- Search no longer shows grey/NA dots for non-matching bridges
- Search auto-zoom uses search-matching logic (not stale opacity state)
- District toggle properly shows/hides bridges (uses marker.addTo/remove instead of opacity)
- District tooltip on mouseover at zoom 7-8 with 150ms delayed removal
- Inspection CR button cycling works correctly (satisfactory/critical/total toggle)
- NA count accurate in inspection mode (skips hidden markers)
- AF route search: CR buttons no longer locked out
- AF route search: satisfactory shows all districts (not just District 4)
- AF route search: counts use actual condition data, not district fillColors
- Slider scaling: quadratic power curve replaces logarithmic (more natural feel)
- Area slider: uses 0-100 range with power scaling (was 0-403000)
- ESC key mimics reset button for active tab (Maintenance, Inspection, or Attributes)
- Default zoom level 8, minimum zoom 7
- Zoom level rounding (Math.round) prevents fractional zoom sizing bugs
- Point sizes now update correctly when zooming in/out

### Previously Completed (v7.0.0 - v7.4.1)
- Attributes Filter system (Length, Width, Area, Age sliders with mode toggles)
- NHS/Utilities/On Bridge/Under Bridge filters
- Route/Subroute search inputs
- Red status bar for active attributes filter
- Panel stacking (Condition + Attributes tabs)
- AND logic for combined filters
- Dimension slider mutual exclusivity (any 2 of Length/Width/Area)
- Auto-zoom on filter changes
- Checkbox simplification (On Bridge: 5, Under Bridge: 4)
- Logarithmic sliders replaced with quadratic power curve
- Debug/reference panel (lower-left, live metrics)

---

## ACTIVE BUGS / IN PROGRESS

### Bridge Length Filter
- Reported: "all kinds weird stuff going on with the output"
- Needs investigation: slider behavior, filter results, displayed values
- Was starting to look at this when CR categorization bugs took priority

## RECENTLY COMPLETED (this session, Feb 5 2026)

### getBridgeCategory() — condition-data-based CR categorization
- CR no longer uses fillColor to categorize bridges (was broken in district theme)
- Now uses actual bridge ratings (deck, superstructure, substructure, bearings, joints)
- Respects active evaluation sliders: if only deck+super are active, categorizes by those two only
- Falls back to all 5 ratings when no sliders active or in attributes filter mode
- Rating thresholds: 1 = critical, 2-4 = emergent, 5-9 = satisfactory, no valid ratings = NA

### District toggle now respects CR category filter
- updateBridgeVisibility() now calls applyCountCategoryFilter() + updateCountReport()
- Also added attributes filter check to updateBridgeVisibility()
- Toggling to a district with no bridges matching the active CR category shows zero bridges (correct)

### getBridgeColor() hardened
- Now checks evaluationActive as fallback (not just currentMode === 'evaluation')
- Prevents district colors leaking through when evaluation mode is active

### updateBridgeSizes() consolidated setStyle
- fillColor + fillOpacity + opacity now set in single setStyle() call
- Removed separate fillColor-only setStyle (was relic from color-based categorization)

### Zoom level rounding
- Math.round(map.getZoom()) in zoomend handler prevents fractional zoom breaking pointSizes lookup

---

## UPCOMING FEATURES

### Priority 1: Link Sharing System
- URL parameter encoding for full app state:
  - Active districts, active tab, all slider positions
  - Inspection checkboxes (types + months)
  - Attributes checkboxes, NHS, Utilities, Route/Subroute
  - Map position (lat, lng, zoom), search query, mode toggles
- Share button in header (near search) and in filter panels
- Share popup with QR code, copy link, email link, bridge-specific link
- On page load: parse URL params and restore state

### Priority 2: Export & Reporting
- Export to Excel (.xlsx), CSV, PDF
- Filtered bridge list with all attributes
- Summary statistics (count by district, severity breakdown)
- Map snapshot, configurable columns
- Respect all active filters

---

## FUTURE ENHANCEMENTS (v8.0+)

### Advanced Features
- Mobile optimization (touch controls, responsive panels)
- Analytics dashboard (historical trends, aging analysis, budget projections)
- Collaboration (notes, flags, team sharing)
- Offline mode (service worker, cached data for field use)
- Print mode (print-optimized layout)

### Data Enhancements
- Bridge photos integration
- Maintenance history (past repairs, upgrades)
- Cost estimates (repair projections based on condition)
- Traffic data (ADT trends, growth projections)
- Weather overlay (weather impact on conditions)
- Bridge Type filter (currently placeholder)
- ADT filter (currently placeholder)

### Performance
- Virtual scrolling for large tables (>100 rows)
- Web Workers for offloading filter calculations
- IndexedDB for caching bridge data
- Lazy loading bridge details on demand

---

## TECHNICAL DEBT

### Code Organization
- [ ] Extract filter logic into separate modules
- [ ] Create reusable popup component (radial menu, count reports)
- [ ] Standardize slider creation (reduce duplicated code)
- [ ] Move inline styles to CSS classes
- [ ] Create constants file for magic numbers (colors, sizes, thresholds)

### Documentation
- [ ] Add JSDoc comments to key functions
- [ ] Document filter logic flow
- [ ] Create user guide PDF
- [ ] Training materials for WVDOT staff

---

## MINOR UI ITEMS
- Radial menu title positioning for edge cases (top/bottom of screen)
