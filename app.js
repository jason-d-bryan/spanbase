// SpanBase - Complete Build with All Features
let map;
let bridgesData = [];
let sufficiencyData = {}; // BARS number -> calculated sufficiency rating
let bridgeLayers = {};
let currentMode = 'default';
let currentZoom = 8;
const wvBounds = [[37.206, -82.605], [40.621, -77.742]];
const initialView = { bounds: wvBounds, padding: [100, 50], maxZoom: 8 }; // For resetting to WV overview
let hoveredBridge = null;
let radialMenu = null;
let nameTooltip = null;
let currentSearchQuery = ''; // Track search state

// Inspection system
let inspectionsData = {}; // BARS number -> array of inspections
let inspectionFiltersActive = false;
let selectedInspectionTypes = [];
let selectedMonths = [];
let showOverduePlus = false;

// District toggle state - all active by default
let activeDistricts = {
    'District 1': true,
    'District 2': true,
    'District 3': true,
    'District 4': true,
    'District 5': true,
    'District 6': true,
    'District 7': true,
    'District 8': true,
    'District 9': true,
    'District 10': true
};

// Auto-hide state
let autoHideEnabled = false;

// District colors
const districtColors = {
    'District 1': '#e63946',  // Red (keep same)
    'District 2': '#10B981',  // Green (was orange, too similar to 1)
    'District 3': '#fcbf49',  // Yellow
    'District 4': '#06d6a0',  // Turquoise
    'District 5': '#118ab2',  // Blue
    'District 6': '#073b4c',  // Dark teal
    'District 7': '#8338ec',  // Purple
    'District 8': '#ff006e',  // Pink
    'District 9': '#3a86ff',  // Light blue
    'District 10': '#F59E0B'  // Amber (was orange-red, too similar to 1)
};

// Condition colors - 0 is FAILED/CLOSED (bright red, excluded from filtering)
const conditionColors = {
    0: '#ff0000', // 0 = FAILED - bright RED (special case)
    1: '#ef4444', 2: '#f97316', 3: '#fbbf24',
    4: '#fbbf24', 5: '#06d6a0', 6: '#06d6a0',
    7: '#22c55e', 8: '#22c55e', 9: '#22c55e'
};

// Point sizes by zoom
const pointSizes = {
    7: 4, 8: 5, 9: 6, 10: 8, 11: 10, 12: 12,
    13: 15, 14: 18, 15: 22, 16: 26, 17: 30, 18: 35
};

// Evaluation mode
let evaluationActive = false;
let sliderValues = {
    deck: 0,
    superstructure: 0,
    substructure: 0,
    bearings: 0,
    joints: 0,
    sufficiency: 100  // Default to 100 (show all)
};

let sufficiencyMode = 'lte';  // 'lte' = ≤ mode, 'gte' = ≥ mode

// Initialize
async function init() {
    console.log('Starting SpanBase...');
    
    try {
        // Load gzipped JSON for smaller file size
        const response = await fetch('bridges_data.json.gz');
        const compressed = await response.arrayBuffer();
        const decompressed = pako.inflate(new Uint8Array(compressed), { to: 'string' });
        bridgesData = JSON.parse(decompressed);
        console.log(`✓ Loaded ${bridgesData.length} bridges`);
        
        // Load inspection data
        const inspResponse = await fetch('inspections_data.json.gz');
        const inspCompressed = await inspResponse.arrayBuffer();
        const inspDecompressed = pako.inflate(new Uint8Array(inspCompressed), { to: 'string' });
        inspectionsData = JSON.parse(inspDecompressed);
        console.log(`✓ Loaded inspection data for ${Object.keys(inspectionsData).length} bridges`);
        
        // Load calculated sufficiency data
        const suffResponse = await fetch('sufficiency_data.json');
        sufficiencyData = await suffResponse.json();
        console.log(`✓ Loaded sufficiency data for ${Object.keys(sufficiencyData).length} bridges`);
        
        // Initialize map with WV bounding box
        map = L.map('map');
        
        // West Virginia bounding box from all bridge coordinates
        const wvBounds = [[37.206, -82.605], [40.621, -77.742]];
        map.fitBounds(wvBounds, {
            padding: [100, 50], // Extra top padding for UI
            maxZoom: 8
        });
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap',
            maxZoom: 19
        }).addTo(map);
        
        addBridges();
        setupSearch();
        updateStats();
        createEvaluationPanel();
        setupDistrictToggles();
        
        // Initialize zoom display
        const zoomDisplay = document.getElementById('zoomDisplay');
        if (zoomDisplay) zoomDisplay.textContent = currentZoom;
        
        map.on('zoomend', function() {
            currentZoom = map.getZoom();
            const zoomDisplay = document.getElementById('zoomDisplay');
            if (zoomDisplay) zoomDisplay.textContent = currentZoom;
            syncToggleAllButton(); // Keep button text synced
            updateBridgeSizes();
            updateDebugPanel();
            closeAllMenus();
        });
        
        document.getElementById('loading').style.display = 'none';
        console.log('✓ SpanBase ready');
        
    } catch(error) {
        console.error('ERROR:', error);
        alert('Failed to load: ' + error.message);
    }
}

function addBridges() {
    // Sort bridges by worst rating - best bridges first, worst last (so worst drawn on top)
    const sortedBridges = [...bridgesData].sort((a, b) => {
        const getRatings = (bridge) => [
            bridge.deck_rating,
            bridge.superstructure_rating,
            bridge.substructure_rating,
            bridge.bearings_rating,
            bridge.joints_rating
        ].filter(r => r != null && r !== undefined);
        
        const aRatings = getRatings(a);
        const bRatings = getRatings(b);
        
        if (aRatings.length === 0 && bRatings.length === 0) return 0;
        if (aRatings.length === 0) return -1; // N/A bridges first
        if (bRatings.length === 0) return 1;
        
        const aWorst = Math.min(...aRatings);
        const bWorst = Math.min(...bRatings);
        
        return bWorst - aWorst; // Higher rating first (best to worst)
    });
    
    sortedBridges.forEach(bridge => {
        if (!bridge.latitude || !bridge.longitude) return;
        
        const color = getBridgeColor(bridge);
        const size = getPointSize();
        
        const marker = L.circleMarker([bridge.latitude, bridge.longitude], {
            radius: size,
            fillColor: color,
            color: '#fff',
            weight: 2,
            fillOpacity: 0.85
        });
        
        marker.bridgeData = bridge;
        
        marker.on('mouseover', function(e) {
            // Don't show tooltip on hidden bridges
            const options = this.options;
            if (options.opacity === 0 || options.fillOpacity === 0) {
                return;
            }
            if (currentZoom >= 10) {
                showNameTooltip(e, bridge);
            }
        });
        
        marker.on('mouseout', function() {
            removeNameTooltip();
        });
        
        marker.on('click', function(e) {
            // Don't allow clicking hidden bridges
            const options = this.options;
            if (options.opacity === 0 || options.fillOpacity === 0) {
                return;
            }
            
            L.DomEvent.stopPropagation(e);
            removeNameTooltip();
            showRadialMenu(e.latlng, bridge);
        });
        
        marker.addTo(map);
        bridgeLayers[bridge.bars_number] = marker;
    });
}

function showNameTooltip(e, bridge) {
    // Only show tooltips at zoom 10 or higher
    if (currentZoom < 10) return;
    
    removeNameTooltip();
    
    // Get bridge color
    const marker = bridgeLayers[bridge.bars_number];
    const bridgeColor = marker ? marker.options.fillColor : '#00d9ff';
    
    // Convert name to title case
    const titleCase = (str) => {
        if (!str) return 'Unknown Bridge';
        return str.toLowerCase().split(' ').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
    };
    
    const bridgeName = titleCase(bridge.bridge_name);
    const bars = bridge.bars_number;
    
    const point = map.latLngToContainerPoint(e.latlng);
    const tooltip = L.DomUtil.create('div', 'name-tooltip');
    
    // Use transform to center - this is more reliable
    tooltip.style.position = 'absolute';
    tooltip.style.left = point.x + 'px';
    tooltip.style.top = (point.y - 50) + 'px'; // 50px above point
    tooltip.style.transform = 'translateX(-50%)'; // Center horizontally
    tooltip.style.backgroundColor = bridgeColor;
    tooltip.style.color = '#fff';
    tooltip.style.padding = '8px 12px';
    tooltip.style.borderRadius = '6px';
    tooltip.style.fontSize = '11pt';
    tooltip.style.fontWeight = '600';
    tooltip.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
    tooltip.style.whiteSpace = 'nowrap';
    tooltip.style.zIndex = '10000';
    tooltip.style.pointerEvents = 'none';
    
    // Arrow pointing down to bridge
    tooltip.innerHTML = `
        ${bridgeName} | ${bars}
        <div style="position: absolute; bottom: -8px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 8px solid transparent; border-right: 8px solid transparent; border-top: 8px solid ${bridgeColor};"></div>
    `;
    
    document.getElementById('map').appendChild(tooltip);
    nameTooltip = tooltip;
}

function removeNameTooltip() {
    if (nameTooltip) {
        nameTooltip.remove();
        nameTooltip = null;
    }
}

function showRadialMenu(latlng, bridge) {
    closeAllMenus();
    
    const point = map.latLngToContainerPoint(latlng);
    
    // Create title above menu - moved up 225px total
    const title = L.DomUtil.create('div', 'menu-title');
    title.style.left = point.x + 'px';
    title.style.top = (point.y - 255) + 'px';
    
    // Convert bridge name to title case
    const bridgeName = bridge.bridge_name || 'Unknown';
    const titleCaseName = bridgeName.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    
    title.innerHTML = `
        <div class="menu-title-text">
            ${titleCaseName}<br>
            <span style="font-size: 12pt;">${bridge.bars_number}</span>
        </div>
    `;
    document.getElementById('map').appendChild(title);
    
    const menu = L.DomUtil.create('div', 'radial-menu');
    menu.style.left = point.x + 'px';
    menu.style.top = point.y + 'px';
    
    // Center - clickable links
    const center = L.DomUtil.create('div', 'radial-center', menu);
    center.innerHTML = `
        <div class="center-title">
            <a href="https://www.google.com/maps?q=${bridge.latitude},${bridge.longitude}" 
               target="_blank" class="center-link">Google</a>
            <a href="${bridge.bars_hyperlink || '#'}" 
               target="_blank" class="center-link">AssetWise</a>
        </div>
    `;
    
    // 5 nodes evenly spaced around the circle (72° apart)
    const nodes = [
        { angle: 270, label: 'Narrative', action: () => showNarratives(bridge) },        // Top (12 o'clock)
        { angle: 342, label: 'Condition', action: () => showCondition(bridge) },         // Top-right
        { angle: 54, label: 'Geometry', action: () => showGeometry(bridge) },            // Bottom-right
        { angle: 126, label: 'Attributes', action: () => showAttributes(bridge) },       // Bottom
        { angle: 198, label: 'Inspection', action: () => showInspectionsPopup(bridge) } // Bottom-left
    ];
    
    nodes.forEach(node => {
        const rad = node.angle * Math.PI / 180;
        const distance = 110; // Increased distance for better spacing
        
        const option = L.DomUtil.create('div', 'radial-option', menu);
        option.style.left = (distance * Math.cos(rad)) + 'px';
        option.style.top = (distance * Math.sin(rad)) + 'px';
        option.innerHTML = `<span class="label">${node.label}</span>`;
        
        option.onclick = function(e) {
            e.stopPropagation();
            node.action();
            // Keep menu open - persistent
        };
    });
    
    document.getElementById('map').appendChild(menu);
    radialMenu = { menu, title };
    
    // Click outside to close (but not on bridges)
    setTimeout(() => {
        const closeListener = function(e) {
            // Don't close if clicking on menu, info panel, or another bridge
            if (menu.contains(e.target) || 
                e.target.closest('.info-panel') ||
                e.target.closest('.leaflet-interactive')) {
                return;
            }
            closeAllMenus();
            document.removeEventListener('click', closeListener);
        };
        document.addEventListener('click', closeListener);
    }, 100);
}

function showGeometry(bridge) {
    const age = bridge.bridge_age ? `${bridge.bridge_age} years` : 'Unknown';
    
    createInfoPanel('Geometry & Specifications', `
        <div class="info-grid">
            <div class="info-item">
                <span class="info-label">Bridge Length</span>
                <span class="info-value">${bridge.bridge_length || 'N/A'} ft</span>
            </div>
            <div class="info-item">
                <span class="info-label">Total Length</span>
                <span class="info-value">${bridge.total_bridge_length || 'N/A'} ft</span>
            </div>
            <div class="info-item">
                <span class="info-label">Width (Out-to-Out)</span>
                <span class="info-value">${bridge.width_out_to_out || 'N/A'} ft</span>
            </div>
            <div class="info-item">
                <span class="info-label">Width (Curb-to-Curb)</span>
                <span class="info-value">${bridge.width_curb_to_curb || 'N/A'} ft</span>
            </div>
            <div class="info-item">
                <span class="info-label">Left Sidewalk</span>
                <span class="info-value">${bridge.left_sidewalk_width || 'N/A'} ft</span>
            </div>
            <div class="info-item">
                <span class="info-label">Right Sidewalk</span>
                <span class="info-value">${bridge.right_sidewalk_width || 'N/A'} ft</span>
            </div>
            <div class="info-item">
                <span class="info-label">Median</span>
                <span class="info-value">${bridge.bridge_median || 'N/A'} ft</span>
            </div>
            <div class="info-item">
                <span class="info-label">Skew</span>
                <span class="info-value">${bridge.skew || 'N/A'}°</span>
            </div>
            <div class="info-item">
                <span class="info-label">Max Height</span>
                <span class="info-value">${bridge.max_height || 'N/A'} ft</span>
            </div>
            <div class="info-item">
                <span class="info-label">Bridge Area</span>
                <span class="info-value">${bridge.bridge_area || 'N/A'} sq ft</span>
            </div>
            <div class="info-item">
                <span class="info-label">Min Vertical Clearance</span>
                <span class="info-value">${bridge.minvc1f || 'N/A'} ft</span>
            </div>
            <div class="info-item">
                <span class="info-label">Min Underclearance</span>
                <span class="info-value">${bridge.min_underclearance || 'N/A'} ft</span>
            </div>
            <div class="info-item">
                <span class="info-label">Year Built</span>
                <span class="info-value">${bridge.year_built || 'N/A'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Age</span>
                <span class="info-value">${age}</span>
            </div>
        </div>
        ${bridge.span_lengths ? `<div style="margin-top:15px;"><strong>Span Lengths:</strong> ${bridge.span_lengths}</div>` : ''}
    `, bridge);
}

function showAttributes(bridge) {
    createInfoPanel('Bridge Attributes', `
        <div class="info-grid">
            <div class="info-item">
                <span class="info-label">Latitude</span>
                <span class="info-value">${bridge.latitude || 'N/A'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Longitude</span>
                <span class="info-value">${bridge.longitude || 'N/A'}</span>
            </div>
            <div class="info-item full-width">
                <span class="info-label">Location</span>
                <span class="info-value">${bridge.location || 'N/A'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Design Number</span>
                <span class="info-value">${bridge.bridge_design_number || 'N/A'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Utilities</span>
                <span class="info-value">${bridge.utilities_on_bridge || 'N/A'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">NHS</span>
                <span class="info-value">${bridge.nhs || 'N/A'}</span>
            </div>
            <div class="info-item full-width">
                <span class="info-label">Functional Class</span>
                <span class="info-value">${bridge.functional_class || 'N/A'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Route</span>
                <span class="info-value">${bridge.route || 'N/A'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Subroute</span>
                <span class="info-value">${bridge.subroute || 'N/A'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">On Bridge</span>
                <span class="info-value">${bridge.on_bridge || 'N/A'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Under Bridge</span>
                <span class="info-value">${bridge.under_bridge || 'N/A'}</span>
            </div>
        </div>
    `, bridge);
}

function showNarratives(bridge) {
    const narratives = [
        { label: 'Paint', field: 'narrative_paint' },
        { label: 'Substructure', field: 'narrative_substructure' },
        { label: 'Deck', field: 'narrative_deck' },
        { label: 'Expansion Joint Openings', field: 'narrative_joints' },
        { label: 'Railings', field: 'narrative_railings' },
        { label: 'Superstructure', field: 'narrative_superstructure' },
        { label: 'Summary & Recommendations', field: 'narrative_summary' },
        { label: "Engineer's Comments", field: 'narrative_comments' }
    ];
    
    let html = '<div class="narrative-updated">Last updated on January 20, 2026</div>';
    narratives.forEach(n => {
        const text = bridge[n.field];
        if (text && text.trim()) {
            html += `
                <div class="narrative-section">
                    <h4>${n.label}</h4>
                    <p>${text}</p>
                </div>
            `;
        }
    });
    
    if (html === '<div class="narrative-updated">Last updated on January 20, 2026</div>') {
        html += '<p style="color:#999;">No narrative data available.</p>';
    }
    
    createInfoPanel('Inspection Narratives', html, bridge);
}

function showCondition(bridge) {
    // Get calculated sufficiency from loaded data
    let calcSufficiency = 'N/A';
    const bars = bridge.bars_number;
    
    if (sufficiencyData[bars] !== undefined) {
        calcSufficiency = sufficiencyData[bars].toFixed(1);
    }
    
    const ratings = [
        { label: 'Deck', value: bridge.deck_rating },
        { label: 'Superstructure', value: bridge.superstructure_rating },
        { label: 'Substructure', value: bridge.substructure_rating },
        { label: 'Bearings', value: bridge.bearings_rating },
        { label: 'Joints', value: bridge.joints_rating }
    ];
    
    let html = '<div class="condition-grid">';
    ratings.forEach(r => {
        const rating = r.value || 'N/A';
        const color = r.value ? conditionColors[r.value] || '#6b7280' : '#6b7280';
        html += `
            <div class="condition-item">
                <div class="condition-label">${r.label}</div>
                <div class="condition-rating" style="background:${color};">${rating}</div>
            </div>
        `;
    });
    html += '</div>';
    
    // Add calculated sufficiency box
    html += `
        <div style="margin-top: 20px; padding: 15px; background: rgba(255,184,28,0.1); border: 2px solid var(--wvdoh-yellow); border-radius: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 11pt; font-weight: 600; color: var(--wvdoh-yellow);">Calculated Sufficiency</span>
                <span style="font-size: 14pt; font-weight: 700; color: var(--wvdoh-yellow);">${calcSufficiency}</span>
            </div>
            <div style="margin-top: 8px; font-size: 9pt; color: rgba(255,255,255,0.6);">
                Source: Calculated from WVDOT Bridge Sufficiency Rating Model
            </div>
        </div>
    `;
    
    html += '<div style="margin-top:15px;font-size:12px;color:#999;">Rating scale: 1 (Poor) to 9 (Excellent)</div>';
    
    createInfoPanel('Condition Ratings', html, bridge);
}

function showPostings(bridge) {
    // Load rating/posting information
    const loadRatings = [
        { label: 'Inventory Rating (B.LR.05)', value: bridge.inventory_rating || 'N/A' },
        { label: 'IR (tons)', value: bridge.ir_tons || 'N/A' },
        { label: 'IR (ratio)', value: bridge.ir_ratio || 'N/A' },
        { label: 'Final IR (Tons)', value: bridge.final_ir_tons || 'N/A' }
    ];
    
    let html = '<div class="info-grid">';
    loadRatings.forEach(r => {
        html += `
            <div class="info-item full-width">
                <span class="info-label">${r.label}</span>
                <span class="info-value">${r.value}</span>
            </div>
        `;
    });
    html += '</div>';
    
    // Placeholder for posting restrictions
    html += `
        <div style="margin-top: 20px; padding: 15px; background: rgba(255,184,28,0.1); border: 1px solid var(--wvdoh-yellow); border-radius: 6px;">
            <h4 style="color: var(--wvdoh-yellow); margin-bottom: 10px;">Bridge Load Postings</h4>
            <p style="font-size: 10pt; color: rgba(255,255,255,0.8);">
                Posting restriction data will be integrated from the "Posting Changes for 5 Years" spreadsheet.
                This section will display current posting status and historical changes.
            </p>
        </div>
    `;
    
    createInfoPanel('Load Rating & Postings', html, bridge);
}

function createInfoPanel(title, content, bridge) {
    const existing = document.getElementById('infoPanel');
    if (existing) existing.remove();
    
    // Convert bridge name to title case
    const bridgeName = bridge.bridge_name || 'Unknown';
    const titleCaseName = bridgeName.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    
    const panel = L.DomUtil.create('div', 'info-panel');
    panel.id = 'infoPanel';
    panel.innerHTML = `
        <div class="info-header" id="panelDragHandle">
            <h3>
                <div style="font-size: 16pt; font-weight: bold; margin-bottom: 5px;">${titleCaseName}</div>
                <div style="font-size: 12pt;">${title}</div>
            </h3>
            <button class="close-btn" onclick="document.getElementById('infoPanel').remove()">×</button>
        </div>
        <div class="info-content">${content}</div>
    `;
    
    document.body.appendChild(panel);
    
    // Make draggable
    makeDraggable(panel, document.getElementById('panelDragHandle'));
}

function makeDraggable(element, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    let isDragging = false;
    
    handle.onmousedown = dragMouseDown;
    
    function dragMouseDown(e) {
        e.preventDefault();
        isDragging = true;
        pos3 = e.clientX;
        pos4 = e.clientY;
        
        // Remove transform on first drag to get actual position
        if (element.style.transform) {
            const rect = element.getBoundingClientRect();
            element.style.left = rect.left + 'px';
            element.style.top = rect.top + 'px';
            element.style.transform = 'none';
        }
        
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }
    
    function elementDrag(e) {
        if (!isDragging) return;
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        
        element.style.top = (element.offsetTop - pos2) + "px";
        element.style.left = (element.offsetLeft - pos1) + "px";
    }
    
    function closeDragElement() {
        isDragging = false;
        document.onmouseup = null;
        document.onmousemove = null;
    }
}

function closeAllMenus() {
    removeNameTooltip();
    if (radialMenu) {
        if (radialMenu.menu) radialMenu.menu.remove();
        if (radialMenu.title) radialMenu.title.remove();
        radialMenu = null;
    }
    // Close all info panels (popups)
    document.querySelectorAll('.info-panel').forEach(panel => panel.remove());
}

function getBridgeColor(bridge) {
    if (currentMode === 'evaluation') {
        return getEvaluationColor(bridge);
    }
    return districtColors[bridge.district] || '#00d9ff';
}

// Helper function to get sufficiency rating on 0-9 scale
function getSufficiencyRating(bridge) {
    const bars = bridge.bars_number;
    if (sufficiencyData[bars] !== undefined) {
        // Convert 0-100% scale to 0-9 scale
        return sufficiencyData[bars] / 100 * 9;
    }
    return null;
}

function getEvaluationColor(bridge) {
    const activeSliders = Object.entries(sliderValues).filter(([k, v]) => v > 0);
    
    // If no sliders active, use worst condition color
    if (activeSliders.length === 0) {
        return getWorstConditionColor(bridge);
    }
    
    // Get real sufficiency rating (0-9 scale)
    const calcSufficiency = getSufficiencyRating(bridge);
    
    // SUFFICIENCY FILTER: If sufficiency slider is active, filter by it
    const sufficiencySlider = sliderValues.sufficiency;
    if (sufficiencySlider < 100) {
        // If bridge has no sufficiency data, hide it when filter is active
        if (calcSufficiency == null) {
            return '#6b7280'; // Gray (will be hidden by opacity=0)
        }
        
        // Convert slider value (0-100) to rating threshold (0-9)
        const sufficiencyThreshold = sufficiencySlider / 100 * 9;
        
        // Apply filter based on mode
        if (sufficiencyMode === 'lte') {
            // ≤ Mode: Show bridges with sufficiency ≤ threshold
            if (calcSufficiency > sufficiencyThreshold) {
                return '#6b7280'; // Hide
            }
        } else {
            // ≥ Mode: Show bridges with sufficiency ≥ threshold
            if (calcSufficiency < sufficiencyThreshold) {
                return '#6b7280'; // Hide
            }
        }
    }
    
    const ratingMap = {
        deck: bridge.deck_rating,
        superstructure: bridge.superstructure_rating,
        substructure: bridge.substructure_rating,
        bearings: bridge.bearings_rating,
        joints: bridge.joints_rating
    };
    
    // SEVERITY SCORING: Only for non-sufficiency sliders
    const severitySliders = activeSliders.filter(([k]) => k !== 'sufficiency');
    
    // If only sufficiency slider active, use worst condition color
    if (severitySliders.length === 0) {
        return getWorstConditionColor(bridge);
    }
    
    let totalSeverity = 0;
    let numActiveWithRatings = 0;
    
    severitySliders.forEach(([key, sliderValue]) => {
        const rating = ratingMap[key];
        if (rating != null && rating !== undefined) {
            const badness = (9 - rating);
            const severityContribution = badness * (sliderValue / 100);
            totalSeverity += severityContribution;
            numActiveWithRatings++;
        }
    });
    
    if (numActiveWithRatings === 0) return '#6b7280';
    
    const avgSeverity = totalSeverity / numActiveWithRatings;
    const effectiveRating = Math.round(9 - avgSeverity);
    
    return conditionColors[Math.max(1, Math.min(9, effectiveRating))] || '#6b7280';
}

function getWorstConditionColor(bridge) {
    const ratings = [
        bridge.deck_rating,
        bridge.superstructure_rating,
        bridge.substructure_rating,
        bridge.bearings_rating,
        bridge.joints_rating
    ].filter(r => r != null);
    
    if (ratings.length === 0) return '#6b7280';
    
    const worst = Math.min(...ratings);
    return conditionColors[worst] || '#6b7280';
}

function getPointSize() {
    return pointSizes[currentZoom] || 8;
}

function getEvaluationSize(bridge, baseSize) {
    const activeSliders = Object.entries(sliderValues).filter(([k, v]) => v > 0);
    if (activeSliders.length === 0) return baseSize;
    
    // Get real sufficiency rating
    const calcSufficiency = getSufficiencyRating(bridge);
    
    const ratingMap = {
        deck: bridge.deck_rating,
        superstructure: bridge.superstructure_rating,
        substructure: bridge.substructure_rating,
        bearings: bridge.bearings_rating,
        joints: bridge.joints_rating
    };
    
    // SEVERITY SCORING (excluding sufficiency which is a filter)
    const severitySliders = activeSliders.filter(([k]) => k !== 'sufficiency');
    
    if (severitySliders.length === 0) return baseSize;
    
    let totalSeverity = 0;
    let numActiveWithRatings = 0;
    
    severitySliders.forEach(([key, sliderValue]) => {
        const rating = ratingMap[key];
        if (rating != null && rating > 0) {
            const badness = (9 - rating);
            const severityContribution = badness * (sliderValue / 100);
            totalSeverity += severityContribution;
            numActiveWithRatings++;
        }
    });
    
    if (numActiveWithRatings === 0) return baseSize;
    
    const avgSeverity = totalSeverity / numActiveWithRatings;
    const sizeFactor = avgSeverity / 8;
    return baseSize + (baseSize * 2.1 * sizeFactor);
}

function getEvaluationOpacity(bridge) {
    // Get real sufficiency rating
    const calcSufficiency = getSufficiencyRating(bridge);
    
    const activeSliders = Object.entries(sliderValues).filter(([k, v]) => v > 0);
    
    // SUFFICIENCY FILTER: Hide bridges that don't meet threshold
    const sufficiencySlider = sliderValues.sufficiency;
    if (sufficiencySlider < 100) {
        // Hide bridges without sufficiency data when filter is active
        if (calcSufficiency == null) {
            return 0; // Hide bridge
        }
        
        const sufficiencyThreshold = sufficiencySlider / 100 * 9;
        
        if (sufficiencyMode === 'lte') {
            // ≤ Mode: Show bridges with sufficiency ≤ threshold
            if (calcSufficiency > sufficiencyThreshold) {
                return 0; // Hide bridge
            }
        } else {
            // ≥ Mode: Show bridges with sufficiency ≥ threshold
            if (calcSufficiency < sufficiencyThreshold) {
                return 0; // Hide bridge
            }
        }
    }
    
    // If no sliders active, show all bridges based on worst rating
    if (activeSliders.length === 0) {
        const ratings = [
            bridge.deck_rating,
            bridge.superstructure_rating,
            bridge.substructure_rating,
            bridge.bearings_rating,
            bridge.joints_rating,
            calcSufficiency
        ].filter(r => r != null && r !== undefined && r > 0);
        
        if (ratings.length === 0) return 0.85;
        const worst = Math.min(...ratings);
        return 0.2 + (0.65 * (9 - worst) / 8);
    }
    
    // SEVERITY SCORING with sliders active (excluding sufficiency)
    const ratingMap = {
        deck: bridge.deck_rating,
        superstructure: bridge.superstructure_rating,
        substructure: bridge.substructure_rating,
        bearings: bridge.bearings_rating,
        joints: bridge.joints_rating
    };
    
    const severitySliders = activeSliders.filter(([k]) => k !== 'sufficiency');
    
    // If only sufficiency is active, show based on worst rating
    if (severitySliders.length === 0) {
        const ratings = Object.values(ratingMap).filter(r => r != null && r > 0);
        if (ratings.length === 0) return 0.85;
        const worst = Math.min(...ratings);
        return 0.2 + (0.65 * (9 - worst) / 8);
    }
    
    let totalSeverity = 0;
    let numActiveWithRatings = 0;
    
    severitySliders.forEach(([key, sliderValue]) => {
        const rating = ratingMap[key];
        if (rating != null && rating !== undefined && rating > 0) {
            const badness = (9 - rating);
            const severityContribution = badness * (sliderValue / 100);
            totalSeverity += severityContribution;
            numActiveWithRatings++;
        }
    });
    
    if (numActiveWithRatings === 0) return 0;
    
    const avgSeverity = totalSeverity / numActiveWithRatings;
    const opacityFactor = avgSeverity / 8;
    return 0.2 + (0.65 * opacityFactor);
}

function updateBridgeSizes() {
    // If inspection filters are active, use inspection update logic
    if (inspectionFiltersActive) {
        updateBridgesForInspection();
        return;
    }
    
    const baseSize = getPointSize();
    Object.values(bridgeLayers).forEach(marker => {
        const bridge = marker.bridgeData;
        const size = evaluationActive ? getEvaluationSize(bridge, baseSize) : baseSize;
        let opacity = evaluationActive ? getEvaluationOpacity(bridge) : 0.85;
        let outlineOpacity = 1;
        const color = getBridgeColor(bridge);
        
        // Check district filter first
        const districtActive = activeDistricts[bridge.district];
        if (!districtActive) {
            opacity = 0;
            outlineOpacity = 0;
        }
        
        // Apply search filter if active (only if district is active)
        if (districtActive && currentSearchQuery.length > 0) {
            const bars = (bridge.bars_number || '').toUpperCase();
            const name = (bridge.bridge_name || '').toUpperCase();
            
            // Smart search: numbers = startsWith, words = includes (contains)
            const isNumericSearch = /^\d/.test(currentSearchQuery);
            const matchesBars = isNumericSearch ? bars.startsWith(currentSearchQuery) : bars.includes(currentSearchQuery);
            const matchesName = isNumericSearch ? name.startsWith(currentSearchQuery) : name.includes(currentSearchQuery);
            
            if (!matchesBars && !matchesName) {
                opacity = 0; // Hide fill
                outlineOpacity = 0; // Hide outline
            }
        }
        
        // Hide outline when fill is hidden (evaluation mode)
        if (opacity === 0) {
            outlineOpacity = 0;
        }
        
        marker.setRadius(size);
        marker.setStyle({ 
            fillOpacity: opacity,
            fillColor: color,
            opacity: outlineOpacity
        });
    });
}

function setupModeSwitch() {
    document.getElementById('modeToggle').addEventListener('click', toggleEvaluationMode);
}

function toggleEvaluationMode() {
    evaluationActive = !evaluationActive;
    currentMode = evaluationActive ? 'evaluation' : 'default';
    
    const btn = document.getElementById('modeToggle');
    btn.textContent = evaluationActive ? 'Exit Evaluation Mode' : 'Enter Evaluation Mode';
    btn.classList.toggle('evaluation-mode');
    
    const panel = document.getElementById('evaluationPanel');
    panel.style.display = evaluationActive ? 'flex' : 'none';
    
    Object.entries(bridgeLayers).forEach(([bars, marker]) => {
        const bridge = bridgesData.find(b => b.bars_number === bars);
        if (bridge) {
            marker.setStyle({ fillColor: getBridgeColor(bridge) });
        }
    });
    
    if (evaluationActive) {
        updateBridgeSizes();
    } else {
        const baseSize = getPointSize();
        Object.values(bridgeLayers).forEach(m => m.setRadius(baseSize));
    }
}

function createEvaluationPanel() {
    // Panel already exists in HTML, just set up event listeners
    const criteria = ['deck', 'superstructure', 'substructure', 'bearings', 'joints', 'sufficiency'];
    
    criteria.forEach(key => {
        const slider = document.getElementById(`slider-${key}`);
        if (slider) {
            slider.addEventListener('input', function() {
                sliderValues[key] = parseInt(this.value);
                // Don't add % to sufficiency
                const displayValue = (key === 'sufficiency') ? this.value : this.value + '%';
                document.getElementById(`value-${key}`).textContent = displayValue;
                
                // AUTO-APPLY: Activate evaluation mode and update immediately
                evaluationActive = true;
                currentMode = 'evaluation';
                updateBridgeSizes();
            });
        }
    });
}

window.toggleEvaluationPanel = function() {
    const panel = document.getElementById('evaluationPanel');
    panel.classList.toggle('collapsed');
    const btn = panel.querySelector('.toggle-panel');
    btn.textContent = panel.classList.contains('collapsed') ? '▶' : '◀';
};

window.resetSliders = function() {
    Object.keys(sliderValues).forEach(key => {
        sliderValues[key] = 0;
        document.getElementById(`slider-${key}`).value = 0;
        const displayValue = (key === 'sufficiency') ? '0' : '0%';
        document.getElementById(`value-${key}`).textContent = displayValue;
    });
    applyEvaluation();
};

window.applyEvaluation = function() {
    updateBridgeSizes();
};

window.resetMaintenanceTab = function() {
    // Reset all sliders
    Object.keys(sliderValues).forEach(key => {
        const defaultValue = (key === 'sufficiency') ? 100 : 0;
        sliderValues[key] = defaultValue;
        const slider = document.getElementById(`slider-${key}`);
        if (slider) slider.value = defaultValue;
        const displayValue = (key === 'sufficiency') ? '100' : '0%';
        const valueDisplay = document.getElementById(`value-${key}`);
        if (valueDisplay) valueDisplay.textContent = displayValue;
    });
    
    // Reset sufficiency mode to ≤
    sufficiencyMode = 'lte';
    const toggleBtn = document.getElementById('sufficiency-mode-toggle');
    if (toggleBtn) toggleBtn.textContent = '≤ Mode';
    
    // Deactivate evaluation mode and return to district colors
    evaluationActive = false;
    currentMode = 'default';
    
    // Get base size for current zoom
    const baseSize = getPointSize();
    
    // Reset all bridges to district colors AND base size
    Object.entries(bridgeLayers).forEach(([bars, marker]) => {
        const bridge = bridgesData.find(b => b.bars_number === bars);
        if (bridge) {
            const districtActive = activeDistricts[bridge.district];
            if (districtActive) {
                marker.setRadius(baseSize); // Reset size!
                marker.setStyle({
                    fillColor: districtColors[bridge.district],
                    fillOpacity: 0.85,
                    opacity: 1
                });
            }
        }
    });
    
    console.log('Maintenance tab reset');
};

window.toggleSufficiencyMode = function() {
    sufficiencyMode = (sufficiencyMode === 'lte') ? 'gte' : 'lte';
    const toggleBtn = document.getElementById('sufficiency-mode-toggle');
    if (toggleBtn) {
        toggleBtn.textContent = (sufficiencyMode === 'lte') ? '≤ Mode' : '≥ Mode';
    }
    // Re-evaluate bridges with new mode
    updateBridgeSizes();
};

function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    
    searchInput.addEventListener('input', (e) => {
        const originalValue = e.target.value.toUpperCase();
        currentSearchQuery = originalValue.trim();
        applySearch();
        
        // Auto-zoom to results after 2+ numbers OR after any word ends (space detected)
        const isNumericSearch = /^\d/.test(currentSearchQuery);
        const wordCount = originalValue.trim().split(/\s+/).length;
        const hasSpace = originalValue.includes(' ');
        
        const shouldZoom = (isNumericSearch && currentSearchQuery.length >= 2) || 
                          (!isNumericSearch && hasSpace && currentSearchQuery.length > 0);
        
        if (shouldZoom) {
            zoomToSearchResults();
        }
    });
    
    // ESC key resets to defaults
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            // Clear search
            searchInput.value = '';
            currentSearchQuery = '';
            
            // Reset sliders if in evaluation mode
            if (evaluationActive) {
                Object.keys(sliderValues).forEach(key => {
                    sliderValues[key] = 0;
                    const slider = document.getElementById(`slider-${key}`);
                    const valueDisplay = document.getElementById(`value-${key}`);
                    if (slider) slider.value = 0;
                    if (valueDisplay) valueDisplay.textContent = '0';
                });
            }
            
            // Reapply to restore all bridges
            applySearch();
            updateBridgeSizes();
        }
    });
}

function zoomToSearchResults() {
    // Collect all visible bridge coordinates
    const visibleCoords = [];
    
    Object.values(bridgeLayers).forEach(marker => {
        const options = marker.options;
        if (options.opacity > 0 && options.fillOpacity > 0) {
            visibleCoords.push(marker.getLatLng());
        }
    });
    
    if (visibleCoords.length === 0) return;
    
    // Create bounds from visible bridges
    const bounds = L.latLngBounds(visibleCoords);
    
    // Fit map to bounds with padding
    map.fitBounds(bounds, {
        padding: [50, 50],
        maxZoom: 13
    });
}

function applySearch() {
    if (currentSearchQuery.length === 0) {
        // No search - restore all bridges
        Object.values(bridgeLayers).forEach(marker => {
            const bridge = marker.bridgeData;
            marker.setStyle({ 
                fillOpacity: evaluationActive ? getEvaluationOpacity(bridge) : 0.85,
                opacity: 1 // Outline visible
            });
        });
        return;
    }
    
    // Search on BARS number OR bridge name
    Object.values(bridgeLayers).forEach(marker => {
        const bridge = marker.bridgeData;
        const bars = (bridge.bars_number || '').toUpperCase();
        const name = (bridge.bridge_name || '').toUpperCase();
        
        // Smart search: numbers = startsWith, words = includes
        const isNumericSearch = /^\d/.test(currentSearchQuery);
        const matchesBars = isNumericSearch ? bars.startsWith(currentSearchQuery) : bars.includes(currentSearchQuery);
        const matchesName = isNumericSearch ? name.startsWith(currentSearchQuery) : name.includes(currentSearchQuery);
        
        if (matchesBars || matchesName) {
            // Match - check if district is active
            const districtActive = activeDistricts[bridge.district];
            if (districtActive) {
                marker.setStyle({ 
                    fillOpacity: evaluationActive ? getEvaluationOpacity(bridge) : 0.85,
                    opacity: 1 // Outline visible
                });
            } else {
                marker.setStyle({ 
                    fillOpacity: 0,
                    opacity: 0
                });
            }
        } else {
            // No match - hide both fill and outline
            marker.setStyle({ 
                fillOpacity: 0,
                opacity: 0 // Outline hidden
            });
        }
    });
}

function updateStats() {
    // Stats panel removed per user request
}

function createDebugPanel() {
    const panel = L.DomUtil.create('div', 'debug-panel');
    panel.id = 'debugPanel';
    document.body.appendChild(panel);
    updateDebugPanel();
}

function updateDebugPanel() {
    const panel = document.getElementById('debugPanel');
    if (!panel) return;
    
    panel.innerHTML = `
        <h4>UI Metrics</h4>
        <div class="debug-item"><span>Zoom:</span><span>${currentZoom}</span></div>
        <div class="debug-item"><span>Point Size:</span><span>${getPointSize()}px</span></div>
        <div class="debug-item"><span>Mode:</span><span>${currentMode}</span></div>
        <div class="debug-item"><span>Bridges:</span><span>${Object.keys(bridgeLayers).length}</span></div>
    `;
}

// District toggle functionality
function setupDistrictToggles() {
    // District bounds (calculated from bridge coordinates)
    const districtBounds = {
        'District 1': [[37.802, -82.184], [39.013, -80.824]],
        'District 2': [[37.528, -82.605], [38.586, -81.673]],
        'District 3': [[38.539, -81.880], [39.460, -80.841]],
        'District 4': [[39.108, -80.893], [39.720, -79.488]],
        'District 5': [[38.798, -79.424], [39.693, -77.742]],
        'District 6': [[39.340, -81.018], [40.621, -80.436]],
        'District 7': [[38.364, -81.214], [39.294, -79.846]],
        'District 8': [[38.064, -80.299], [39.237, -79.110]],
        'District 9': [[37.397, -81.364], [38.522, -80.083]],
        'District 10': [[37.206, -81.946], [37.969, -80.869]]
    };
    
    const legendItems = document.querySelectorAll('.legend-item');
    legendItems.forEach((item, index) => {
        const districtName = `District ${index + 1}`;
        item.addEventListener('click', () => {
            // Check if ALL districts are currently off (meaning this is the only one on)
            const onlyThisOneActive = activeDistricts[districtName] && 
                                     Object.entries(activeDistricts).filter(([k,v]) => v && k !== districtName).length === 0;
            
            if (onlyThisOneActive) {
                // Clicking the only active district - turn all back on and zoom to WV
                Object.keys(activeDistricts).forEach(district => {
                    activeDistricts[district] = true;
                });
                legendItems.forEach(i => i.classList.remove('inactive'));
                map.fitBounds(initialView.bounds, { padding: initialView.padding, maxZoom: initialView.maxZoom });
            } else {
                // Turn off ALL districts except this one
                Object.keys(activeDistricts).forEach(district => {
                    activeDistricts[district] = (district === districtName);
                });
                legendItems.forEach((i, idx) => {
                    if (idx + 1 === index + 1) {
                        i.classList.remove('inactive');
                    } else {
                        i.classList.add('inactive');
                    }
                });
                
                // Zoom to this district
                const bounds = districtBounds[districtName];
                if (bounds) {
                    map.fitBounds(bounds, { padding: [30, 30] });
                }
            }
            
            // Update toggle all button state
            syncToggleAllButton();
            
            // Update bridge visibility
            updateBridgeVisibility();
        });
    });
}

window.toggleAllDistricts = function() {
    const legendItems = document.querySelectorAll('.legend-item');
    const toggleBtn = document.getElementById('toggleAllDistricts');
    
    // Check if all districts are currently active
    const allActive = Object.values(activeDistricts).every(v => v === true);
    
    if (allActive) {
        // Turn all OFF
        Object.keys(activeDistricts).forEach(district => {
            activeDistricts[district] = false;
        });
        legendItems.forEach(item => item.classList.add('inactive'));
        toggleBtn.textContent = 'All On';
    } else {
        // Turn all ON
        Object.keys(activeDistricts).forEach(district => {
            activeDistricts[district] = true;
        });
        legendItems.forEach(item => item.classList.remove('inactive'));
        toggleBtn.textContent = 'All Off';
        
        // Zoom back to WV overview
        map.fitBounds(initialView.bounds, { padding: initialView.padding, maxZoom: initialView.maxZoom });
    }
    
    // Update bridge visibility
    updateBridgeVisibility();
};

function syncToggleAllButton() {
    const toggleBtn = document.getElementById('toggleAllDistricts');
    if (!toggleBtn) return;
    
    const allActive = Object.values(activeDistricts).every(v => v === true);
    toggleBtn.textContent = allActive ? 'All Off' : 'All On';
}

function updateBridgeVisibility() {
    // If inspection filters are active, use inspection update logic
    if (inspectionFiltersActive) {
        updateBridgesForInspection();
        return;
    }
    
    Object.entries(bridgeLayers).forEach(([bars, marker]) => {
        const bridge = bridgesData.find(b => b.bars_number === bars);
        if (!bridge) return;
        
        const districtActive = activeDistricts[bridge.district];
        
        // Search matching (consistent with applySearch)
        let searchMatch = true;
        if (currentSearchQuery) {
            const barsUpper = bars.toUpperCase();
            const nameUpper = (bridge.bridge_name || '').toUpperCase();
            const matchesBars = barsUpper.startsWith(currentSearchQuery);
            const matchesName = nameUpper.includes(currentSearchQuery);
            searchMatch = matchesBars || matchesName;
        }
        
        if (districtActive && searchMatch) {
            if (evaluationActive) {
                marker.setStyle({ 
                    fillColor: getEvaluationColor(bridge),
                    fillOpacity: getEvaluationOpacity(bridge),
                    opacity: 1
                });
            } else {
                marker.setStyle({ 
                    fillColor: districtColors[bridge.district],
                    fillOpacity: 0.85,
                    opacity: 1
                });
            }
        } else {
            marker.setStyle({ 
                fillOpacity: 0,
                opacity: 0
            });
        }
    });
}

// Auto-hide functionality
window.addEventListener('DOMContentLoaded', init);

// Update toggle function for folder tab
window.toggleEvaluationPanel = function() {
    const panel = document.getElementById('evaluationPanel');
    const isOpen = panel.classList.contains('open');
    
    if (isOpen) {
        // Closing panel - disable evaluation
        panel.classList.remove('open');
        evaluationActive = false;
        currentMode = 'default';
        updateBridgeSizes();
    } else {
        // Opening panel - enable evaluation
        panel.classList.add('open');
        evaluationActive = true;
        currentMode = 'evaluation';
        updateBridgeSizes();
    }
};

// Section switcher
window.switchSection = function(section) {
    console.log('Switching to:', section);
    
    // Close all popups
    closeAllMenus();
    
    // Handle leaving inspection tab
    if (section !== 'inspection' && inspectionFiltersActive) {
        console.log('Leaving inspection, resetting...');
        resetInspectionView();
    }
    
    // Handle leaving maintenance tab
    if (section !== 'maintenance' && evaluationActive) {
        console.log('Leaving maintenance, resetting sliders...');
        // Reset sliders
        Object.keys(sliderValues).forEach(key => {
            sliderValues[key] = 0;
            const slider = document.getElementById(`slider-${key}`);
            const valueDisplay = document.getElementById(`value-${key}`);
            if (slider) slider.value = 0;
            if (valueDisplay) valueDisplay.textContent = '0%';
        });
        evaluationActive = false;
        currentMode = 'default';
        const statusBar = document.getElementById('statusBar');
        if (statusBar) statusBar.style.display = 'none';
        updateBridgeSizes();
    }
    
    // Handle entering maintenance tab - ensure clean state
    if (section === 'maintenance') {
        console.log('Entering maintenance tab');
        // Make sure we're not in inspection mode
        if (inspectionFiltersActive) {
            resetInspectionView();
        }
        // Start in default mode (not evaluation until sliders moved)
        currentMode = 'default';
        evaluationActive = false;
        
        // RESET TO DISTRICT COLORS
        console.log('Resetting to district colors...');
        Object.entries(bridgeLayers).forEach(([bars, marker]) => {
            const bridge = bridgesData.find(b => b.bars_number === bars);
            if (bridge) {
                const districtActive = activeDistricts[bridge.district];
                
                // Check search filter
                let matchesSearch = true;
                if (currentSearchQuery.length > 0) {
                    const barsUpper = (bridge.bars_number || '').toUpperCase();
                    const nameUpper = (bridge.bridge_name || '').toUpperCase();
                    const isNumericSearch = /^\d/.test(currentSearchQuery);
                    const matchesBars = isNumericSearch ? barsUpper.startsWith(currentSearchQuery) : barsUpper.includes(currentSearchQuery);
                    const matchesName = isNumericSearch ? nameUpper.startsWith(currentSearchQuery) : nameUpper.includes(currentSearchQuery);
                    matchesSearch = matchesBars || matchesName;
                }
                
                if (districtActive && matchesSearch) {
                    marker.setStyle({
                        fillColor: districtColors[bridge.district],
                        fillOpacity: 0.85,
                        opacity: 1
                    });
                } else {
                    marker.setStyle({
                        fillOpacity: 0,
                        opacity: 0
                    });
                }
            }
        });
    }
    
    // Update button states
    const inspectionBtn = document.querySelector('.section-btn.inspection');
    const maintenanceBtn = document.querySelector('.section-btn.maintenance');
    
    if (inspectionBtn) inspectionBtn.classList.remove('active');
    if (maintenanceBtn) maintenanceBtn.classList.remove('active');
    
    if (section === 'inspection' && inspectionBtn) {
        inspectionBtn.classList.add('active');
    } else if (section === 'maintenance' && maintenanceBtn) {
        maintenanceBtn.classList.add('active');
    }
    
    // Update content visibility
    const inspectionSection = document.getElementById('inspectionSection');
    const maintenanceSection = document.getElementById('maintenanceSection');
    
    if (inspectionSection) inspectionSection.classList.remove('active');
    if (maintenanceSection) maintenanceSection.classList.remove('active');
    
    if (section === 'inspection' && inspectionSection) {
        inspectionSection.classList.add('active');
    } else if (section === 'maintenance' && maintenanceSection) {
        maintenanceSection.classList.add('active');
    }
    
    console.log('✓ Switched to:', section);
};

// ========================================
// INSPECTION SYSTEM
// ========================================

// Apply inspection filters
window.applyInspectionFilters = function() {
    // Get selected inspection types
    selectedInspectionTypes = [];
    document.querySelectorAll('[id^="insp-"]:checked').forEach(cb => {
        selectedInspectionTypes.push(cb.value);
    });
    
    // Get selected months
    selectedMonths = [];
    document.querySelectorAll('.month-checkbox:checked').forEach(cb => {
        selectedMonths.push(parseInt(cb.value));
    });
    
    // Activate inspection mode ONLY if types or months are selected
    if (selectedInspectionTypes.length > 0 || selectedMonths.length > 0) {
        inspectionFiltersActive = true;
        currentMode = 'inspection';
        updateStatusBar();
        updateBridgesForInspection();
    } else {
        // No filters - return to default view
        inspectionFiltersActive = false;
        currentMode = 'default';
        document.getElementById('statusBar').style.display = 'none';
        updateBridgeSizes(); // Reset to default
    }
};

// Auto-apply inspection filters when checkboxes change
document.addEventListener('DOMContentLoaded', function() {
    // Add listeners to all inspection type checkboxes
    document.querySelectorAll('[id^="insp-"]').forEach(cb => {
        cb.addEventListener('change', applyInspectionFilters);
    });
    
    // Add listeners to all month checkboxes
    document.querySelectorAll('.month-checkbox').forEach(cb => {
        cb.addEventListener('change', applyInspectionFilters);
    });
});

// Reset inspection view
window.resetInspectionView = function() {
    // Uncheck all inspection type checkboxes
    document.querySelectorAll('[id^="insp-"]').forEach(cb => cb.checked = false);
    
    // Uncheck all month checkboxes
    document.querySelectorAll('.month-checkbox').forEach(cb => cb.checked = false);
    
    // Reset state
    selectedInspectionTypes = [];
    selectedMonths = [];
    showOverduePlus = false;
    inspectionFiltersActive = false;
    currentMode = 'default';
    
    // Hide status bar
    const statusBar = document.getElementById('statusBar');
    if (statusBar) statusBar.style.display = 'none';
    
    // Reset bridge display to default
    updateBridgeSizes();
};

window.resetInspectionTab = function() {
    // Just call the existing reset function
    resetInspectionView();
    console.log('Inspection tab reset');
};

// Smart reset - detects which tab is active and calls appropriate function
window.resetCurrentTab = function() {
    const inspectionSection = document.getElementById('inspectionSection');
    const maintenanceSection = document.getElementById('maintenanceSection');
    
    if (inspectionSection && inspectionSection.classList.contains('active')) {
        resetInspectionTab();
    } else if (maintenanceSection && maintenanceSection.classList.contains('active')) {
        resetMaintenanceTab();
    }
};

// ESC key to reset
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && inspectionFiltersActive) {
        resetInspectionView();
    }
});

// Update status bar
function updateStatusBar() {
    const statusBar = document.getElementById('statusBar');
    const statusText = document.getElementById('statusText');
    
    if (!inspectionFiltersActive) {
        statusBar.style.display = 'none';
        return;
    }
    
    statusBar.style.display = 'flex';
    
    // Simple format: "Inspection View | Routine"
    let text = 'Inspection View';
    if (selectedInspectionTypes.length > 0) {
        text += ' | ' + selectedInspectionTypes.join(', ');
    }
    
    statusText.textContent = text;
}

// Calculate inspection status for a bridge
function getInspectionStatus(bridge) {
    const bars = bridge.bars_number;
    const inspections = inspectionsData[bars];
    
    if (!inspections || inspections.length === 0) {
        return { hasInspections: false, overdueCount: 0, nearestDue: null };
    }
    
    const today = new Date();
    let overdueCount = 0;
    let nearestDue = null;
    let nearestDueDate = null;
    
    inspections.forEach(insp => {
        if (!insp.due) return;
        
        // Parse due date
        const dueDate = parseDateString(insp.due);
        if (!dueDate) return;
        
        // Check if overdue
        if (dueDate < today) {
            overdueCount++;
        }
        
        // Track nearest due date
        if (!nearestDueDate || dueDate < nearestDueDate) {
            nearestDueDate = dueDate;
            nearestDue = insp;
        }
    });
    
    return { hasInspections: true, overdueCount, nearestDue, nearestDueDate };
}

// Parse date string (handles MM/DD/YYYY and ISO formats)
function parseDateString(dateStr) {
    if (!dateStr) return null;
    
    try {
        // Try ISO format first
        if (dateStr.includes('T')) {
            return new Date(dateStr);
        }
        
        // Try MM/DD/YYYY format
        const parts = dateStr.split('/');
        if (parts.length === 3) {
            return new Date(parts[2], parts[0] - 1, parts[1]);
        }
        
        return new Date(dateStr);
    } catch (e) {
        return null;
    }
}

// Update bridges based on inspection filters
function updateBridgesForInspection() {
    const today = new Date();
    const baseSize = getPointSize();
    
    // Array to track bridges by overdue count for drawing order
    const bridgesByOverdue = [];
    
    Object.entries(bridgeLayers).forEach(([bars, marker]) => {
        const bridge = bridgesData.find(b => b.bars_number === bars);
        if (!bridge) return;
        
        // CHECK DISTRICT FILTER FIRST
        const districtActive = activeDistricts[bridge.district];
        if (!districtActive) {
            marker.setStyle({ fillOpacity: 0, opacity: 0 });
            return;
        }
        
        const inspections = inspectionsData[bars];
        
        let show = false;
        let color = districtColors[bridge.district] || '#00d9ff';  // Default to district color
        let size = baseSize;
        let overdueCount = 0;
        let daysOverdue = 0;
        
        if (inspections && inspections.length > 0) {
            // Filter by inspection type if selected
            let relevantInspections = inspections;
            if (selectedInspectionTypes.length > 0) {
                relevantInspections = inspections.filter(insp => 
                    selectedInspectionTypes.includes(insp.type)
                );
                
                // If no relevant inspections after type filter, hide
                if (relevantInspections.length === 0) {
                    marker.setStyle({ fillOpacity: 0, opacity: 0 });
                    return;
                }
            }
            
            // Calculate overdue count and due dates
            let matchesMonth = false;
            
            relevantInspections.forEach(insp => {
                if (!insp.due) return;
                
                const dueDate = parseDateString(insp.due);
                if (!dueDate) return;
                
                // Check if overdue
                if (dueDate < today) {
                    overdueCount++;
                    const daysDiff = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
                    daysOverdue = Math.max(daysOverdue, daysDiff);
                }
                
                // Check if matches selected month
                if (selectedMonths.length > 0) {
                    const dueMonth = dueDate.getMonth() + 1;
                    if (selectedMonths.includes(dueMonth)) {
                        matchesMonth = true;
                    }
                }
            });
            
            // Determine if bridge should be shown
            if (selectedMonths.length > 0) {
                show = matchesMonth;
            } else if (selectedInspectionTypes.length > 0) {
                // Types selected - show only bridges with those types
                show = true;
            } else {
                // NO filters - show ALL bridges
                show = true;
            }
            
            if (show) {
                // SIZE: Based on number of overdue inspections
                if (overdueCount > 0) {
                    size = baseSize + (overdueCount * 3); // +3px per overdue
                    size = Math.min(size, 25); // Cap at 25px
                }
                
                // COLOR: Use inspection color scheme when filters are active
                if (overdueCount > 0) {
                    // Red gradient based on days overdue
                    if (daysOverdue > 180) {
                        color = '#7F1D1D'; // Dark red (6+ months overdue)
                    } else if (daysOverdue > 90) {
                        color = '#991B1B'; // Red (3-6 months overdue)
                    } else if (daysOverdue > 30) {
                        color = '#DC2626'; // Bright red (1-3 months overdue)
                    } else {
                        color = '#EF4444'; // Light red (recently overdue)
                    }
                } else if (selectedInspectionTypes.length > 0 || selectedMonths.length > 0) {
                    // Filters active and NOT overdue = Green
                    color = '#10B981';
                } else {
                    // No filters active - use district colors
                    color = districtColors[bridge.district] || '#00d9ff';
                }
            }
        } else {
            // No inspection data
            if (selectedInspectionTypes.length === 0 && selectedMonths.length === 0) {
                // No filters - show bridge with district color
                show = true;
            }
        }
        
        // Apply search filter if active
        if (show && currentSearchQuery.length > 0) {
            const bars = (bridge.bars_number || '').toUpperCase();
            const name = (bridge.bridge_name || '').toUpperCase();
            const isNumericSearch = /^\d/.test(currentSearchQuery);
            const matchesBars = isNumericSearch ? bars.startsWith(currentSearchQuery) : bars.includes(currentSearchQuery);
            const matchesName = isNumericSearch ? name.startsWith(currentSearchQuery) : name.includes(currentSearchQuery);
            
            if (!matchesBars && !matchesName) {
                show = false; // Hide if doesn't match search
            }
        }
        
        if (show) {
            bridgesByOverdue.push({ marker, overdueCount, color, size });
        } else {
            marker.setStyle({ fillOpacity: 0, opacity: 0 });
        }
    });
    
    // Sort by overdue count (lowest first so highest drawn last)
    bridgesByOverdue.sort((a, b) => a.overdueCount - b.overdueCount);
    
    // Apply styles in order (draws in order on map)
    bridgesByOverdue.forEach(({ marker, color, size }) => {
        marker.setRadius(size);
        marker.setStyle({
            fillColor: color,
            fillOpacity: 0.85,
            opacity: 1
        });
        marker.bringToFront(); // Ensure proper z-ordering
    });
}

// Add Inspections to radial menu
function addInspectionsToRadialMenu(bridge) {
    const bars = bridge.bars_number;
    const inspections = inspectionsData[bars];
    
    if (!inspections || inspections.length === 0) {
        return null;
    }
    
    return {
        label: 'Inspection',
        action: () => showInspectionsPopup(bridge)
    };
}

// Show inspections popup
function showInspectionsPopup(bridge) {
    const bars = bridge.bars_number;
    const inspections = inspectionsData[bars];
    
    if (!inspections || inspections.length === 0) {
        alert('No inspection data available for this bridge.');
        return;
    }
    
    // Sort inspections by status (overdue first) then by due date
    const today = new Date();
    const sorted = inspections.slice().sort((a, b) => {
        const aDate = parseDateString(a.due);
        const bDate = parseDateString(b.due);
        
        if (!aDate && !bDate) return 0;
        if (!aDate) return 1;
        if (!bDate) return -1;
        
        const aOverdue = aDate < today;
        const bOverdue = bDate < today;
        
        if (aOverdue && !bOverdue) return -1;
        if (!aOverdue && bOverdue) return 1;
        
        return aDate - bDate;
    });
    
    // Create popup HTML
    let html = `
        <div style="font-family: 'Aptos', sans-serif; max-width: 600px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 10pt;">
                <thead>
                    <tr style="background: rgba(0, 40, 85, 0.3); border-bottom: 2px solid #FFB81C;">
                        <th style="padding: 8px; text-align: left;">Type</th>
                        <th style="padding: 8px; text-align: left;">Begin</th>
                        <th style="padding: 8px; text-align: left;">Completion</th>
                        <th style="padding: 8px; text-align: left;">Due</th>
                        <th style="padding: 8px; text-align: left;">Status</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    sorted.forEach(insp => {
        const dueDate = parseDateString(insp.due);
        const completionDate = parseDateString(insp.completion);
        const today = new Date();
        const intervalMonths = insp.interval || 24; // Default to 24 months if not specified
        let status = '—';
        let rowStyle = '';
        
        if (dueDate) {
            // Calculate previous cycle's due date
            const previousDueDate = new Date(dueDate);
            previousDueDate.setMonth(previousDueDate.getMonth() - intervalMonths);
            
            // HAS completion date - determine which cycle it belongs to
            if (completionDate) {
                // Check if completion belongs to current cycle
                if (completionDate > previousDueDate) {
                    // CURRENT CYCLE - check if on time or overdue
                    if (completionDate <= dueDate) {
                        const daysEarly = Math.floor((dueDate - completionDate) / (1000 * 60 * 60 * 24));
                        if (daysEarly === 0) {
                            status = `✓ On Time (due by 0 days)`;
                        } else {
                            status = `✓ On Time (due in ${daysEarly} days)`;
                        }
                        rowStyle = 'background: rgba(16, 185, 129, 0.1); color: #6EE7B7;';
                    } else {
                        const daysLate = Math.floor((completionDate - dueDate) / (1000 * 60 * 60 * 24));
                        status = `⚠ Overdue (overdue by ${daysLate} days)`;
                        rowStyle = 'background: rgba(245, 158, 11, 0.2); color: #FCD34D;';
                    }
                } else {
                    // PREVIOUS CYCLE - check if current cycle is past due
                    if (today > dueDate) {
                        const daysPastDue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
                        status = `⚠ PAST DUE (past due by ${daysPastDue} days)`;
                        rowStyle = 'background: rgba(220, 38, 38, 0.2); color: #FCA5A5;';
                    } else {
                        const daysUntilDue = Math.floor((dueDate - today) / (1000 * 60 * 60 * 24));
                        if (daysUntilDue <= 30) {
                            status = `⚠ Due Soon (due in ${daysUntilDue} days)`;
                            rowStyle = 'background: rgba(245, 158, 11, 0.1);';
                        } else {
                            status = `Upcoming (due in ${daysUntilDue} days)`;
                        }
                    }
                }
            } 
            // NO completion date - check if past due
            else {
                if (today > dueDate) {
                    const daysPastDue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
                    status = `⚠ PAST DUE (past due by ${daysPastDue} days)`;
                    rowStyle = 'background: rgba(220, 38, 38, 0.2); color: #FCA5A5;';
                } else {
                    const daysUntilDue = Math.floor((dueDate - today) / (1000 * 60 * 60 * 24));
                    if (daysUntilDue <= 30) {
                        status = `⚠ Due Soon (due in ${daysUntilDue} days)`;
                        rowStyle = 'background: rgba(245, 158, 11, 0.1);';
                    } else {
                        status = `Upcoming (due in ${daysUntilDue} days)`;
                    }
                }
            }
        }
        
        html += `
            <tr style="${rowStyle} border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
                <td style="padding: 8px;">${insp.type}</td>
                <td style="padding: 8px;">${insp.begin || '—'}</td>
                <td style="padding: 8px;">${insp.completion || '—'}</td>
                <td style="padding: 8px;">${insp.due || '—'}</td>
                <td style="padding: 8px;">${status}</td>
            </tr>
        `;
    });
    
    html += `
                </tbody>
            </table>
        </div>
    `;
    
    // Create info panel
    createInfoPanel('Inspections', html, bridge);
}
