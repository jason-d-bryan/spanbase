# SpanBase v25 - Remaining Fixes TODO

## COMPLETED IN THIS SESSION ✅
1. Search works with BARS AND Bridge Name
2. Changed "Auto-hide on drag" to "Stay on Top" toggle
3. Updated District 2 and 10 colors for better contrast
4. Changed Maintenance sliders to 0-100% in 10% increments with % display
5. Updated all evaluation functions to normalize 0-100 back to 0-10 for calculations

---

## HIGH PRIORITY - TO BE COMPLETED NEXT SESSION

### Panel Opacity & Styling
- [ ] Drop panel body opacity to 70%
- [ ] Keep checkbox section backgrounds at 100% opacity
- [ ] Add background behind sliders at 100% opacity
- [ ] Style scrollbar to match radial menu popup style

### Tab Switching Behavior
- [ ] Switching between Inspection/Maintenance tabs should close all popups and reset everything

### Inspection Tab UI
- [ ] Decrease padding between inspection type checkboxes
- [ ] Decrease padding between month checkboxes
- [ ] Move "Show Overdue + Selected Month" into months section
- [ ] Remove instruction text "Filter bridges by..."
- [ ] Move Status Legend to main map (above Districts), only show when Inspection tab active

### Maintenance Tab - District Behavior
- [ ] Fix: District toggles should persist when panel opens (currently resets)
- [ ] Greyed districts stay greyed when filter opens

### Bottom Status Bar
- [ ] Simplify format to: "[View] | [Type]"
- [ ] Examples: "Inspection View | Routine", "Maintenance View"
- [ ] Show "Maintenance View" when in Maintenance tab

### Radial Menu Fixes
- [ ] Evenly space menu buttons (Inspections overlaps Narratives/Attributes currently)
- [ ] Rename buttons: Narrative, Inspection, Attributes, Condition, Geometry
- [ ] Add "Postings" with "(coming soon)" in smaller font below
- [ ] Fix cursor: Four-way arrow ONLY on title bar, normal cursor elsewhere on popup
- [ ] Decrease popup background opacity by 20%
- [ ] Keep title bars and info bars at 100% opacity

### Radial Menu - Inspections
- [ ] Fix: Inspections menu doesn't currently pop up with window/table
- [ ] Should show table with columns: Type | Begin | Completion | Due | Status

### General Fixes
- [ ] Fix: Zoom resets checkbox outputs (filters don't persist through zoom)
- [ ] Remove duplicate Reset/Apply buttons (choose one set to keep)
- [ ] Standardize all buttons to just "Reset" (no "Apply")

---

## NOTES
- All high-impact functionality fixes completed
- Remaining items are mostly UI polish and consistency
- Zoom persistence issue is critical - filters must survive zoom changes
- Radial menu spacing and Inspections popup are user-visible bugs
