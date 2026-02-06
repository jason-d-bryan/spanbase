# SpanBase v7.4 Development TODO
**Current Version:** 7.4.1  
**Previous Major Version:** 7.0.6

---

## ✅ COMPLETED IN v7.0.0 - v7.4.1

### Attributes Filter System (v7.0.0 - v7.1.0)
- ✅ Separate RED Attributes Filter tab with persistent positioning
- ✅ Panel stacking system (z-index based, both panels at same position)
- ✅ Smart tab switching (click blue for Condition, red for Attributes)
- ✅ 4 sliders: Length (0-4,020 ft), Width (0-880 ft), Area (0-403k sq ft), Age (0-210 years)
- ✅ ≤/≥ mode toggles for each slider
- ✅ NHS Filter (Yes/No/All buttons)
- ✅ Utilities checkbox (Present)
- ✅ On Bridge checkboxes (7 categories → simplified to 5 in v7.3.5)
- ✅ Under Bridge checkboxes (8 categories → simplified to 4 in v7.0.7)
- ✅ Route/Subroute search inputs
- ✅ Bridge Type/ADT placeholders ("Coming Soon")
- ✅ Reset Filters button (yellow)
- ✅ Red status bar integration (attributes active shows red, preserves inspection status)
- ✅ Color theme matching (panel #376a81, boxes #003b5c, dark blue scheme)

### Filter Logic & Integration (v7.1.0 - v7.2.2)
- ✅ AND logic: Inspection filters + Attributes filters work together (Venn diagram overlap)
- ✅ All filter controls functional (sliders, toggles, checkboxes, text inputs)
- ✅ Dimension slider mutual exclusivity (can use any 2 of Length/Width/Area, not all 3)
- ✅ N/A bridge handling (hide by default, toggle to show)
- ✅ Status bar shows both filter states when both active
- ✅ Attributes filter persists when switching to inspection tab

### Slider Improvements (v7.2.0 - v7.2.2)
- ✅ Logarithmic scaling for Length, Width, Age (0-100 internal range for smooth movement)
- ✅ Age slider: 5-year intervals with rounding
- ✅ Calc. Sufficiency styling applied to all sliders (white titles, yellow limits, white readout)
- ✅ Units on slider readouts (ft, ft², years)
- ✅ Teal slider bars in Attributes panel (#4a7c8c track color)

### Auto-Zoom Features (v7.3.0)
- ✅ Auto-zoom on page load (fits all 7,633 bridges)
- ✅ Auto-zoom when route/subroute entered
- ✅ Auto-zoom when any slider released (Length, Width, Area, Age)
- ✅ Smooth animated zoom with 50px padding, max zoom 12

### Radial Menu Improvements (v7.3.0)
- ✅ Force menu below title bar (calculate title bottom, keep menu at least 10px below)

### Checkbox Simplification (v7.3.0 - v7.3.5)
- ✅ Under Bridge: 8 checkboxes → 4 (Waterway, Highway (includes combos), Railroad (includes combos), Other)
- ✅ On Bridge: 7 checkboxes → 5 (Highway (includes combos) value="1,4,5", Railroad, Pedestrian Only, Interchange Structures, Other)
- ✅ **BUG FIX:** Highway checkbox now includes codes 1,4,5 (Highway, Highway-Railroad, Highway-Pedestrian)
- ✅ Compact spacing: margin-bottom 4px → 2px, padding 2px → 1px

### Panel Reorganization (v7.4.0 - v7.4.1)
- ✅ New order: Route Search → ADT → NHS → Age → Length → Width → Area → Utilities → On Bridge → Under Bridge
- ✅ NHS box: reduced padding (8px top/bottom), smaller buttons (6px padding)
- ✅ Area slider: ft² with superscript (proper exponent notation)
- ✅ ESC key resets Attributes Filter

### Bug Fixes
- ✅ On/Under Bridge checkbox array comparison (v7.1.0)
- ✅ Z-index stacking for panel visibility (v7.0.10-7.0.11)
- ✅ Tab movement synchronization (v7.0.8)
- ✅ Dimension slider logic (v7.2.1 - only disable third slider, not all)
- ✅ Highway checkbox bug (v7.3.5 - was only showing code 1, now includes 4,5)
- ✅ HTML nesting bug (v7.4.1 - sliders were nested in Utilities box)

---

## 🚧 IN PROGRESS / PENDING

### Immediate Testing Needed
- ⚠️ Verify Highway checkbox fix (should show Highway-Pedestrian and Highway-Railroad bridges)
- ⚠️ Test dimension slider logic (Length+Width blocks Area, Length+Area blocks Width, Width+Area blocks Length)
- ⚠️ Verify panel reorganization displays correctly
- ⚠️ Test ESC key behavior with both filters active

---

## 📋 UPCOMING FEATURES (From TODO-v6.2.md)

### Priority 1: Count Reports (v7.5.x - v7.6.x)
**Live analytics dashboards next to Districts legend**

#### Inspection Count Report Box
- Location: Next to Districts box, 5px gap, top-aligned
- Buttons: Total (grey), Past Due (red), Complete (green)
- Click behavior: Opens popup table with bridge list
- Live updates: District toggles, inspection filters, search changes
- Columns: Row #, Bridge Name, BARS, District, Status, Days

#### Maintenance Count Report Box
- Same location (shows in Maintenance tab instead of Inspection box)
- Buttons: Total (grey), Red, Orange, Yellow, Green
- Click behavior: Filter map to show only that severity level
- Live updates: Real-time during slider drag (debounced 300ms)
- Multi-select: Can have red+orange both active

#### Sufficiency Count Report Box
- Below Maintenance Count Report (when in Maintenance tab)
- Buttons: Sufficiency ranges (0-2, 3-4, 5-6, 7-8, 9+)
- Independent of main maintenance severity colors

**Complexity:** MEDIUM-HIGH  
**Estimated Iterations:** 3-4 versions

---

### Priority 2: Link Sharing System (v7.7.x - v7.8.x)
**Share current view state via URL**

#### Features
- URL parameter encoding for:
  - Active districts (which on/off)
  - Active tab (Condition vs Attributes)
  - All slider positions (11 total)
  - Inspection checkboxes (types + months)
  - Attributes checkboxes (On/Under Bridge)
  - NHS filter, Utilities, Route/Subroute
  - Map position (lat, lng, zoom)
  - Search query
  - Mode toggles (≤/≥ for all sliders)
- Share button in header (near search)
- Share button in each filter panel
- Share popup with:
  - QR code (top)
  - Copy link button (clipboard icon)
  - Email link button (mailto:)
  - Bridge-specific link option (if bridge selected)
- On page load: Parse URL params and restore state

**Complexity:** HIGH  
**Estimated Iterations:** 3-4 versions

---

### Priority 3: Export & Reporting (v7.9.x - v8.0.x)
**Export filtered bridge lists and generate reports**

#### Export Features
- Export to Excel (.xlsx): Filtered bridge list with all attributes
- Export to CSV: Same data, CSV format
- Export to PDF: Formatted report with map snapshot
- Export includes: Bridge details, inspection status, severity scores
- Respect all active filters (district, attributes, inspection, search)

#### Report Generation
- Professional PDF reports
- Summary statistics (count by district, severity breakdown)
- Map snapshot showing filtered bridges
- Table of bridges with key attributes
- Configurable columns (user selects which fields to include)

**Complexity:** MEDIUM-HIGH  
**Estimated Iterations:** 2-3 versions

---

## 🔮 FUTURE ENHANCEMENTS (v8.0+)

### Advanced Features
- **Mobile Optimization:** Touch-friendly controls, responsive panels
- **Analytics Dashboard:** Historical trends, aging analysis, budget projections
- **Collaboration Features:** Notes, flags, team sharing
- **Offline Mode:** Service worker, cached data for field use
- **Print Mode:** Print-optimized layout, remove interactive elements

### Data Enhancements
- **Bridge photos:** Integrate photo library if available
- **Maintenance history:** Show past repairs, upgrades
- **Cost estimates:** Repair cost projections based on condition
- **Traffic data:** ADT trends, growth projections
- **Weather overlay:** Show weather impact on bridge conditions

### Performance Improvements
- **Virtual scrolling:** For large popup tables (>100 rows)
- **Web Workers:** Offload filtering calculations
- **IndexedDB:** Cache bridge data for faster loads
- **Lazy loading:** Load bridge details on demand
- **Debouncing:** Optimize slider drag performance

---

## 📊 TECHNICAL DEBT & REFACTORING

### Code Organization
- [ ] Extract filter logic into separate modules
- [ ] Create reusable popup component (used by radial menu, count reports)
- [ ] Standardize slider creation (too much duplicated code)
- [ ] Move inline styles to CSS classes
- [ ] Create constants file for magic numbers (colors, sizes, thresholds)

### Performance
- [ ] Profile and optimize `updateBridgeSizes()` (runs on every filter change)
- [ ] Consider caching severity score calculations
- [ ] Optimize logarithmic slider conversions (called on every input event)
- [ ] Review z-index management (currently using 9998-10001)

### Documentation
- [ ] Add JSDoc comments to all functions
- [ ] Document filter logic flow
- [ ] Create user guide PDF
- [ ] Training video for WVDOT staff

---

## 🐛 KNOWN ISSUES

### Minor
- None currently known (all major bugs fixed in v7.4.1)

### Future Considerations
- Radial menu title positioning could be improved for edge cases (very top/bottom of screen)
- Auto-zoom on slider might be too aggressive for some users (consider toggle)
- NHS button colors could have better contrast (currently light blue → yellow)

---

## 📈 VERSION HISTORY SUMMARY

### v7.4.1 (Current)
- Fixed HTML nesting bug (sliders in Utilities)
- NHS box more compact
- ESC key resets attributes

### v7.4.0
- Major panel reorganization
- Units with exponents (ft²)
- Checkbox spacing reduction

### v7.3.5
- Fixed Highway checkbox bug (now includes combos)
- Simplified On Bridge to 5 checkboxes

### v7.3.0
- Auto-zoom to filtered results
- Radial menu positioning fix
- Under Bridge simplified to 4 checkboxes

### v7.2.2
- Venn diagram logic (filters combine with AND)
- Red status bar persists correctly

### v7.2.0
- Logarithmic sliders (Length, Width, Age)
- Calc. Sufficiency styling applied
- Dimension slider mutual exclusivity

### v7.1.0
- Filters fully functional
- Red status bar implementation
- Color theme finalized

### v7.0.0 - v7.0.14
- Attributes Filter panel created
- Tab positioning system
- Basic filter framework

---

## 🎯 NEXT SESSION PRIORITY

**Recommended:** Start with **Inspection Count Report Box** (v7.5.x)
- Foundation for all count reports
- High user value (live analytics)
- Reusable popup table component
- No dependencies (can start immediately)

**Alternative:** Continue polish/testing of v7.4.1 if any issues found

---

## 📞 QUESTIONS FOR USER

1. **Count Report Priority:** Which count report is most valuable first? (Inspection vs Maintenance)
2. **Export Format:** Prefer Excel, CSV, or PDF for exports?
3. **Link Sharing:** Is QR code generation important, or just copy/paste link?
4. **Mobile Usage:** How many users access this on mobile/tablets?
5. **Performance:** Any specific performance concerns with current version?

---

**Last Updated:** February 02, 2026  
**Maintainer:** Claude + User Collaboration
