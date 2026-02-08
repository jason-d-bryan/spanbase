// SpanBase - Complete Build with All Features
let map;
let bridgesData = [];
let sufficiencyData = {}; // BARS number -> calculated sufficiency rating
let bridgeLayers = {};
let projectsData = {};
let projectRingLayers = {};
let projectRingsVisible = false;
let currentMode = 'default';
let currentZoom = 8;
const wvBounds = [[37.206, -82.605], [40.621, -77.742]];
const initialView = { bounds: wvBounds, padding: [100, 50], maxZoom: 8 }; // For resetting to WV overview
let hoveredBridge = null;
let radialMenu = null;
let nameTooltip = null;
let currentSearchQuery = ''; // Track search state
let boxExcludedBars = new Set(); // Bridges excluded by box select

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
        buildQuantileTables();

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

        // Load project data
        try {
            const projResponse = await fetch('projects_data.json');
            projectsData = await projResponse.json();
            console.log(`✓ Loaded project data for ${Object.keys(projectsData).length} bridges`);
        } catch(e) {
            console.warn('Projects data not available:', e.message);
            projectsData = {};
        }

        // Initialize map with WV bounding box
        map = L.map('map', { minZoom: 8 });
        
        // Center on West Virginia at zoom level 8
        const wvCenter = [38.9135, -80.1735];
        map.setView(wvCenter, 8);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap',
            maxZoom: 19
        }).addTo(map);
        
        addBridges();
        createProjectRings();
        setupSearch();
        updateStats();
        createEvaluationPanel();
        setupDistrictToggles();
        createDebugPanel();

        map.on('zoomend', function() {
            currentZoom = Math.round(map.getZoom());
            syncToggleAllButton(); // Keep button text synced
            updateBridgeSizes();
            updateProjectRings();
            updateDebugPanel();
            closeAllMenus();
        });
        
        initBoxSelect();

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
            fillOpacity: 1
        });
        
        marker.bridgeData = bridge;
        
        marker.on('mouseover', function(e) {
            // Don't show tooltip on hidden bridges
            const options = this.options;
            if (options.opacity === 0 || options.fillOpacity === 0) {
                return;
            }
            if (currentZoom >= 12) {
                showNameTooltip(e, bridge);      // Full name + BARS
            } else if (currentZoom >= 10) {
                showBarsTooltip(e, bridge);      // BARS only
            } else {
                showDistrictTooltip(e, bridge);  // District
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
            // Radial menu only accessible at zoom 9+
            if (currentZoom < 9) {
                return;
            }
            // Disabled during certain tour steps
            if (window._tourDisableRadial) {
                return;
            }

            L.DomEvent.stopPropagation(e);
            removeNameTooltip();

            // HUB Data isolation mode or theme mode: go directly to project info
            if (countCategoryState.hubdata || hubDataMode === 2) {
                showProjectInfo(bridge);
                return;
            }

            showRadialMenu(e.latlng, bridge);
        });
        
        marker.addTo(map);
        bridgeLayers[bridge.bars_number] = marker;
    });
    
    // Set initial view to zoom 8 centered on WV
    map.setView([38.9135, -80.1735], 8);
    console.log('Loaded at zoom level 8');
}

let districtTooltipTimer = null;

// Get pixel distance to the nearest visible bridge (excluding self)
function getNearestNeighborDist(point, selfBars) {
    let minDist = Infinity;
    Object.entries(bridgeLayers).forEach(([bars, marker]) => {
        if (!marker._map || bars === selfBars) return;
        const mp = map.latLngToContainerPoint(marker.getLatLng());
        const dx = mp.x - point.x;
        const dy = mp.y - point.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) minDist = dist;
    });
    return minDist;
}

function showDistrictTooltip(e, bridge) {
    if (districtTooltipTimer) {
        clearTimeout(districtTooltipTimer);
        districtTooltipTimer = null;
    }

    removeNameTooltip();

    const marker = bridgeLayers[bridge.bars_number];
    const color = districtColors[bridge.district] || '#00d9ff';
    const point = map.latLngToContainerPoint(e.latlng);

    const tooltip = L.DomUtil.create('div', 'name-tooltip');
    tooltip.style.position = 'absolute';
    tooltip.style.left = point.x + 'px';
    tooltip.style.top = (point.y - 40) + 'px';
    tooltip.style.transform = 'translateX(-50%)';
    tooltip.style.backgroundColor = color;
    tooltip.style.color = '#fff';
    tooltip.style.padding = '5px 10px';
    tooltip.style.borderRadius = '4px';
    tooltip.style.fontSize = '10pt';
    tooltip.style.fontWeight = '600';
    tooltip.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
    tooltip.style.whiteSpace = 'nowrap';
    tooltip.style.zIndex = '10000';
    tooltip.style.pointerEvents = 'none';
    tooltip.innerHTML = `
        ${bridge.district}
        <div style="position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 6px solid ${color};"></div>
    `;

    document.getElementById('map').appendChild(tooltip);
    nameTooltip = tooltip;
}

function delayedRemoveTooltip() {
    if (districtTooltipTimer) clearTimeout(districtTooltipTimer);
    districtTooltipTimer = setTimeout(() => {
        removeNameTooltip();
        districtTooltipTimer = null;
    }, 150);
}

function showBarsTooltip(e, bridge) {
    removeNameTooltip();

    const marker = bridgeLayers[bridge.bars_number];
    const bridgeColor = marker ? marker.options.fillColor : '#00d9ff';
    const point = map.latLngToContainerPoint(e.latlng);
    const tooltip = L.DomUtil.create('div', 'name-tooltip');

    tooltip.style.position = 'absolute';
    tooltip.style.left = point.x + 'px';
    tooltip.style.top = (point.y - 40) + 'px';
    tooltip.style.transform = 'translateX(-50%)';
    tooltip.style.backgroundColor = bridgeColor;
    tooltip.style.color = '#fff';
    tooltip.style.padding = '4px 8px';
    tooltip.style.borderRadius = '4px';
    tooltip.style.fontSize = '9pt';
    tooltip.style.fontWeight = '600';
    tooltip.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
    tooltip.style.whiteSpace = 'nowrap';
    tooltip.style.zIndex = '10000';
    tooltip.style.pointerEvents = 'none';

    tooltip.innerHTML = `
        ${bridge.bars_number}
        <div style="position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 6px solid ${bridgeColor};"></div>
    `;

    document.getElementById('map').appendChild(tooltip);
    nameTooltip = tooltip;
}

function showNameTooltip(e, bridge) {
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
    
    const bridgeName = titleCase(cleanBridgeName(bridge.bridge_name));
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
    
    // Create title above menu - 10px from center circle (117/2 = 58.5, + 10 = ~70px)
    const title = L.DomUtil.create('div', 'menu-title');
    title.style.left = point.x + 'px';
    title.style.top = (point.y - 277) + 'px'; // Moved up 7px more
    
    // Convert bridge name to title case
    const bridgeName = cleanBridgeName(bridge.bridge_name);
    const titleCaseName = bridgeName.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

    title.innerHTML = `
        <div class="menu-title-text">
            ${titleCaseName}<br>
            <span style="font-size: 12pt;">${bridge.bars_number}</span>
        </div>
        <div class="menu-title-links">
            <a href="https://www.google.com/maps?q=${bridge.latitude},${bridge.longitude}" 
               target="_blank" class="menu-title-link">Google Maps</a>
            <a href="${bridge.bars_hyperlink || '#'}" 
               target="_blank" class="menu-title-link">AssetWise</a>
        </div>
    `;
    document.getElementById('map').appendChild(title);
    
    const menu = L.DomUtil.create('div', 'radial-menu');
    menu.style.left = point.x + 'px';
    
    // Calculate title bar bottom position
    const titleBottom = point.y - 277 + 60; // Title height ~60px
    const menuRadius = 150; // Menu needs ~150px radius space
    
    // Ensure menu is at least below title (add small gap)
    const safeTop = Math.max(point.y, titleBottom + 10);
    menu.style.top = safeTop + 'px';
    
    // Center - WVDOT logo (background image)
    const center = L.DomUtil.create('div', 'radial-center', menu);
    center.innerHTML = ``; // Empty, logo is background
    
    // Build nodes — ordered bottom-to-top for z-index stacking
    // Stacking (front to back): DOH logo > Inspection > Narrative > Condition > HUB Data > Geometry > Attributes
    // HUB Data button only shown if bridge has project data (green ring)
    const hasHubData = hubDataMode === 1 && projectsData[bridge.bars_number];
    const nodes = hasHubData ? [
        { angle: 150, label: 'Attributes',  action: () => showAttributes(bridge),       z: 1 },  // Bottom-left
        { angle: 90,  label: 'Geometry',     action: () => showGeometry(bridge),         z: 2 },  // Bottom
        { angle: 30,  label: 'HUB Data',     action: () => showProjectInfo(bridge),      z: 3 },  // Bottom-right
        { angle: 330, label: 'Condition',    action: () => showCondition(bridge),        z: 4 },  // Top-right
        { angle: 210, label: 'Narrative',    action: () => showNarratives(bridge),       z: 5 },  // Top-left
        { angle: 270, label: 'Inspection',   action: () => showInspectionsPopup(bridge), z: 6 },  // Top (12 o'clock)
    ] : [
        { angle: 126, label: 'Attributes',  action: () => showAttributes(bridge),       z: 1 },  // Bottom-left
        { angle: 54,  label: 'Geometry',     action: () => showGeometry(bridge),         z: 2 },  // Bottom-right
        { angle: 342, label: 'Condition',    action: () => showCondition(bridge),        z: 4 },  // Top-right
        { angle: 198, label: 'Narrative',    action: () => showNarratives(bridge),       z: 5 },  // Top-left
        { angle: 270, label: 'Inspection',   action: () => showInspectionsPopup(bridge), z: 6 },  // Top (12 o'clock)
    ];

    nodes.forEach(node => {
        const rad = node.angle * Math.PI / 180;
        const distance = 105; // Brought in 5px closer

        const option = L.DomUtil.create('div', 'radial-option', menu);
        option.style.left = (distance * Math.cos(rad)) + 'px';
        option.style.top = (distance * Math.sin(rad)) + 'px';
        option.style.zIndex = node.z;
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
            // Don't close if clicking on menu, title, info panel, or another bridge
            if (menu.contains(e.target) || 
                title.contains(e.target) ||
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
            <div class="info-item" style="grid-column: 1 / -1;">
                <span class="info-label">Type</span>
                <span class="info-value">${bridge.bridge_type || 'N/A'}</span>
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
            <div class="info-item">
                <span class="info-label">ADT</span>
                <span class="info-value">${bridge.adt != null ? bridge.adt.toLocaleString() : 'N/A'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">ADT Year</span>
                <span class="info-value">${bridge.adt_year || 'N/A'}</span>
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

function showProjectInfo(bridge) {
    const bars = bridge.bars_number;
    const projects = projectsData[bars];

    if (!projects || projects.length === 0) {
        createInfoPanel('Project Information', `
            <div style="padding: 10px; color: #999; text-align: center;">
                No active projects for this bridge.
            </div>
        `, bridge);
        return;
    }

    let html = '';
    projects.forEach((proj, i) => {
        if (projects.length > 1) {
            html += `<div style="margin-bottom:8px; padding-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.15); font-weight:700; color:#22c55e;">Project ${i + 1} of ${projects.length}</div>`;
        }
        html += `
            <div class="info-grid">
                <div class="info-item">
                    <span class="info-label">Project</span>
                    <span class="info-value">${proj.project || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Name</span>
                    <span class="info-value">${proj.projectName || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Status</span>
                    <span class="info-value">${proj.status || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Work Code</span>
                    <span class="info-value">${proj.workCode || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Phase</span>
                    <span class="info-value">${proj.phaseCode || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Phase Status</span>
                    <span class="info-value">${proj.phaseStatus || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Start Date</span>
                    <span class="info-value">${proj.phaseStartDate || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Budget Authorized</span>
                    <span class="info-value">${proj.budgetAuthorized || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Budget Estimated</span>
                    <span class="info-value">${proj.budgetEstimated || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Phase Est. Cost</span>
                    <span class="info-value">${proj.phaseEstCost || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Project Est. Cost</span>
                    <span class="info-value">${proj.projectEstCost || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">CR In Process</span>
                    <span class="info-value">${proj.crInProcess || 'N/A'}</span>
                </div>
            </div>
        `;
        if (i < projects.length - 1) {
            html += '<div style="margin:12px 0; border-top:2px solid rgba(34,197,94,0.3);"></div>';
        }
    });

    createInfoPanel('Project Information', html, bridge);
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
    const bridgeName = cleanBridgeName(bridge.bridge_name);
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
    if (currentMode === 'evaluation' || (evaluationActive && currentMode !== 'inspection')) {
        return getEvaluationColor(bridge);
    }
    return districtColors[bridge.district] || '#00d9ff';
}

// Get inspection-mode color for a bridge based on due-date status
// Each record represents a completed inspection; 'due' = when the NEXT one is needed
function getInspectionColor(bridge) {
    const inspections = inspectionsData[bridge.bars_number];
    if (!inspections) return '#888'; // N/A gray

    // Filter by selected types
    let relevant = inspections;
    if (selectedInspectionTypes.length > 0) {
        relevant = inspections.filter(i => selectedInspectionTypes.includes(i.type));
    }
    // Filter by selected months
    if (selectedMonths.length > 0) {
        relevant = relevant.filter(i => {
            const d = parseDateString(i.due);
            return d && selectedMonths.includes(d.getMonth() + 1);
        });
    }
    if (relevant.length === 0) return '#888'; // N/A gray

    const today = new Date();
    const sixtyDaysMs = 60 * 24 * 60 * 60 * 1000;
    let worstPastDueDays = 0;
    let closestUpcomingDays = Infinity;
    let hasPastDue = false;
    let hasUpcoming = false;

    relevant.forEach(insp => {
        const due = parseDateString(insp.due);
        if (!due) return;
        if (due < today) {
            hasPastDue = true;
            const daysDiff = Math.floor((today - due) / (1000 * 60 * 60 * 24));
            worstPastDueDays = Math.max(worstPastDueDays, daysDiff);
        } else if (due <= new Date(today.getTime() + sixtyDaysMs)) {
            hasUpcoming = true;
            const daysDiff = Math.floor((due - today) / (1000 * 60 * 60 * 24));
            closestUpcomingDays = Math.min(closestUpcomingDays, daysDiff);
        }
    });

    if (hasPastDue) {
        // Red HSL gradient: L goes from 50% (just overdue) to 12% (365+ days overdue)
        const t = Math.min(worstPastDueDays / 365, 1); // 0→1 over a year
        const lightness = 50 - t * 38; // 50% → 12%
        return `hsl(0, 80%, ${lightness}%)`;
    }
    if (hasUpcoming) {
        // Orange HSL gradient: hue 30→20, lightness 60%→30% as days decrease
        const t = 1 - (closestUpcomingDays / 60); // 0 (60 days out) → 1 (due today)
        const hue = 30 - t * 10; // 30 → 20
        const lightness = 60 - t * 30; // 60% → 30%
        return `hsl(${hue}, 90%, ${lightness}%)`;
    }

    // Completed: all inspections are >60 days out (done, not due soon)
    return '#10B981';
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
    
    // SEVERITY SCORING: Use WORST rating among active sliders
    const severitySliders = activeSliders.filter(([k]) => k !== 'sufficiency');
    
    // If only sufficiency slider active, use worst condition color
    if (severitySliders.length === 0) {
        return getWorstConditionColor(bridge);
    }
    
    let worstRating = 9; // Start with best
    let numActiveWithRatings = 0;
    
    severitySliders.forEach(([key, sliderValue]) => {
        const rating = ratingMap[key];
        // Treat 0 as N/A since CSV empty cells are parsed as 0
        // Only actual ratings 1-9 are valid
        if (typeof rating === 'number' && !isNaN(rating) && rating >= 1 && rating <= 9) {
            // Only consider if slider is active (> 0)
            if (sliderValue > 0) {
                worstRating = Math.min(worstRating, rating);
                numActiveWithRatings++;
            }
        }
    });
    
    if (numActiveWithRatings === 0) return '#6b7280';
    
    // Use the worst rating directly
    return conditionColors[Math.max(0, Math.min(9, worstRating))] || '#6b7280';
}

function getWorstConditionColor(bridge) {
    const ratings = [
        bridge.deck_rating,
        bridge.superstructure_rating,
        bridge.substructure_rating,
        bridge.bearings_rating,
        bridge.joints_rating
    ].filter(r => typeof r === 'number' && !isNaN(r) && r >= 1 && r <= 9);
    
    if (ratings.length === 0) return '#6b7280';
    
    const worst = Math.min(...ratings);
    return conditionColors[worst] || '#6b7280';
}

function getPointSize() {
    return pointSizes[currentZoom] || 8;
}

// Clean bridge name: strip parenthetical abbreviations like (CSWB), (SWB), etc.
function cleanBridgeName(name) {
    if (!name) return 'Unknown';
    return name.replace(/\s*\([A-Z]{2,}\)\s*/g, ' ').trim();
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
    
    // If no sliders active, show all bridges fully opaque
    if (activeSliders.length === 0) {
        return 1;
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

    // If only sufficiency is active, show fully opaque
    if (severitySliders.length === 0) {
        return 1;
    }

    let numActiveWithRatings = 0;

    severitySliders.forEach(([key, sliderValue]) => {
        const rating = ratingMap[key];
        if (rating != null && rating !== undefined && rating > 0) {
            numActiveWithRatings++;
        }
    });

    if (numActiveWithRatings === 0) return 0;

    return 1;
}

function updateBridgeSizes() {
    // If inspection filters are active, use inspection update logic
    if (inspectionFiltersActive) {
        updateBridgesForInspection();
        return;
    }

    const baseSize = getPointSize();
    const visibleBridges = [];

    Object.values(bridgeLayers).forEach(marker => {
        const bridge = marker.bridgeData;
        const size = evaluationActive ? getEvaluationSize(bridge, baseSize) : baseSize;
        const color = getBridgeColor(bridge);
        let shouldShow = true;

        // Check district filter first
        const districtActive = activeDistricts[bridge.district];
        if (!districtActive) {
            shouldShow = false;
        }

        // CHECK ATTRIBUTES FILTER
        if (shouldShow && districtActive && typeof attributesFilterState !== 'undefined' && attributesFilterState.active) {
            const passesFilter = bridgePassesAttributesFilter(bridge);
            if (!passesFilter) {
                shouldShow = false;
            }
        }

        // Apply search filter if active (only if district is active)
        if (shouldShow && districtActive && currentSearchQuery.length > 0) {
            const bars = (bridge.bars_number || '').toUpperCase();
            const name = (bridge.bridge_name || '').toUpperCase();

            // Smart search: numbers = startsWith, words = includes (contains)
            const isNumericSearch = /^\d/.test(currentSearchQuery);
            const matchesBars = isNumericSearch ? bars.startsWith(currentSearchQuery) : bars.includes(currentSearchQuery);
            const matchesName = isNumericSearch ? name.startsWith(currentSearchQuery) : name.includes(currentSearchQuery);

            if (!matchesBars && !matchesName) {
                shouldShow = false;
            }
        }

        // Box select exclusion
        if (shouldShow && boxExcludedBars.has(bridge.bars_number)) {
            shouldShow = false;
        }

        // HIDE BRIDGES WITH N/A (gray color #6b7280) unless N/A is toggled on or search is active
        if (shouldShow && evaluationActive && color.toLowerCase() === '#6b7280') {
            if (!countCategoryState.na && currentSearchQuery.length === 0) {
                shouldShow = false;
            }
        }

        if (shouldShow) {
            const displayColor = attributesFilterState.showNA ? '#6b7280' : color;
            // Get worst rating for z-ordering (lower = worse = draw last)
            const ratings = [bridge.deck_rating, bridge.superstructure_rating,
                bridge.substructure_rating, bridge.bearings_rating, bridge.joints_rating]
                .filter(r => typeof r === 'number' && !isNaN(r) && r >= 1 && r <= 9);
            const worstRating = ratings.length > 0 ? Math.min(...ratings) : 10; // N/A sorts first (best)
            visibleBridges.push({ marker, displayColor, size, worstRating });
        } else {
            if (marker._map) {
                marker.remove();
            }
        }
    });

    // Sort: best first (high rating), worst last (low rating) — worst drawn on top
    visibleBridges.sort((a, b) => b.worstRating - a.worstRating);

    visibleBridges.forEach(({ marker, displayColor, size }) => {
        marker.setRadius(size);
        marker.setStyle({
            fillColor: displayColor,
            fillOpacity: 1,
            opacity: 1
        });
        if (!marker._map) {
            marker.addTo(map);
        }
        marker.bringToFront();
    });
    
    // Apply count category filter (if condition sliders active)
    applyCountCategoryFilter();

    // Update count report
    updateCountReport();

    // Keep project rings in sync
    updateProjectRings();
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
                // Add % to all sliders including sufficiency
                const displayValue = this.value + '%';
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
    
    // KEEP evaluation mode active - apply severity colors (default maintenance theme)
    evaluationActive = true;
    currentMode = 'evaluation';
    
    // Apply severity colors with default slider values (all 0)
    updateBridgeSizes();
    
    console.log('Maintenance tab reset to severity colors');
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
        
        // Auto-zoom whenever query has 1+ characters (including after backspace)
        if (currentSearchQuery.length >= 1) {
            zoomToSearchResults();
        }
    });
    
    // ESC key clears search (tab resets handled by the global ESC handler)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            // Clear search
            searchInput.value = '';
            currentSearchQuery = '';
            applySearch();
            updateBridgeSizes();
        }
    });
}

function zoomToSearchResults() {
    // Collect coordinates of bridges that match the search query
    const visibleCoords = [];

    Object.values(bridgeLayers).forEach(marker => {
        const bridge = marker.bridgeData;
        if (!bridge) return;
        const bars = (bridge.bars_number || '').toUpperCase();
        const name = (bridge.bridge_name || '').toUpperCase();
        const isNumericSearch = /^\d/.test(currentSearchQuery);
        const matchesBars = isNumericSearch ? bars.startsWith(currentSearchQuery) : bars.includes(currentSearchQuery);
        const matchesName = isNumericSearch ? name.startsWith(currentSearchQuery) : name.includes(currentSearchQuery);
        const districtActive = activeDistricts[bridge.district];
        if ((matchesBars || matchesName) && districtActive) {
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
    // Delegate to updateBridgeSizes which handles all visibility logic
    // (district, search, attributes, evaluation) in one consistent pass
    updateBridgeSizes();
}

function updateStats() {
    // Stats panel removed per user request
}

let mouseLatLng = { lat: 0, lng: 0 };

function createDebugPanel() {
    const panel = L.DomUtil.create('div', 'debug-panel');
    panel.id = 'debugPanel';
    panel.style.cursor = 'move';
    document.body.appendChild(panel);

    // Make debug panel draggable
    let dragOffsetX = 0, dragOffsetY = 0;
    panel.addEventListener('mousedown', function(e) {
        // Don't drag when clicking inside scrollable content
        if (e.target !== panel && e.target.tagName !== 'H4') return;
        e.preventDefault();
        dragOffsetX = e.clientX - panel.getBoundingClientRect().left;
        dragOffsetY = e.clientY - panel.getBoundingClientRect().top;

        function onMouseMove(ev) {
            panel.style.left = (ev.clientX - dragOffsetX) + 'px';
            panel.style.top = (ev.clientY - dragOffsetY) + 'px';
            panel.style.bottom = 'auto';
        }
        function onMouseUp() {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    // Track mouse position on map
    map.on('mousemove', function(e) {
        mouseLatLng = { lat: e.latlng.lat, lng: e.latlng.lng };
        updateDebugDynamic();
    });

    // Track viewport resize
    window.addEventListener('resize', updateDebugDynamic);
    window.addEventListener('resize', positionProjectToggle);

    updateDebugPanel();
}

function getVisibleBridgeCount() {
    let count = 0;
    Object.values(bridgeLayers).forEach(marker => {
        if (marker._map) count++;
    });
    return count;
}

function getThemeName() {
    if (inspectionFiltersActive) return 'Inspection';
    if (evaluationActive) return 'Maintenance';
    return 'District';
}

function updateDebugDynamic() {
    const elLat = document.getElementById('dbg-lat');
    const elLng = document.getElementById('dbg-lng');
    const elVp = document.getElementById('dbg-viewport');
    if (elLat) elLat.textContent = mouseLatLng.lat.toFixed(4);
    if (elLng) elLng.textContent = mouseLatLng.lng.toFixed(4);
    if (elVp) elVp.textContent = `${window.innerWidth} × ${window.innerHeight}`;
}

function updateDebugPanel() {
    const panel = document.getElementById('debugPanel');
    if (!panel) return;

    const ps = getPointSize();
    const visible = getVisibleBridgeCount();
    const total = Object.keys(bridgeLayers).length;
    const theme = getThemeName();

    // Point sizes by zoom table
    const zoomRows = Object.entries(pointSizes).map(([z, s]) => {
        const highlight = parseInt(z) === currentZoom ? ' style="color: var(--wvdoh-yellow); font-weight: bold;"' : '';
        return `<span${highlight}>z${z}:${s}px</span>`;
    }).join(' ');

    panel.innerHTML = `
        <h4>UI Reference</h4>

        <div class="debug-section">
            <div class="debug-section-label">Live Metrics</div>
            <div class="debug-item"><span>Zoom Level:</span><span>${currentZoom}</span></div>
            <div class="debug-item"><span>Point Size:</span><span>${ps}px</span></div>
            <div class="debug-item"><span>Theme:</span><span>${theme}</span></div>
            <div class="debug-item"><span>Visible:</span><span>${visible} / ${total}</span></div>
            <div class="debug-item"><span>Viewport:</span><span id="dbg-viewport">${window.innerWidth} × ${window.innerHeight}</span></div>
            <div class="debug-item"><span>Lat:</span><span id="dbg-lat">${mouseLatLng.lat.toFixed(4)}</span></div>
            <div class="debug-item"><span>Lng:</span><span id="dbg-lng">${mouseLatLng.lng.toFixed(4)}</span></div>
        </div>

        <div class="debug-section">
            <div class="debug-section-label">Point Sizes by Zoom</div>
            <div style="display: flex; flex-wrap: wrap; gap: 4px 8px; font-size: 8pt; color: rgba(255,255,255,0.6);">
                ${zoomRows}
            </div>
        </div>

        <div class="debug-section">
            <div class="debug-section-label">Pixel Blocks</div>
            <div class="debug-swatches">
                <div class="debug-swatch">
                    <div class="debug-pixel-block" style="width:5px;height:5px;"></div>
                    <span class="debug-swatch-label">5</span>
                </div>
                <div class="debug-swatch">
                    <div class="debug-pixel-block" style="width:10px;height:10px;"></div>
                    <span class="debug-swatch-label">10</span>
                </div>
                <div class="debug-swatch">
                    <div class="debug-pixel-block" style="width:20px;height:20px;"></div>
                    <span class="debug-swatch-label">20</span>
                </div>
                <div class="debug-swatch">
                    <div class="debug-pixel-block" style="width:40px;height:40px;"></div>
                    <span class="debug-swatch-label">40</span>
                </div>
            </div>
        </div>

        <div class="debug-section">
            <div class="debug-section-label">Opacity</div>
            <div class="debug-swatches">
                <div class="debug-swatch">
                    <div class="debug-opacity-block" style="opacity:0.05;"></div>
                    <span class="debug-swatch-label">5%</span>
                </div>
                <div class="debug-swatch">
                    <div class="debug-opacity-block" style="opacity:0.10;"></div>
                    <span class="debug-swatch-label">10%</span>
                </div>
                <div class="debug-swatch">
                    <div class="debug-opacity-block" style="opacity:0.20;"></div>
                    <span class="debug-swatch-label">20%</span>
                </div>
                <div class="debug-swatch">
                    <div class="debug-opacity-block" style="opacity:0.40;"></div>
                    <span class="debug-swatch-label">40%</span>
                </div>
                <div class="debug-swatch">
                    <div class="debug-opacity-block" style="opacity:0.80;"></div>
                    <span class="debug-swatch-label">80%</span>
                </div>
            </div>
        </div>

        <div class="debug-section">
            <div class="debug-section-label">Stroke Widths</div>
            <div class="debug-swatches">
                <div class="debug-swatch">
                    <div class="debug-stroke-line" style="width:40px;height:1px;"></div>
                    <span class="debug-swatch-label">1px</span>
                </div>
                <div class="debug-swatch">
                    <div class="debug-stroke-line" style="width:40px;height:2px;"></div>
                    <span class="debug-swatch-label">2px</span>
                </div>
                <div class="debug-swatch">
                    <div class="debug-stroke-line" style="width:40px;height:4px;"></div>
                    <span class="debug-swatch-label">4px</span>
                </div>
            </div>
        </div>

        <div class="debug-section">
            <div class="debug-section-label">Radius Sizes</div>
            <div class="debug-swatches" style="align-items: center;">
                <div class="debug-swatch">
                    <div class="debug-radius-circle" style="width:8px;height:8px;"></div>
                    <span class="debug-swatch-label">4r</span>
                </div>
                <div class="debug-swatch">
                    <div class="debug-radius-circle" style="width:16px;height:16px;"></div>
                    <span class="debug-swatch-label">8r</span>
                </div>
                <div class="debug-swatch">
                    <div class="debug-radius-circle" style="width:30px;height:30px;"></div>
                    <span class="debug-swatch-label">15r</span>
                </div>
                <div class="debug-swatch">
                    <div class="debug-radius-circle" style="width:50px;height:50px;"></div>
                    <span class="debug-swatch-label">25r</span>
                </div>
            </div>
        </div>
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
        
        // Attributes filter
        let passesAttributes = true;
        if (typeof attributesFilterState !== 'undefined' && attributesFilterState.active) {
            if (!bridgePassesAttributesFilter(bridge)) {
                passesAttributes = false;
            }
        }

        if (districtActive && searchMatch && passesAttributes) {
            if (evaluationActive) {
                marker.setStyle({
                    fillColor: getEvaluationColor(bridge),
                    fillOpacity: getEvaluationOpacity(bridge),
                    opacity: 1
                });
            } else {
                marker.setStyle({
                    fillColor: districtColors[bridge.district],
                    fillOpacity: 1,
                    opacity: 1
                });
            }
            if (!marker._map) {
                marker.addTo(map);
            }
        } else {
            if (marker._map) {
                marker.remove();
            }
        }
    });

    // Re-apply CR category filter and update counts
    applyCountCategoryFilter();
    updateCountReport();
    updateProjectRings();
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
        // Reset component sliders (not sufficiency)
        ['deck', 'superstructure', 'substructure', 'bearings', 'joints'].forEach(key => {
            sliderValues[key] = 0;
            const slider = document.getElementById(`slider-${key}`);
            const valueDisplay = document.getElementById(`value-${key}`);
            if (slider) slider.value = 0;
            if (valueDisplay) valueDisplay.textContent = '0%';
        });
        // Reset sufficiency to 100 (default "show all")
        sliderValues.sufficiency = 100;
        const suffSlider = document.getElementById('slider-sufficiency');
        const suffDisplay = document.getElementById('value-sufficiency');
        if (suffSlider) suffSlider.value = 100;
        if (suffDisplay) suffDisplay.textContent = '100%';
        
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
        
        // ACTIVATE EVALUATION MODE (severity colors) as default
        currentMode = 'evaluation';
        evaluationActive = true;
        
        // Reset all component sliders to 0 (but evaluation is still active)
        ['deck', 'superstructure', 'substructure', 'bearings', 'joints'].forEach(key => {
            sliderValues[key] = 0;
            const slider = document.getElementById(`slider-${key}`);
            const valueDisplay = document.getElementById(`value-${key}`);
            if (slider) slider.value = 0;
            if (valueDisplay) valueDisplay.textContent = '0%';
        });
        
        // Reset sufficiency to 100 (show all)
        sliderValues.sufficiency = 100;
        const suffSlider = document.getElementById('slider-sufficiency');
        const suffDisplay = document.getElementById('value-sufficiency');
        if (suffSlider) suffSlider.value = 100;
        if (suffDisplay) suffDisplay.textContent = '100%';
        
        // Apply maintenance severity theme
        console.log('Applying maintenance severity theme...');
        updateBridgeSizes(); // This will apply severity colors
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

        // Disengage HUB Data mode when entering inspection view
        if (hubDataMode > 0) {
            hubDataMode = 0;
            projectRingsVisible = false;
            const hubBtn = document.getElementById('projectToggle');
            if (hubBtn) hubBtn.classList.remove('active', 'theme');
            Object.values(projectRingLayers).forEach(ring => {
                if (ring._map) ring.remove();
            });
        }

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
    
    // Close count report
    closeCountReport();
    
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
    closeAllMenus();

    // Turn off HUB Data toggle if active
    if (hubDataMode > 0) {
        hubDataMode = 0;
        projectRingsVisible = false;
        const hubBtn = document.getElementById('projectToggle');
        if (hubBtn) {
            hubBtn.classList.remove('active', 'theme');
        }
        Object.values(projectRingLayers).forEach(ring => {
            if (ring._map) ring.remove();
        });
    }

    // Reset all CR category state to defaults
    countCategoryState.critical = true;
    countCategoryState.emergent = true;
    countCategoryState.satisfactory = true;
    countCategoryState.completed = true;
    countCategoryState.na = false;
    countCategoryState.hubdata = false;
    countCategoryState.total = true;
    Object.keys(categoryClickState).forEach(k => categoryClickState[k] = 0);

    // Clear showNA state
    if (attributesFilterState.showNA) {
        attributesFilterState.showNA = false;
        const naCheckbox = document.getElementById('show-na-bridges');
        if (naCheckbox) naCheckbox.checked = false;
    }

    const inspectionSection = document.getElementById('inspectionSection');
    const maintenanceSection = document.getElementById('maintenanceSection');

    if (inspectionSection && inspectionSection.classList.contains('active')) {
        resetInspectionTab();
    } else if (maintenanceSection && maintenanceSection.classList.contains('active')) {
        resetMaintenanceTab();
    }

    // Also reset attributes filter if active
    if (typeof attributesFilterState !== 'undefined' && attributesFilterState.active) {
        resetAttributesFilter();
    }

    closeCountReport();
    syncHubButton();
};

// Ctrl+Shift+D to toggle debug panel
document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        const panel = document.getElementById('debugPanel');
        if (panel) {
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        }
    }
});

// ESC key to reset — delegates to resetCurrentTab which handles everything
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        resetCurrentTab();
    }
});

// Update status bar
function updateStatusBar() {
    const statusBar = document.getElementById('statusBar');
    const statusText = document.getElementById('statusText');
    
    if (!inspectionFiltersActive) {
        // Don't hide if attributes is still active
        if (!attributesFilterState.active) {
            statusBar.style.display = 'none';
        }
        return;
    }
    
    statusBar.style.display = 'flex';
    
    // If attributes is also active, keep it red and show both statuses
    if (attributesFilterState.active) {
        statusBar.classList.add('attributes-active');
        document.getElementById('attributesResetBtn').style.display = 'inline-block';
    } else {
        statusBar.classList.remove('attributes-active');
        document.getElementById('attributesResetBtn').style.display = 'none';
    }
    
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
            if (marker._map) marker.remove();
            return;
        }

        // CHECK ATTRIBUTES FILTER (if active, must pass BOTH filters)
        if (typeof attributesFilterState !== 'undefined' && attributesFilterState.active) {
            const passesAttributes = bridgePassesAttributesFilter(bridge);
            if (!passesAttributes) {
                marker.setStyle({ fillOpacity: 0, opacity: 0 });
                if (marker._map) marker.remove();
                return;
            }
        }

        // Box select exclusion
        if (boxExcludedBars.has(bars)) {
            marker.setStyle({ fillOpacity: 0, opacity: 0 });
            if (marker._map) marker.remove();
            return;
        }

        const inspections = inspectionsData[bars];

        let show = false;
        let color = districtColors[bridge.district] || '#00d9ff';
        let size = baseSize;

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
                    if (marker._map) marker.remove();
                    return;
                }
            }

            // Check month filter
            if (selectedMonths.length > 0) {
                let matchesMonth = false;
                relevantInspections.forEach(insp => {
                    const dueDate = parseDateString(insp.due);
                    if (dueDate && selectedMonths.includes(dueDate.getMonth() + 1)) {
                        matchesMonth = true;
                    }
                });
                show = matchesMonth;
            } else if (selectedInspectionTypes.length > 0) {
                show = true;
            } else {
                show = true;
            }

            if (show) {
                color = getInspectionColor(bridge);
            }
        } else {
            // No inspection data
            if (selectedInspectionTypes.length === 0 && selectedMonths.length === 0) {
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
            // Assign z-priority: green=0, orange=1, red=2 (red drawn last / on top)
            let zPriority = 0;
            if (color.startsWith('hsl(0')) zPriority = 2;       // red/past-due
            else if (color.startsWith('hsl(')) zPriority = 1;   // orange/upcoming
            bridgesByOverdue.push({ marker, color, size, zPriority });
        } else {
            marker.setStyle({ fillOpacity: 0, opacity: 0 });
            if (marker._map) marker.remove();
        }
    });

    // Sort by priority (lowest first so highest drawn last / on top)
    bridgesByOverdue.sort((a, b) => a.zPriority - b.zPriority);
    
    // Apply styles in order (draws in order on map)
    bridgesByOverdue.forEach(({ marker, color, size }) => {
        marker.setRadius(size);
        marker.setStyle({
            fillColor: color,
            fillOpacity: 1,
            opacity: 1
        });
        if (!marker._map) {
            marker.addTo(map);
        }
        marker.bringToFront(); // Ensure proper z-ordering
    });
    
    // Apply count category filter (if active)
    applyCountCategoryFilter();

    // Update count report
    updateCountReport();
    updateProjectRings();
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

// ===== ATTRIBUTES FILTER TOGGLE (v7.0.11 - SMART SWITCHING) =====
window.toggleAttributesPanel = function() {
    const attrPanel = document.getElementById('attributesPanel');
    const condPanel = document.getElementById('evaluationPanel');
    
    const attrIsOnTop = attrPanel.classList.contains('ontop');
    const panelsOpen = attrPanel.classList.contains('open');
    
    if (panelsOpen && attrIsOnTop) {
        // Attributes already showing - clicking same tab closes both
        attrPanel.classList.remove('open', 'ontop');
        condPanel.classList.remove('open', 'behind');
    } else {
        // Either closed OR Condition is showing - open/switch to Attributes
        attrPanel.classList.add('open', 'ontop');
        condPanel.classList.add('open', 'behind');
    }
};

// Condition filter toggle
window.toggleEvaluationPanel = function() {
    const attrPanel = document.getElementById('attributesPanel');
    const condPanel = document.getElementById('evaluationPanel');
    
    const attrIsOnTop = attrPanel.classList.contains('ontop');
    const panelsOpen = condPanel.classList.contains('open');
    
    if (panelsOpen && !attrIsOnTop) {
        // Condition already showing - clicking same tab closes both
        condPanel.classList.remove('open', 'behind');
        attrPanel.classList.remove('open', 'ontop');
    } else {
        // Either closed OR Attributes is showing - open/switch to Condition
        condPanel.classList.add('open');
        attrPanel.classList.add('open');
        // Remove special z-index classes so Condition's default z-index wins
        condPanel.classList.remove('behind');
        attrPanel.classList.remove('ontop');
    }
};

// ===== ATTRIBUTES FILTER SYSTEM (v7.0.7) =====

// Attributes filter state
const attributesFilterState = {
    active: false,
    length: { value: 4020, mode: 'lte' },
    width: { value: 880, mode: 'lte' },
    area: { value: 403000, mode: 'lte' },
    age: { value: 210, mode: 'lte' },
    adt: { value: 150000, mode: 'lte' },
    nhs: 'all',
    utilities: false,
    onBridge: [],
    underBridge: [],
    route: '',
    subroute: '',
    showNA: false  // Don't show N/A bridges by default
};

// Mode toggle functions
window.toggleLengthMode = function() {
    attributesFilterState.length.mode = attributesFilterState.length.mode === 'lte' ? 'gte' : 'lte';
    document.getElementById('length-mode-toggle').textContent = 
        attributesFilterState.length.mode === 'lte' ? '≤ Mode' : '≥ Mode';
    applyAttributesFilter();
};

window.toggleWidthMode = function() {
    attributesFilterState.width.mode = attributesFilterState.width.mode === 'lte' ? 'gte' : 'lte';
    document.getElementById('width-mode-toggle').textContent = 
        attributesFilterState.width.mode === 'lte' ? '≤ Mode' : '≥ Mode';
    applyAttributesFilter();
};

window.toggleAreaMode = function() {
    attributesFilterState.area.mode = attributesFilterState.area.mode === 'lte' ? 'gte' : 'lte';
    document.getElementById('area-mode-toggle').textContent = 
        attributesFilterState.area.mode === 'lte' ? '≤ Mode' : '≥ Mode';
    applyAttributesFilter();
};

window.toggleAgeMode = function() {
    attributesFilterState.age.mode = attributesFilterState.age.mode === 'lte' ? 'gte' : 'lte';
    document.getElementById('age-mode-toggle').textContent =
        attributesFilterState.age.mode === 'lte' ? '≤ Mode' : '≥ Mode';
    applyAttributesFilter();
};

window.toggleAdtMode = function() {
    attributesFilterState.adt.mode = attributesFilterState.adt.mode === 'lte' ? 'gte' : 'lte';
    document.getElementById('adt-mode-toggle').textContent =
        attributesFilterState.adt.mode === 'lte' ? '≤ Mode' : '≥ Mode';
    applyAttributesFilter();
};

// NHS filter
window.setNhsFilter = function(value) {
    attributesFilterState.nhs = value;
    document.getElementById('nhs-all').classList.toggle('active', value === 'all');
    document.getElementById('nhs-yes').classList.toggle('active', value === 'yes');
    document.getElementById('nhs-no').classList.toggle('active', value === 'no');
    applyAttributesFilter();
};

// Reset attributes filter
window.resetAttributesFilter = function() {
    attributesFilterState.length = { value: 4020, mode: 'lte' };
    attributesFilterState.width = { value: 880, mode: 'lte' };
    attributesFilterState.area = { value: 403000, mode: 'lte' };
    attributesFilterState.age = { value: 210, mode: 'lte' };
    
    document.getElementById('slider-length').value = 100;
    document.getElementById('value-length').textContent = '4,020 ft';
    document.getElementById('length-mode-toggle').textContent = '≤ Mode';

    document.getElementById('slider-width').value = 100;
    document.getElementById('value-width').textContent = '880 ft';
    document.getElementById('width-mode-toggle').textContent = '≤ Mode';

    document.getElementById('slider-area').value = 100;
    document.getElementById('value-area').innerHTML = '403,000 ft<sup>2</sup>';
    document.getElementById('area-mode-toggle').textContent = '≤ Mode';

    document.getElementById('slider-age').value = 100;
    document.getElementById('value-age').textContent = '210 years';
    document.getElementById('age-mode-toggle').textContent = '≤ Mode';

    attributesFilterState.adt = { value: 150000, mode: 'lte' };
    document.getElementById('slider-adt').value = 100;
    document.getElementById('value-adt').textContent = '150,000';
    document.getElementById('adt-mode-toggle').textContent = '≤ Mode';

    setNhsFilter('all');
    
    document.getElementById('attr-utilities').checked = false;
    document.querySelectorAll('.on-bridge-cb').forEach(cb => cb.checked = false);
    document.querySelectorAll('.under-bridge-cb').forEach(cb => cb.checked = false);
    
    document.getElementById('route-search').value = '';
    document.getElementById('subroute-search').value = '';
    
    attributesFilterState.utilities = false;
    attributesFilterState.onBridge = [];
    attributesFilterState.underBridge = [];
    attributesFilterState.route = '';
    attributesFilterState.subroute = '';
    attributesFilterState.showNA = false;
    attributesFilterState.active = false;

    const naCheckbox = document.getElementById('show-na-bridges');
    if (naCheckbox) naCheckbox.checked = false;
    
    // Close count report
    closeCountReport();
    
    applyAttributesFilter();
};

// Setup slider listeners
document.addEventListener('DOMContentLoaded', function() {
    const lengthSlider = document.getElementById('slider-length');
    if (lengthSlider) {
        lengthSlider.addEventListener('input', function() {
            const actualValue = sliderToValue(parseInt(this.value), 0, 4020, 'length');
            attributesFilterState.length.value = actualValue;
            document.getElementById('value-length').textContent = actualValue.toLocaleString() + ' ft';
            checkDimensionSliders();
            applyAttributesFilter();
        });
        // Auto-zoom when slider is released
        lengthSlider.addEventListener('change', function() {
            if (attributesFilterState.length.value < 4020) {
                setTimeout(autoZoomToFilteredBridges, 100);
            }
        });
    }
    
    const widthSlider = document.getElementById('slider-width');
    if (widthSlider) {
        widthSlider.addEventListener('input', function() {
            const actualValue = sliderToValue(parseInt(this.value), 0, 880, 'width');
            attributesFilterState.width.value = actualValue;
            document.getElementById('value-width').textContent = actualValue.toLocaleString() + ' ft';
            checkDimensionSliders();
            applyAttributesFilter();
        });
        // Auto-zoom when slider is released
        widthSlider.addEventListener('change', function() {
            if (attributesFilterState.width.value < 880) {
                setTimeout(autoZoomToFilteredBridges, 100);
            }
        });
    }
    
    const areaSlider = document.getElementById('slider-area');
    if (areaSlider) {
        areaSlider.addEventListener('input', function() {
            const actualValue = sliderToValue(parseInt(this.value), 0, 403000, 'area');
            attributesFilterState.area.value = actualValue;
            document.getElementById('value-area').innerHTML = actualValue.toLocaleString() + ' ft<sup>2</sup>';
            checkDimensionSliders();
            applyAttributesFilter();
        });
        // Auto-zoom when slider is released
        areaSlider.addEventListener('change', function() {
            if (attributesFilterState.area.value < 403000) {
                setTimeout(autoZoomToFilteredBridges, 100);
            }
        });
    }
    
    const ageSlider = document.getElementById('slider-age');
    if (ageSlider) {
        ageSlider.addEventListener('input', function() {
            const rawValue = sliderToValue(parseInt(this.value), 0, 210, 'age');
            // Round to nearest 5 years
            const actualValue = Math.round(rawValue / 5) * 5;
            attributesFilterState.age.value = actualValue;
            document.getElementById('value-age').textContent = actualValue.toLocaleString() + ' years';
            checkDimensionSliders();
            applyAttributesFilter();
        });
        // Auto-zoom when slider is released
        ageSlider.addEventListener('change', function() {
            if (attributesFilterState.age.value < 210) {
                setTimeout(autoZoomToFilteredBridges, 100);
            }
        });
    }
    
    const adtSlider = document.getElementById('slider-adt');
    if (adtSlider) {
        adtSlider.addEventListener('input', function() {
            const actualValue = sliderToValue(parseInt(this.value), 0, 150000, 'adt');
            attributesFilterState.adt.value = actualValue;
            document.getElementById('value-adt').textContent = actualValue.toLocaleString();
            applyAttributesFilter();
        });
        adtSlider.addEventListener('change', function() {
            if (attributesFilterState.adt.value < 150000) {
                setTimeout(autoZoomToFilteredBridges, 100);
            }
        });
    }

    const utilitiesCheckbox = document.getElementById('attr-utilities');
    if (utilitiesCheckbox) {
        utilitiesCheckbox.addEventListener('change', function() {
            attributesFilterState.utilities = this.checked;
            applyAttributesFilter();
        });
    }
    
    document.querySelectorAll('.on-bridge-cb').forEach(cb => {
        cb.addEventListener('change', function() {
            const values = this.value.split(',');
            if (this.checked) {
                attributesFilterState.onBridge.push(values);
            } else {
                // Fix: Compare arrays properly
                attributesFilterState.onBridge = attributesFilterState.onBridge.filter(v => 
                    v.join(',') !== values.join(',')
                );
            }
            applyAttributesFilter();
        });
    });
    
    document.querySelectorAll('.under-bridge-cb').forEach(cb => {
        cb.addEventListener('change', function() {
            const values = this.value.split(',');
            if (this.checked) {
                attributesFilterState.underBridge.push(values);
            } else {
                // Fix: Compare arrays properly
                attributesFilterState.underBridge = attributesFilterState.underBridge.filter(v => 
                    v.join(',') !== values.join(',')
                );
            }
            applyAttributesFilter();
        });
    });
    
    const routeSearch = document.getElementById('route-search');
    if (routeSearch) {
        routeSearch.addEventListener('input', function() {
            attributesFilterState.route = this.value.trim();
            applyAttributesFilter();
            if (this.value.trim().length > 0) {
                setTimeout(autoZoomToFilteredBridges, 100);
            }
        });
    }
    
    const subrouteSearch = document.getElementById('subroute-search');
    if (subrouteSearch) {
        subrouteSearch.addEventListener('input', function() {
            attributesFilterState.subroute = this.value;
            applyAttributesFilter();
            // Auto-zoom if subroute entered
            if (this.value.length > 0) {
                setTimeout(autoZoomToFilteredBridges, 100);
            }
        });
    }
    
    // Show N/A bridges toggle
    const showNACheckbox = document.getElementById('show-na-bridges');
    if (showNACheckbox) {
        showNACheckbox.addEventListener('change', function() {
            attributesFilterState.showNA = this.checked;
            applyAttributesFilter();
        });
    }
});

// Apply attributes filter and update bridge visibility
function applyAttributesFilter() {
    // Check if any filter is active
    const isActive =
        attributesFilterState.showNA ||
        attributesFilterState.length.value < 4020 ||
        attributesFilterState.width.value < 880 ||
        attributesFilterState.area.value < 403000 ||
        attributesFilterState.age.value < 210 ||
        attributesFilterState.adt.value < 150000 ||
        attributesFilterState.nhs !== 'all' ||
        attributesFilterState.utilities ||
        attributesFilterState.onBridge.length > 0 ||
        attributesFilterState.underBridge.length > 0 ||
        attributesFilterState.route.length > 0 ||
        attributesFilterState.subroute.length > 0;
    
    attributesFilterState.active = isActive;
    
    console.log('Attributes filter active:', isActive);
    
    // Update status bar to RED when attributes active
    const statusBar = document.getElementById('statusBar');
    const resetBtn = document.getElementById('attributesResetBtn');
    if (statusBar) {
        if (isActive) {
            // Show red bar
            statusBar.classList.add('attributes-active');
            statusBar.style.display = 'flex';
            if (resetBtn) resetBtn.style.display = 'inline-block';
            
            // If inspection is also active, show both
            if (inspectionFiltersActive) {
                let inspText = 'Inspection View';
                if (selectedInspectionTypes.length > 0) {
                    inspText += ' | ' + selectedInspectionTypes.join(', ');
                }
                document.getElementById('statusText').textContent = 'Attributes Active | ' + inspText;
            } else {
                document.getElementById('statusText').textContent = 'Attributes Filter Active';
            }
        } else {
            // Remove red class when attributes not active
            statusBar.classList.remove('attributes-active');
            if (resetBtn) resetBtn.style.display = 'none';
            
            // If inspection is still active, update text
            if (inspectionFiltersActive) {
                let text = 'Inspection View';
                if (selectedInspectionTypes.length > 0) {
                    text += ' | ' + selectedInspectionTypes.join(', ');
                }
                document.getElementById('statusText').textContent = text;
            } else {
                // Hide bar if no filters active
                statusBar.style.display = 'none';
                document.getElementById('statusText').textContent = 'MODE: Default';
            }
        }
    }
    
    // Reapply bridge visibility
    updateBridgeSizes();

    // Auto-zoom to filtered bridges when filter is active
    if (isActive) {
        autoZoomToFilteredBridges();
    }
}

// Check if bridge passes attributes filter
function bridgePassesAttributesFilter(bridge) {
    if (!attributesFilterState.active) return true;
    
    // NA mode: when showNA is checked, ONLY show bridges with N/A data
    // When showNA is unchecked, hide bridges with N/A data for active dimensions
    if (attributesFilterState.showNA) {
        // Exclusive NA mode — bridge must have N/A in at least one dimension
        // If sliders are moved, check only active dimensions; otherwise check all four
        const lengthActive = attributesFilterState.length.value < 4020;
        const widthActive = attributesFilterState.width.value < 880;
        const areaActive = attributesFilterState.area.value < 403000;
        const ageActive = attributesFilterState.age.value < 210;
        const adtActive = attributesFilterState.adt.value < 150000;
        const anySliderActive = lengthActive || widthActive || areaActive || ageActive || adtActive;

        let hasNA = false;
        const checkLength = anySliderActive ? lengthActive : true;
        const checkWidth = anySliderActive ? widthActive : true;
        const checkArea = anySliderActive ? areaActive : true;
        const checkAge = anySliderActive ? ageActive : true;
        const checkAdt = anySliderActive ? adtActive : true;

        if (checkLength) {
            const length = parseFloat(bridge.bridge_length);
            if (isNaN(length) || length === 0) hasNA = true;
        }
        if (checkWidth) {
            const width = parseFloat(bridge.width_out_to_out);
            if (isNaN(width) || width === 0) hasNA = true;
        }
        if (checkArea) {
            const area = parseFloat(bridge.bridge_area);
            if (isNaN(area) || area === 0) hasNA = true;
        }
        if (checkAge) {
            const age = parseInt(bridge.bridge_age);
            if (isNaN(age) || age === 0) hasNA = true;
        }
        if (checkAdt) {
            const adt = parseInt(bridge.adt);
            if (isNaN(adt) || adt === 0) hasNA = true;
        }
        if (!hasNA) return false;
        // When showNA is the only active filter (no sliders moved), skip dimension filters below
        if (!anySliderActive) return true;
    } else {
        // Normal mode — hide bridges with N/A data for active dimensions
        if (attributesFilterState.length.value < 4020) {
            const length = parseFloat(bridge.bridge_length);
            if (isNaN(length) || length === 0) return false;
        }
        if (attributesFilterState.width.value < 880) {
            const width = parseFloat(bridge.width_out_to_out);
            if (isNaN(width) || width === 0) return false;
        }
        if (attributesFilterState.area.value < 403000) {
            const area = parseFloat(bridge.bridge_area);
            if (isNaN(area) || area === 0) return false;
        }
        if (attributesFilterState.age.value < 210) {
            const age = parseInt(bridge.bridge_age);
            if (isNaN(age) || age === 0) return false;
        }
        if (attributesFilterState.adt.value < 150000) {
            const adt = parseInt(bridge.adt);
            if (isNaN(adt) || adt === 0) return false;
        }
    }

    // Length filter
    const length = parseFloat(bridge.bridge_length) || 0;
    if (attributesFilterState.length.mode === 'lte' && length > attributesFilterState.length.value) return false;
    if (attributesFilterState.length.mode === 'gte' && length < attributesFilterState.length.value) return false;
    
    // Width filter
    const width = parseFloat(bridge.width_out_to_out) || 0;
    if (attributesFilterState.width.mode === 'lte' && width > attributesFilterState.width.value) return false;
    if (attributesFilterState.width.mode === 'gte' && width < attributesFilterState.width.value) return false;
    
    // Area filter
    const area = parseFloat(bridge.bridge_area) || 0;
    if (attributesFilterState.area.mode === 'lte' && area > attributesFilterState.area.value) return false;
    if (attributesFilterState.area.mode === 'gte' && area < attributesFilterState.area.value) return false;
    
    // Age filter
    const age = parseInt(bridge.bridge_age) || 0;
    if (attributesFilterState.age.mode === 'lte' && age > attributesFilterState.age.value) return false;
    if (attributesFilterState.age.mode === 'gte' && age < attributesFilterState.age.value) return false;

    // ADT filter
    if (attributesFilterState.adt.value < 150000) {
        const adt = parseInt(bridge.adt) || 0;
        if (attributesFilterState.adt.mode === 'lte' && adt > attributesFilterState.adt.value) return false;
        if (attributesFilterState.adt.mode === 'gte' && adt < attributesFilterState.adt.value) return false;
    }

    // NHS filter
    if (attributesFilterState.nhs === 'yes' && bridge.nhs !== 'Yes') return false;
    if (attributesFilterState.nhs === 'no' && bridge.nhs === 'Yes') return false;
    
    // Utilities filter
    if (attributesFilterState.utilities && bridge.utilities_on_bridge !== 'Yes') return false;
    
    // On Bridge filter
    if (attributesFilterState.onBridge.length > 0) {
        const onBridge = (bridge.on_bridge || '').charAt(0);
        let matches = false;
        for (const values of attributesFilterState.onBridge) {
            if (values.includes(onBridge)) {
                matches = true;
                break;
            }
        }
        if (!matches) return false;
    }
    
    // Under Bridge filter
    if (attributesFilterState.underBridge.length > 0) {
        const underBridge = (bridge.under_bridge || '').charAt(0);
        let matches = false;
        for (const values of attributesFilterState.underBridge) {
            if (values.includes(underBridge)) {
                matches = true;
                break;
            }
        }
        if (!matches) return false;
    }
    
    // Route filter — startsWith after stripping leading zeros
    if (attributesFilterState.route.length > 0) {
        const bridgeRoute = (bridge.route || '').toString().replace(/^0+/, '') || '0';
        const searchRoute = attributesFilterState.route.replace(/^0+/, '') || '0';
        if (!bridgeRoute.startsWith(searchRoute)) return false;
    }
    
    // Subroute filter
    if (attributesFilterState.subroute.length > 0) {
        const subroute = (bridge.subroute || '').toString().toUpperCase();
        if (!subroute.includes(attributesFilterState.subroute.toUpperCase())) return false;
    }
    
    return true;
}

// Quantile-based slider scaling — each 1% of slider = ~1% of bridge population
// Built from actual data distribution after bridgesData loads
const quantileTables = {};

function buildQuantileTables() {
    const fields = {
        length: { getter: b => parseFloat(b.bridge_length) || 0, max: 4020 },
        width:  { getter: b => parseFloat(b.width_out_to_out) || 0, max: 880 },
        area:   { getter: b => parseFloat(b.bridge_area) || 0, max: 403000 },
        age:    { getter: b => parseInt(b.bridge_age) || 0, max: 210 },
        adt:    { getter: b => parseInt(b.adt) || 0, max: 150000 }
    };

    Object.entries(fields).forEach(([key, cfg]) => {
        const values = bridgesData.map(cfg.getter).filter(v => v > 0).sort((a, b) => a - b);
        // Build 101-point table (positions 0-100)
        const table = new Array(101);
        table[0] = 0;
        for (let i = 1; i <= 97; i++) {
            const idx = Math.min(Math.round((i / 100) * (values.length - 1)), values.length - 1);
            table[i] = Math.round(values[idx]);
        }
        // Smooth ramp from p97 data value to hardcoded max over positions 98-100
        // Prevents a massive jump at the last slider tick
        const p97val = table[97];
        table[98] = Math.round(p97val + (cfg.max - p97val) * 0.33);
        table[99] = Math.round(p97val + (cfg.max - p97val) * 0.66);
        table[100] = cfg.max;
        quantileTables[key] = table;
    });

    console.log('✓ Built quantile tables for slider normalization');
}

function sliderToValue(position, min, max, field) {
    if (field && quantileTables[field]) {
        const pos = Math.max(0, Math.min(100, Math.round(position)));
        return quantileTables[field][pos];
    }
    // Fallback: quadratic
    const range = max - min;
    return Math.round(Math.pow(position / 100, 2) * range + min);
}

function valueToSlider(value, min, max, field) {
    if (field && quantileTables[field]) {
        const table = quantileTables[field];
        // Binary search for closest position
        if (value <= table[0]) return 0;
        if (value >= table[100]) return 100;
        let lo = 0, hi = 100;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (table[mid] < value) lo = mid + 1;
            else hi = mid;
        }
        // Interpolate between lo-1 and lo for smoother mapping
        if (lo > 0 && table[lo] !== table[lo - 1]) {
            const frac = (value - table[lo - 1]) / (table[lo] - table[lo - 1]);
            return Math.round(lo - 1 + frac);
        }
        return lo;
    }
    // Fallback: quadratic
    const range = max - min;
    if (range === 0) return 0;
    return Math.round(Math.pow((value - min) / range, 1 / 2) * 100);
}

// Handle Length/Width/Area mutual exclusivity
// Logic: Can use any 2, but not all 3
function checkDimensionSliders() {
    const lengthActive = attributesFilterState.length.value < 4020;
    const widthActive = attributesFilterState.width.value < 880;
    const areaActive = attributesFilterState.area.value < 403000;
    
    const areaSlider = document.getElementById('slider-area');
    const lengthSlider = document.getElementById('slider-length');
    const widthSlider = document.getElementById('slider-width');
    
    // If Length AND Width are BOTH active, disable Area
    if (lengthActive && widthActive) {
        if (areaSlider) {
            areaSlider.disabled = true;
            areaSlider.style.opacity = '0.4';
            areaSlider.style.cursor = 'not-allowed';
        }
        // Reset area to max
        if (areaActive) {
            attributesFilterState.area.value = 403000;
            document.getElementById('value-area').innerHTML = '403,000 ft<sup>2</sup>';
            areaSlider.value = areaSlider.max;
        }
    } else {
        // Enable Area if not both L+W active
        if (areaSlider) {
            areaSlider.disabled = false;
            areaSlider.style.opacity = '1';
            areaSlider.style.cursor = 'pointer';
        }
    }
    
    // If Length AND Area are BOTH active, disable Width
    if (lengthActive && areaActive) {
        if (widthSlider) {
            widthSlider.disabled = true;
            widthSlider.style.opacity = '0.4';
            widthSlider.style.cursor = 'not-allowed';
        }
        // Reset width to max
        if (widthActive) {
            attributesFilterState.width.value = 880;
            document.getElementById('value-width').textContent = '880 ft';
            widthSlider.value = 100;
        }
    } else {
        // Enable Width if not both L+A active
        if (widthSlider) {
            widthSlider.disabled = false;
            widthSlider.style.opacity = '1';
            widthSlider.style.cursor = 'pointer';
        }
    }
    
    // If Width AND Area are BOTH active, disable Length
    if (widthActive && areaActive) {
        if (lengthSlider) {
            lengthSlider.disabled = true;
            lengthSlider.style.opacity = '0.4';
            lengthSlider.style.cursor = 'not-allowed';
        }
        // Reset length to max
        if (lengthActive) {
            attributesFilterState.length.value = 4020;
            document.getElementById('value-length').textContent = '4,020 ft';
            lengthSlider.value = 100;
        }
    } else {
        // Enable Length if not both W+A active
        if (lengthSlider) {
            lengthSlider.disabled = false;
            lengthSlider.style.opacity = '1';
            lengthSlider.style.cursor = 'pointer';
        }
    }
}

// Auto-zoom to visible bridges after filter
function autoZoomToFilteredBridges() {
    let minLat = Infinity, maxLat = -Infinity;
    let minLng = Infinity, maxLng = -Infinity;
    let count = 0;
    
    Object.values(bridgeLayers).forEach(marker => {
        // Check if bridge is on the map
        if (marker._map) {
            const latlng = marker.getLatLng();
            if (latlng.lat < minLat) minLat = latlng.lat;
            if (latlng.lat > maxLat) maxLat = latlng.lat;
            if (latlng.lng < minLng) minLng = latlng.lng;
            if (latlng.lng > maxLng) maxLng = latlng.lng;
            count++;
        }
    });
    
    if (count > 0) {
        const bounds = [[minLat, minLng], [maxLat, maxLng]];
        map.fitBounds(bounds, {
            padding: [50, 50],
            maxZoom: 12,
            animate: true,
            duration: 0.5
        });
        console.log(`Auto-zoomed to ${count} filtered bridges`);
    }
}

// ============================================
// COUNT REPORT SYSTEM (v7.6.5 - Dynamic Buttons)
// ============================================

// Track which CR button set is currently rendered: 'default' or 'full'
let crButtonMode = null;
let crButtonInspection = null; // track whether buttons were built for inspection mode

// Build CR buttons dynamically based on active filter context
// 'default' = HUB Data, N/A, Total (no condition sliders engaged)
// 'full' = Critical, Emergent, Satisfactory, N/A, HUB Data, Total (condition sliders engaged)
function buildCountReportButtons(mode) {
    const isInspection = !!inspectionFiltersActive;
    if (mode === crButtonMode && isInspection === crButtonInspection) return; // already in correct mode
    crButtonMode = mode;
    crButtonInspection = isInspection;

    const body = document.getElementById('countReportBody');
    if (!body) return;

    const btnStyle = 'display: flex; justify-content: space-between; align-items: center; width: 100%; padding: 5px 8px; margin-bottom: 3px; background: transparent; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; cursor: pointer; transition: all 0.2s;';
    const dotStyle = 'width: 10px; height: 10px; border-radius: 50%; border: 1px solid #fff;';
    const labelStyle = 'color: #fff; font-weight: 600; font-size: 9pt;';
    const countStyle = 'color: #fff; font-size: 12pt; font-weight: 700;';

    let html = '';

    if (mode === 'full') {
        if (inspectionFiltersActive) {
            // Inspection mode: Past Due → Upcoming → Completed
            html += `<button id="btn-critical" onclick="toggleCountCategory('critical')" style="${btnStyle}">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="${dotStyle} background: #dc2626;"></div>
                    <span style="${labelStyle}">Past Due</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="${countStyle}" id="count-critical">0</span>
                    <span onclick="event.stopPropagation(); showCategoryTable('critical')"
                          style="cursor:pointer; font-size:9pt; opacity:0.6;" title="View table">☰</span>
                </div>
            </button>`;
            html += `<button id="btn-emergent" onclick="toggleCountCategory('emergent')" style="${btnStyle}">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="${dotStyle} background: #F97316;"></div>
                    <span style="${labelStyle}">Upcoming</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="${countStyle}" id="count-emergent">0</span>
                    <span onclick="event.stopPropagation(); showCategoryTable('emergent')"
                          style="cursor:pointer; font-size:9pt; opacity:0.6;" title="View table">☰</span>
                </div>
            </button>`;
            html += `<button id="btn-satisfactory" onclick="toggleCountCategory('satisfactory')" style="${btnStyle}">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="${dotStyle} background: #10B981;"></div>
                    <span style="${labelStyle}">Completed</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="${countStyle}" id="count-satisfactory">0</span>
                    <span onclick="event.stopPropagation(); showCategoryTable('satisfactory')"
                          style="cursor:pointer; font-size:9pt; opacity:0.6;" title="View table">☰</span>
                </div>
            </button>`;
        } else {
            // Maintenance/evaluation mode: Critical → Emergent → Satisfactory
            html += `<button id="btn-critical" onclick="toggleCountCategory('critical')" style="${btnStyle}">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="${dotStyle} background: #dc2626;"></div>
                    <span style="${labelStyle}">Critical</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="${countStyle}" id="count-critical">0</span>
                    <span onclick="event.stopPropagation(); showMaintenanceCategoryTable('critical')"
                          style="cursor:pointer; font-size:9pt; opacity:0.6;" title="View table">☰</span>
                </div>
            </button>`;
            html += `<button id="btn-emergent" onclick="toggleCountCategory('emergent')" style="${btnStyle}">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="${dotStyle} background: #F97316;"></div>
                    <span style="${labelStyle}">Emergent</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="${countStyle}" id="count-emergent">0</span>
                    <span onclick="event.stopPropagation(); showMaintenanceCategoryTable('emergent')"
                          style="cursor:pointer; font-size:9pt; opacity:0.6;" title="View table">☰</span>
                </div>
            </button>`;
            html += `<button id="btn-satisfactory" onclick="toggleCountCategory('satisfactory')" style="${btnStyle}">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="${dotStyle} background: #10b981;"></div>
                    <span style="${labelStyle}">Satisfactory</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="${countStyle}" id="count-satisfactory">0</span>
                    <span onclick="event.stopPropagation(); showMaintenanceCategoryTable('satisfactory')"
                          style="cursor:pointer; font-size:9pt; opacity:0.6;" title="View table">☰</span>
                </div>
            </button>`;
        }
    }

    // N/A — always present
    html += `<button id="btn-na" onclick="toggleCountCategory('na')" style="${btnStyle}">
        <div style="display: flex; align-items: center; gap: 8px;">
            <div style="${dotStyle} background: #6b7280;"></div>
            <span style="${labelStyle}">N/A</span>
        </div>
        <span style="${countStyle}" id="count-na">0</span>
    </button>`;

    // HUB Data — always present (extra bottom margin before Total)
    html += `<button id="btn-hubdata" onclick="toggleCountCategory('hubdata')" style="${btnStyle} margin-bottom: 6px;">
        <div style="display: flex; align-items: center; gap: 8px;">
            <div style="${dotStyle} background: #22c55e;"></div>
            <span style="${labelStyle}">HUB Data</span>
        </div>
        <span style="${countStyle}" id="count-hubdata">0</span>
    </button>`;

    // Total — always present
    html += `<button id="btn-total" onclick="toggleCountCategory('total')" style="display: flex; justify-content: space-between; align-items: center; width: 100%; padding: 6px 8px; background: rgba(255,184,28,0.1); border: 2px solid var(--wvdoh-yellow); border-radius: 4px; cursor: pointer; transition: all 0.2s;">
        <span style="color: var(--wvdoh-yellow); font-weight: 700; font-size: 9pt; text-transform: uppercase; letter-spacing: 1px;">TOTAL</span>
        <span style="color: var(--wvdoh-yellow); font-size: 12pt; font-weight: 700;" id="count-total">0</span>
    </button>`;

    body.innerHTML = html;
    console.log('CR buttons rebuilt:', mode);
}

// Track which categories are active (ALL on by default except N/A)
const countCategoryState = {
    critical: true,
    emergent: true,
    satisfactory: true,
    completed: true,
    na: false,
    hubdata: false,
    total: true
};

// Store max counts (always show these)
let maxCounts = {
    critical: 0,
    emergent: 0,
    satisfactory: 0,
    completed: 0,
    na: 0,
    hubdata: 0,
    total: 0
};

// Track click state for double-click detection
const categoryClickState = {
    critical: 0,
    emergent: 0,
    satisfactory: 0,
    completed: 0,
    na: 0,
    hubdata: 0
};

// HUB Data project toggle: 0 = off (blue), 1 = on (yellow), 2 = theme only (green)
let hubDataMode = 0;

// Categorize a bridge by its worst condition rating (data-based, not color-based)
// When evaluation sliders are active, only considers the active slider components
// When inspection filters are active, categorizes by due date instead
function getBridgeCategory(bridge) {
    // Inspection mode: categorize by due-date status
    // Each record = a performed inspection; 'due' = when the NEXT one is needed
    if (inspectionFiltersActive) {
        const inspections = inspectionsData[bridge.bars_number];
        if (!inspections) return 'na';

        // Filter by selected types
        let relevant = inspections;
        if (selectedInspectionTypes.length > 0) {
            relevant = inspections.filter(i => selectedInspectionTypes.includes(i.type));
        }
        // Filter by selected months
        if (selectedMonths.length > 0) {
            relevant = relevant.filter(i => {
                const d = parseDateString(i.due);
                return d && selectedMonths.includes(d.getMonth() + 1);
            });
        }
        if (relevant.length === 0) return 'na';

        const today = new Date();
        const sixtyDays = new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000);
        let hasOverdue = false, hasUpcoming = false;

        relevant.forEach(insp => {
            const due = parseDateString(insp.due);
            if (!due) return;
            if (due < today) hasOverdue = true;
            else if (due <= sixtyDays) hasUpcoming = true;
        });

        if (hasOverdue) return 'critical';      // Past Due
        if (hasUpcoming) return 'emergent';      // Upcoming
        return 'satisfactory';                   // Future
    }

    const ratingMap = {
        deck: bridge.deck_rating,
        superstructure: bridge.superstructure_rating,
        substructure: bridge.substructure_rating,
        bearings: bridge.bearings_rating,
        joints: bridge.joints_rating
    };

    // If evaluation mode with active sliders, match what getEvaluationColor uses
    if (evaluationActive) {
        const severitySliders = Object.entries(sliderValues)
            .filter(([k, v]) => v > 0 && k !== 'sufficiency');

        if (severitySliders.length > 0) {
            const ratings = severitySliders
                .map(([key]) => ratingMap[key])
                .filter(r => typeof r === 'number' && !isNaN(r) && r >= 1 && r <= 9);

            if (ratings.length === 0) return 'na';

            const worst = Math.min(...ratings);
            if (worst <= 1) return 'critical';
            if (worst <= 4) return 'emergent';
            return 'satisfactory';
        }
    }

    // Default: use all ratings (attributes filter, no sliders active, etc.)
    const ratings = Object.values(ratingMap)
        .filter(r => typeof r === 'number' && !isNaN(r) && r >= 1 && r <= 9);

    if (ratings.length === 0) return 'na';

    const worst = Math.min(...ratings);
    if (worst <= 1) return 'critical';
    if (worst <= 4) return 'emergent';
    return 'satisfactory';
}

// Calculate counts of ALL bridges by condition category (for max counts)
function calculateMaxBridgeCounts() {
    let critical = 0;
    let emergent = 0;
    let satisfactory = 0;
    let completed = 0;
    let na = 0;
    let hubdata = 0;

    Object.entries(bridgeLayers).forEach(([bars, marker]) => {
        const bridge = marker.bridgeData;
        if (!bridge) return;

        // Apply same filters as updateBridgeSizes/updateBridgesForInspection
        // District filter
        if (!activeDistricts[bridge.district]) return;

        // Search filter
        if (currentSearchQuery.length > 0) {
            const barsUpper = (bridge.bars_number || '').toUpperCase();
            const name = (bridge.bridge_name || '').toUpperCase();
            const isNumericSearch = /^\d/.test(currentSearchQuery);
            const matchesBars = isNumericSearch ? barsUpper.startsWith(currentSearchQuery) : barsUpper.includes(currentSearchQuery);
            const matchesName = isNumericSearch ? name.startsWith(currentSearchQuery) : name.includes(currentSearchQuery);
            if (!matchesBars && !matchesName) return;
        }

        // Attributes filter
        if (typeof attributesFilterState !== 'undefined' && attributesFilterState.active) {
            if (!bridgePassesAttributesFilter(bridge)) return;
        }

        // Sufficiency filter
        if (sliderValues.sufficiency < 100) {
            const calcSuff = getSufficiencyRating(bridge);
            if (calcSuff == null) return;
            const suffThreshold = sliderValues.sufficiency / 100 * 9;
            if (sufficiencyMode === 'lte') {
                if (calcSuff > suffThreshold) return;
            } else {
                if (calcSuff < suffThreshold) return;
            }
        }

        // HUB data count
        if (projectsData[bars]) hubdata++;

        const category = getBridgeCategory(bridge);
        if (category === 'critical') critical++;
        else if (category === 'emergent') emergent++;
        else if (category === 'completed') completed++;
        else if (category === 'satisfactory') satisfactory++;
        else na++;
    });

    return { critical, emergent, satisfactory, completed, na, hubdata, total: critical + emergent + satisfactory + completed + na };
}

// Category label mapping for inspection CR table popups
const categoryLabels = {
    critical: 'Past Due',
    emergent: 'Upcoming',
    satisfactory: 'Completed'
};

// Show a detail table popup for a CR inspection category
function showCategoryTable(category) {
    const savedPos = _saveCategoryPopupPos();
    const label = categoryLabels[category] || category;
    const today = new Date();
    const rows = [];

    Object.entries(bridgeLayers).forEach(([bars, marker]) => {
        const bridge = marker.bridgeData;
        if (!bridge) return;

        // Apply same filters as calculateMaxBridgeCounts
        if (!activeDistricts[bridge.district]) return;

        if (currentSearchQuery.length > 0) {
            const barsUpper = (bridge.bars_number || '').toUpperCase();
            const name = (bridge.bridge_name || '').toUpperCase();
            const isNumericSearch = /^\d/.test(currentSearchQuery);
            const matchesBars = isNumericSearch ? barsUpper.startsWith(currentSearchQuery) : barsUpper.includes(currentSearchQuery);
            const matchesName = isNumericSearch ? name.startsWith(currentSearchQuery) : name.includes(currentSearchQuery);
            if (!matchesBars && !matchesName) return;
        }

        if (typeof attributesFilterState !== 'undefined' && attributesFilterState.active) {
            if (!bridgePassesAttributesFilter(bridge)) return;
        }

        if (sliderValues.sufficiency < 100) {
            const calcSuff = getSufficiencyRating(bridge);
            if (calcSuff == null) return;
            const suffThreshold = sliderValues.sufficiency / 100 * 9;
            if (sufficiencyMode === 'lte') {
                if (calcSuff > suffThreshold) return;
            } else {
                if (calcSuff < suffThreshold) return;
            }
        }

        // Must match the requested category
        if (getBridgeCategory(bridge) !== category) return;

        // Get filtered inspections and find the worst one
        const inspections = inspectionsData[bridge.bars_number];
        if (!inspections) return;

        let relevant = inspections;
        if (selectedInspectionTypes.length > 0) {
            relevant = inspections.filter(i => selectedInspectionTypes.includes(i.type));
        }
        if (selectedMonths.length > 0) {
            relevant = relevant.filter(i => {
                const d = parseDateString(i.due);
                return d && selectedMonths.includes(d.getMonth() + 1);
            });
        }
        if (relevant.length === 0) return;

        // Find worst inspection (most overdue / closest due)
        let worstInsp = null;
        let worstDays = -Infinity;
        relevant.forEach(insp => {
            const due = parseDateString(insp.due);
            if (!due) return;
            const days = Math.floor((today - due) / 86400000);
            if (days > worstDays) {
                worstDays = days;
                worstInsp = insp;
            }
        });

        if (!worstInsp) return;

        const worstDue = parseDateString(worstInsp.due);
        rows.push({
            district: bridge.district,
            bars: bridge.bars_number,
            barsLink: bridge.bars_hyperlink || '#',
            name: cleanBridgeName(bridge.bridge_name),
            lat: bridge.latitude,
            lng: bridge.longitude,
            type: worstInsp.type,
            interval: worstInsp.interval || 24,
            dueDate: worstDue ? worstDue.getTime() : 0,
            dueDateStr: worstInsp.due || '',
            days: worstDays
        });
    });

    // Sort by district (ascending), then days past due descending (worst first)
    rows.sort((a, b) => a.district - b.district || b.days - a.days);

    // Store rows and state globally for sorting/rebuilding
    window._categoryTableRows = rows;
    window._categoryTableCategory = category;
    window._categoryTableSortCol = 'district';
    window._categoryTableSortAsc = true;

    _buildCategoryTablePopup(rows, category);
    _restoreCategoryPopupPos(savedPos);
}

// Rebuild the category table body from sorted rows
function _buildCategoryTablePopup(rows, category) {
    const label = categoryLabels[category] || category;
    const daysColHeader = category === 'critical' ? 'Days Past Due' : 'Due';

    // Determine sort arrow indicators
    const sortCol = window._categoryTableSortCol;
    const sortAsc = window._categoryTableSortAsc;
    function arrow(col) {
        if (col !== sortCol) return '';
        return sortAsc ? ' &#9650;' : ' &#9660;';
    }

    // Build table rows
    let tableRows = '';
    rows.forEach((r, i) => {
        const titleCaseName = (r.name || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
        const mapsLink = `https://www.google.com/maps?q=${r.lat},${r.lng}`;
        let daysText, rowStyle = '';
        if (r.days > 0) {
            daysText = `${r.days}`;
            rowStyle = 'background: rgba(220, 38, 38, 0.2); color: #FCA5A5;';
        } else if (r.days === 0) {
            daysText = 'Today';
            rowStyle = 'background: rgba(245, 158, 11, 0.15);';
        } else {
            daysText = `in ${Math.abs(r.days)} days`;
            rowStyle = '';
        }

        tableRows += `<tr style="${rowStyle} border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
            <td style="padding: 6px 8px; text-align: center;">${i + 1}</td>
            <td style="padding: 6px 8px;">${r.district}</td>
            <td style="padding: 6px 8px;"><a href="${r.barsLink}" target="_blank" style="color: #60A5FA; text-decoration: underline;">${r.bars}</a></td>
            <td class="col-name" style="padding: 6px 8px;"><a href="${mapsLink}" target="_blank" style="color: #60A5FA; text-decoration: underline;">${titleCaseName}</a></td>
            <td style="padding: 6px 8px;">${r.type}</td>
            <td style="padding: 6px 8px; text-align: center;">${r.interval}</td>
            <td style="padding: 6px 8px; text-align: center;">${r.dueDateStr}</td>
            <td style="padding: 6px 8px; text-align: center;">${daysText}</td>
        </tr>`;
    });

    // Remove any existing category table popup
    const existing = document.getElementById('category-table-popup');
    if (existing) existing.remove();

    // Build plain-text table for email body
    const emailLines = rows.map((r, i) => {
        const n = (r.name || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
        let d = r.days > 0 ? `${r.days} days past due` : r.days === 0 ? 'Due today' : `in ${Math.abs(r.days)} days`;
        return `${i + 1}. D${r.district} | ${r.bars} | ${n} | ${r.type} | Due: ${r.dueDateStr} | ${d}`;
    });
    const emailSubject = encodeURIComponent(`SpanBase ${label} — ${rows.length} Bridge${rows.length !== 1 ? 's' : ''}`);
    const emailBody = encodeURIComponent(`${label} — ${rows.length} Bridge${rows.length !== 1 ? 's' : ''}\n\n` + emailLines.join('\n'));
    const mailtoHref = `mailto:?subject=${emailSubject}&body=${emailBody}`;

    const thStyle = 'padding: 8px; cursor: pointer; user-select: none;';

    const popup = document.createElement('div');
    popup.id = 'category-table-popup';
    popup.className = 'info-panel';
    popup.style.cssText = 'max-width: 95vw; resize: none; cursor: default;';
    // Build category nav buttons — show all 3, grey out current + empty
    const inspCatNav = [
        { key: 'critical', label: 'Past Due', color: '#dc2626', countId: 'count-critical' },
        { key: 'emergent', label: 'Upcoming', color: '#F97316', countId: 'count-emergent' },
        { key: 'satisfactory', label: 'Completed', color: '#10B981', countId: 'count-satisfactory' }
    ];
    const inspNavBtnStyle = 'padding: 3px 10px; border-radius: 3px; font-size: 8pt; font-weight: 600; border: none;';
    const inspNavButtons = inspCatNav
        .map(c => {
            const isCurrent = c.key === category;
            const countEl = document.getElementById(c.countId);
            const count = countEl ? parseInt(countEl.textContent, 10) : 0;
            const empty = isNaN(count) || count === 0;
            if (isCurrent || empty) {
                return `<button disabled style="${inspNavBtnStyle} background: rgba(255,255,255,0.15); color: rgba(255,255,255,0.3); cursor: default;">${c.label}</button>`;
            }
            return `<button onclick="showCategoryTable('${c.key}')" style="${inspNavBtnStyle} background: ${c.color}; color: #fff; cursor: pointer;">${c.label}</button>`;
        })
        .join('');

    popup.innerHTML = `
        <div class="info-header" id="category-table-header" style="cursor: default;">
            <h3>${label} — ${rows.length} Bridge${rows.length !== 1 ? 's' : ''}</h3>
            <div style="display: flex; align-items: center; gap: 8px;">
                ${inspNavButtons}
                <a href="${mailtoHref}" title="Share via email"
                   style="background: rgba(255,184,28,0.2); border: 1px solid var(--wvdoh-yellow); color: var(--wvdoh-yellow); padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 9pt; font-weight: 600; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">&#9993; Email</a>
                <button onclick="exportCategoryCSV(window._categoryTableRows, '${label.replace(/\s+/g, '')}')"
                        style="background: rgba(255,184,28,0.2); border: 1px solid var(--wvdoh-yellow); color: var(--wvdoh-yellow); padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 9pt; font-weight: 600;">Export CSV</button>
                <button class="close-btn" onclick="document.getElementById('category-table-popup').remove()">&#215;</button>
            </div>
        </div>
        <div class="info-content" style="cursor: default;">
            <div style="font-size: 8pt; color: rgba(255,255,255,0.45); font-style: italic; margin-bottom: 6px;">Sorted by district. Click any column header to re-sort. Export reflects current sort order.</div>
            <table style="border-collapse: collapse; font-size: 10pt; color: #fff; cursor: text;">
                <colgroup>
                    <col style="width: 35px;">
                    <col style="width: 55px;">
                    <col style="width: 85px;">
                    <col>
                    <col style="width: 100px;">
                    <col style="width: 60px;">
                    <col style="width: 90px;">
                    <col style="width: 100px;">
                </colgroup>
                <thead>
                    <tr style="background: rgba(0, 40, 85, 0.3); border-bottom: 2px solid #FFB81C;">
                        <th style="${thStyle} text-align: center; cursor: default;">#</th>
                        <th style="${thStyle} text-align: left;" onclick="sortCategoryTable('district')">District${arrow('district')}</th>
                        <th style="${thStyle} text-align: left;" onclick="sortCategoryTable('bars')">BARS${arrow('bars')}</th>
                        <th class="col-name" style="${thStyle} text-align: left;" onclick="sortCategoryTable('name')">Bridge Name${arrow('name')}</th>
                        <th style="${thStyle} text-align: left;" onclick="sortCategoryTable('type')">Type${arrow('type')}</th>
                        <th style="${thStyle} text-align: center;" onclick="sortCategoryTable('interval')">Interval${arrow('interval')}</th>
                        <th style="${thStyle} text-align: center;" onclick="sortCategoryTable('dueDate')">Due Date${arrow('dueDate')}</th>
                        <th style="${thStyle} text-align: center;" onclick="sortCategoryTable('days')">${daysColHeader}${arrow('days')}</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
        </div>
    `;

    document.body.appendChild(popup);
    makeDraggable(popup, document.getElementById('category-table-header'));
}

// Sort the category table by a column and rebuild
function sortCategoryTable(col) {
    const rows = window._categoryTableRows;
    if (!rows) return;

    // Toggle direction if same column, otherwise default ascending (days defaults descending)
    if (window._categoryTableSortCol === col) {
        window._categoryTableSortAsc = !window._categoryTableSortAsc;
    } else {
        window._categoryTableSortCol = col;
        window._categoryTableSortAsc = col === 'days' ? false : true;
    }

    const asc = window._categoryTableSortAsc;
    rows.sort((a, b) => {
        let va = a[col], vb = b[col];
        if (typeof va === 'string') {
            va = va.toLowerCase(); vb = (vb || '').toLowerCase();
            if (va < vb) return asc ? -1 : 1;
            if (va > vb) return asc ? 1 : -1;
            return 0;
        }
        return asc ? va - vb : vb - va;
    });

    _buildCategoryTablePopup(rows, window._categoryTableCategory);
}

// Export CR category table data as CSV
function exportCategoryCSV(rows, label) {
    if (!rows || rows.length === 0) return;

    const headers = '#,District,BARS,Bridge Name,Type,Interval,Due Date,Days Past Due';
    const csvRows = rows.map((r, i) => {
        const titleCaseName = (r.name || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
        let daysText;
        if (r.days > 0) daysText = r.days;
        else if (r.days === 0) daysText = 0;
        else daysText = -Math.abs(r.days);
        return `${i + 1},${r.district},"${r.bars}","${titleCaseName}",${r.type},${r.interval},${r.dueDateStr},${daysText}`;
    });

    const csv = headers + '\n' + csvRows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);

    const today = new Date();
    const dateStr = today.getFullYear() + '-' +
        String(today.getMonth() + 1).padStart(2, '0') + '-' +
        String(today.getDate()).padStart(2, '0');

    const a = document.createElement('a');
    a.href = url;
    a.download = `SpanBase_${label}_${dateStr}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ── Maintenance CR Category Detail Tables ──

const maintenanceCategoryLabels = {
    critical: 'Critical',
    emergent: 'Emergent',
    satisfactory: 'Satisfactory'
};

const sliderShortNames = {
    deck: 'Deck',
    superstructure: 'Superstructure',
    substructure: 'Substructure',
    bearings: 'Bearings',
    joints: 'Joints'
};

function getMaintenanceTableTitle(category) {
    const base = maintenanceCategoryLabels[category] || category;
    const activeSliders = Object.entries(sliderValues)
        .filter(([k, v]) => v > 0 && k !== 'sufficiency')
        .map(([k]) => sliderShortNames[k] || k);
    const components = activeSliders.length > 0 ? activeSliders.join(' / ') : 'All Ratings';
    return `${base} — ${components}`;
}

// Save current category-table-popup position before replacing it
function _saveCategoryPopupPos() {
    const existing = document.getElementById('category-table-popup');
    if (!existing) return null;
    const rect = existing.getBoundingClientRect();
    return { top: rect.top, left: rect.left };
}

// Apply saved position to newly created category-table-popup
function _restoreCategoryPopupPos(pos) {
    if (!pos) return;
    const popup = document.getElementById('category-table-popup');
    if (!popup) return;
    popup.style.top = pos.top + 'px';
    popup.style.left = pos.left + 'px';
    popup.style.transform = 'none';
}

// Show a detail table popup for a maintenance CR category
function showMaintenanceCategoryTable(category) {
    const savedPos = _saveCategoryPopupPos();
    const label = getMaintenanceTableTitle(category);
    const currentYear = new Date().getFullYear();
    const rows = [];

    Object.entries(bridgeLayers).forEach(([bars, marker]) => {
        const bridge = marker.bridgeData;
        if (!bridge) return;

        // Apply same filters as calculateMaxBridgeCounts
        if (!activeDistricts[bridge.district]) return;

        if (currentSearchQuery.length > 0) {
            const barsUpper = (bridge.bars_number || '').toUpperCase();
            const name = (bridge.bridge_name || '').toUpperCase();
            const isNumericSearch = /^\d/.test(currentSearchQuery);
            const matchesBars = isNumericSearch ? barsUpper.startsWith(currentSearchQuery) : barsUpper.includes(currentSearchQuery);
            const matchesName = isNumericSearch ? name.startsWith(currentSearchQuery) : name.includes(currentSearchQuery);
            if (!matchesBars && !matchesName) return;
        }

        if (typeof attributesFilterState !== 'undefined' && attributesFilterState.active) {
            if (!bridgePassesAttributesFilter(bridge)) return;
        }

        if (sliderValues.sufficiency < 100) {
            const calcSuff = getSufficiencyRating(bridge);
            if (calcSuff == null) return;
            const suffThreshold = sliderValues.sufficiency / 100 * 9;
            if (sufficiencyMode === 'lte') {
                if (calcSuff > suffThreshold) return;
            } else {
                if (calcSuff < suffThreshold) return;
            }
        }

        // Must match the requested category
        if (getBridgeCategory(bridge) !== category) return;

        // Get sufficiency rating (0-100% scale)
        const suffRaw = sufficiencyData[bridge.bars_number];
        const suffDisplay = suffRaw != null ? suffRaw.toFixed(1) + '%' : 'N/A';
        const suffSort = suffRaw != null ? suffRaw : -1;

        const age = bridge.year_built ? currentYear - bridge.year_built : null;

        rows.push({
            district: bridge.district,
            bars: bridge.bars_number,
            barsLink: bridge.bars_hyperlink || '#',
            name: cleanBridgeName(bridge.bridge_name),
            lat: bridge.latitude,
            lng: bridge.longitude,
            deck: bridge.deck_rating,
            superstructure: bridge.superstructure_rating,
            substructure: bridge.substructure_rating,
            bearings: bridge.bearings_rating,
            joints: bridge.joints_rating,
            sufficiency: suffSort,
            sufficiencyDisplay: suffDisplay,
            nhs: bridge.nhs || 'N/A',
            adt: bridge.adt,
            adtYear: bridge.adt_year,
            age: age
        });
    });

    // Sort by district ascending as default
    rows.sort((a, b) => a.district - b.district);

    // Store rows and state globally for sorting/rebuilding
    window._maintTableRows = rows;
    window._maintTableCategory = category;
    window._maintTableLabel = label;
    window._maintTableSortCol = 'district';
    window._maintTableSortAsc = true;

    _buildMaintenanceCategoryTablePopup(rows, category);
    _restoreCategoryPopupPos(savedPos);
}

// Rebuild the maintenance category table popup from sorted rows
function _buildMaintenanceCategoryTablePopup(rows, category) {
    const label = window._maintTableLabel || (maintenanceCategoryLabels[category] || category);

    const sortCol = window._maintTableSortCol;
    const sortAsc = window._maintTableSortAsc;
    function arrow(col) {
        if (col !== sortCol) return '';
        return sortAsc ? ' &#9650;' : ' &#9660;';
    }

    function ratingDisplay(val) {
        if (val == null || isNaN(val) || val < 1 || val > 9) return 'N/A';
        return val;
    }

    // Determine which sliders are active for column highlighting
    const activeSliderKeys = Object.entries(sliderValues)
        .filter(([k, v]) => v > 0 && k !== 'sufficiency')
        .map(([k]) => k);

    // Category color: red for critical, orange for emergent, green for satisfactory
    const catColor = category === 'critical' ? '#ef4444' :
                     category === 'emergent' ? '#F97316' : '#10B981';

    // Helper: wrap rating value in highlighted color if its slider is active
    function highlightRating(key, val) {
        const display = ratingDisplay(val);
        if (activeSliderKeys.includes(key)) {
            return `<span style="color: ${catColor}; font-weight: 700;">${display}</span>`;
        }
        return display;
    }

    // Build table rows
    let tableRows = '';
    rows.forEach((r, i) => {
        const titleCaseName = (r.name || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
        const mapsLink = `https://www.google.com/maps?q=${r.lat},${r.lng}`;
        const nhsDisplay = r.nhs === 1 || r.nhs === '1' || (typeof r.nhs === 'string' && r.nhs.toLowerCase() === 'yes') ? 'Yes' : r.nhs === 0 || r.nhs === '0' || (typeof r.nhs === 'string' && r.nhs.toLowerCase() === 'no') ? 'No' : r.nhs || 'N/A';
        const adtDisplay = r.adt != null ? Number(r.adt).toLocaleString() : 'N/A';
        const adtYearDisplay = r.adtYear || 'N/A';
        const ageDisplay = r.age != null ? r.age : 'N/A';

        tableRows += `<tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
            <td style="padding: 6px 8px; text-align: center;">${i + 1}</td>
            <td style="padding: 6px 8px;">${r.district}</td>
            <td style="padding: 6px 8px;"><a href="${r.barsLink}" target="_blank" style="color: #60A5FA; text-decoration: underline;">${r.bars}</a></td>
            <td class="col-name" style="padding: 6px 8px;"><a href="${mapsLink}" target="_blank" style="color: #60A5FA; text-decoration: underline;">${titleCaseName}</a></td>
            <td style="padding: 6px 8px; text-align: center;">${highlightRating('deck', r.deck)}</td>
            <td style="padding: 6px 8px; text-align: center;">${highlightRating('superstructure', r.superstructure)}</td>
            <td style="padding: 6px 8px; text-align: center;">${highlightRating('substructure', r.substructure)}</td>
            <td style="padding: 6px 8px; text-align: center;">${highlightRating('bearings', r.bearings)}</td>
            <td style="padding: 6px 8px; text-align: center;">${highlightRating('joints', r.joints)}</td>
            <td style="padding: 6px 8px; text-align: center;">${r.sufficiencyDisplay}</td>
            <td style="padding: 6px 8px; text-align: center;">${nhsDisplay}</td>
            <td style="padding: 6px 8px; text-align: right;">${adtDisplay}</td>
            <td style="padding: 6px 8px; text-align: center;">${adtYearDisplay}</td>
            <td style="padding: 6px 8px; text-align: center;">${ageDisplay}</td>
        </tr>`;
    });

    // Remove any existing popup
    const existing = document.getElementById('category-table-popup');
    if (existing) existing.remove();

    // Build plain-text for email body
    const emailLines = rows.map((r, i) => {
        const n = (r.name || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
        const nhsText = r.nhs === 1 || r.nhs === '1' || (typeof r.nhs === 'string' && r.nhs.toLowerCase() === 'yes') ? 'Yes' : 'No';
        return `${i + 1}. D${r.district} | ${r.bars} | ${n} | Deck:${ratingDisplay(r.deck)} Super:${ratingDisplay(r.superstructure)} Sub:${ratingDisplay(r.substructure)} | Suff:${r.sufficiencyDisplay} | NHS:${nhsText}`;
    });
    const emailSubject = encodeURIComponent(`SpanBase ${label}`);
    const emailBody = encodeURIComponent(`${label}\n\n` + emailLines.join('\n'));
    const mailtoHref = `mailto:?subject=${emailSubject}&body=${emailBody}`;

    const csvLabel = label.replace(/[^a-zA-Z0-9]+/g, '_').replace(/_+$/, '');
    const thStyle = 'padding: 8px; cursor: pointer; user-select: none;';

    // Highlight active slider column headers
    function thHighlight(key) {
        return activeSliderKeys.includes(key) ? ' color: ' + catColor + '; font-weight: 700;' : '';
    }

    // Build category nav buttons (only categories not currently in view; grey out if 0 count)
    const maintCatNav = [
        { key: 'critical', label: 'Critical', color: '#dc2626', countId: 'count-critical' },
        { key: 'emergent', label: 'Emergent', color: '#F97316', countId: 'count-emergent' },
        { key: 'satisfactory', label: 'Satisfactory', color: '#10B981', countId: 'count-satisfactory' }
    ];
    const navBtnStyle = 'padding: 3px 10px; border-radius: 3px; font-size: 8pt; font-weight: 600; border: none;';
    const navButtons = maintCatNav
        .map(c => {
            const isCurrent = c.key === category;
            const countEl = document.getElementById(c.countId);
            const count = countEl ? parseInt(countEl.textContent, 10) : 0;
            const empty = isNaN(count) || count === 0;
            if (isCurrent || empty) {
                return `<button disabled style="${navBtnStyle} background: rgba(255,255,255,0.15); color: rgba(255,255,255,0.3); cursor: default;">${c.label}</button>`;
            }
            return `<button onclick="showMaintenanceCategoryTable('${c.key}')" style="${navBtnStyle} background: ${c.color}; color: #fff; cursor: pointer;">${c.label}</button>`;
        })
        .join('');

    const popup = document.createElement('div');
    popup.id = 'category-table-popup';
    popup.className = 'info-panel';
    popup.style.cssText = 'max-width: 95vw; resize: none; cursor: default;';
    popup.innerHTML = `
        <div class="info-header" id="category-table-header" style="cursor: default;">
            <h3>${label}</h3>
            <div style="display: flex; align-items: center; gap: 8px;">
                ${navButtons}
                <a href="${mailtoHref}" title="Share via email"
                   style="background: rgba(255,184,28,0.2); border: 1px solid var(--wvdoh-yellow); color: var(--wvdoh-yellow); padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 9pt; font-weight: 600; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">&#9993; Email</a>
                <button onclick="exportMaintenanceCategoryCSV(window._maintTableRows, '${csvLabel}')"
                        style="background: rgba(255,184,28,0.2); border: 1px solid var(--wvdoh-yellow); color: var(--wvdoh-yellow); padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 9pt; font-weight: 600;">Export CSV</button>
                <button class="close-btn" onclick="document.getElementById('category-table-popup').remove()">&#215;</button>
            </div>
        </div>
        <div class="info-content" style="cursor: default;">
            <div style="font-size: 8pt; color: rgba(255,255,255,0.45); font-style: italic; margin-bottom: 6px;">Sorted by district. Click any column header to re-sort. Export reflects current sort order.</div>
            <table style="border-collapse: collapse; font-size: 10pt; color: #fff; cursor: text;">
                <colgroup>
                    <col style="width: 35px;">
                    <col style="width: 55px;">
                    <col style="width: 85px;">
                    <col>
                    <col style="width: 45px;">
                    <col style="width: 50px;">
                    <col style="width: 40px;">
                    <col style="width: 65px;">
                    <col style="width: 50px;">
                    <col style="width: 70px;">
                    <col style="width: 40px;">
                    <col style="width: 60px;">
                    <col style="width: 65px;">
                    <col style="width: 40px;">
                </colgroup>
                <thead>
                    <tr style="background: rgba(0, 40, 85, 0.3); border-bottom: 2px solid #FFB81C;">
                        <th style="${thStyle} text-align: center; cursor: default;">#</th>
                        <th style="${thStyle} text-align: left;" onclick="sortMaintenanceCategoryTable('district')">District${arrow('district')}</th>
                        <th style="${thStyle} text-align: left;" onclick="sortMaintenanceCategoryTable('bars')">BARS${arrow('bars')}</th>
                        <th class="col-name" style="${thStyle} text-align: left;" onclick="sortMaintenanceCategoryTable('name')">Bridge Name${arrow('name')}</th>
                        <th style="${thStyle} text-align: center;${thHighlight('deck')}" onclick="sortMaintenanceCategoryTable('deck')">Deck${arrow('deck')}</th>
                        <th style="${thStyle} text-align: center;${thHighlight('superstructure')}" onclick="sortMaintenanceCategoryTable('superstructure')">Super${arrow('superstructure')}</th>
                        <th style="${thStyle} text-align: center;${thHighlight('substructure')}" onclick="sortMaintenanceCategoryTable('substructure')">Sub${arrow('substructure')}</th>
                        <th style="${thStyle} text-align: center;${thHighlight('bearings')}" onclick="sortMaintenanceCategoryTable('bearings')">Bearings${arrow('bearings')}</th>
                        <th style="${thStyle} text-align: center;${thHighlight('joints')}" onclick="sortMaintenanceCategoryTable('joints')">Joints${arrow('joints')}</th>
                        <th style="${thStyle} text-align: center;" onclick="sortMaintenanceCategoryTable('sufficiency')">Calc. Suff.${arrow('sufficiency')}</th>
                        <th style="${thStyle} text-align: center;" onclick="sortMaintenanceCategoryTable('nhs')">NHS${arrow('nhs')}</th>
                        <th style="${thStyle} text-align: right;" onclick="sortMaintenanceCategoryTable('adt')">ADT${arrow('adt')}</th>
                        <th style="${thStyle} text-align: center;" onclick="sortMaintenanceCategoryTable('adtYear')">ADT Year${arrow('adtYear')}</th>
                        <th style="${thStyle} text-align: center;" onclick="sortMaintenanceCategoryTable('age')">Age${arrow('age')}</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
        </div>
    `;

    document.body.appendChild(popup);
    makeDraggable(popup, document.getElementById('category-table-header'));
}

// Sort the maintenance category table by a column and rebuild
function sortMaintenanceCategoryTable(col) {
    const rows = window._maintTableRows;
    if (!rows) return;

    if (window._maintTableSortCol === col) {
        window._maintTableSortAsc = !window._maintTableSortAsc;
    } else {
        window._maintTableSortCol = col;
        window._maintTableSortAsc = true;
    }

    const asc = window._maintTableSortAsc;
    rows.sort((a, b) => {
        let va = a[col], vb = b[col];
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        if (typeof va === 'string') {
            va = va.toLowerCase(); vb = (vb || '').toLowerCase();
            if (va < vb) return asc ? -1 : 1;
            if (va > vb) return asc ? 1 : -1;
            return 0;
        }
        return asc ? va - vb : vb - va;
    });

    _buildMaintenanceCategoryTablePopup(rows, window._maintTableCategory);
}

// Export maintenance CR category table data as CSV
function exportMaintenanceCategoryCSV(rows, label) {
    if (!rows || rows.length === 0) return;

    const headers = '#,District,BARS,Bridge Name,Deck,Super,Sub,Bearings,Joints,Calc Suff,NHS,ADT,ADT Year,Age';
    const csvRows = rows.map((r, i) => {
        const titleCaseName = (r.name || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
        const nhsText = r.nhs === 1 || r.nhs === '1' || (typeof r.nhs === 'string' && r.nhs.toLowerCase() === 'yes') ? 'Yes' : 'No';
        const deckVal = (r.deck != null && !isNaN(r.deck) && r.deck >= 1 && r.deck <= 9) ? r.deck : '';
        const superVal = (r.superstructure != null && !isNaN(r.superstructure) && r.superstructure >= 1 && r.superstructure <= 9) ? r.superstructure : '';
        const subVal = (r.substructure != null && !isNaN(r.substructure) && r.substructure >= 1 && r.substructure <= 9) ? r.substructure : '';
        const bearVal = (r.bearings != null && !isNaN(r.bearings) && r.bearings >= 1 && r.bearings <= 9) ? r.bearings : '';
        const jointVal = (r.joints != null && !isNaN(r.joints) && r.joints >= 1 && r.joints <= 9) ? r.joints : '';
        const suffVal = r.sufficiency >= 0 ? r.sufficiencyDisplay : '';
        const adtVal = r.adt != null ? r.adt : '';
        const adtYearVal = r.adtYear || '';
        const ageVal = r.age != null ? r.age : '';
        return `${i + 1},${r.district},"${r.bars}","${titleCaseName}",${deckVal},${superVal},${subVal},${bearVal},${jointVal},${suffVal},${nhsText},${adtVal},${adtYearVal},${ageVal}`;
    });

    const csv = headers + '\n' + csvRows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);

    const today = new Date();
    const dateStr = today.getFullYear() + '-' +
        String(today.getMonth() + 1).padStart(2, '0') + '-' +
        String(today.getDate()).padStart(2, '0');

    const a = document.createElement('a');
    a.href = url;
    a.download = `SpanBase_Maintenance_${label}_${dateStr}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Check if condition sliders are active
function hasConditionSlidersActive() {
    // If in inspection mode, always return true
    if (inspectionFiltersActive) return true;
    
    if (!evaluationActive) return false;
    
    // Check if any slider is moved (including sufficiency)
    return (sliderValues.deck > 0 ||
            sliderValues.superstructure > 0 ||
            sliderValues.substructure > 0 ||
            sliderValues.bearings > 0 ||
            sliderValues.joints > 0 ||
            sliderValues.sufficiency < 100);
}

// Update count report display
function updateCountReport() {
    const hasCondition = hasConditionSlidersActive();
    const hasAttributes = typeof attributesFilterState !== 'undefined' && attributesFilterState.active;

    // Determine which button set we need
    const needFull = hasCondition || inspectionFiltersActive || hasAttributes || currentSearchQuery.length > 0;
    const targetMode = needFull ? 'full' : 'default';

    // Build/rebuild buttons if mode changed
    buildCountReportButtons(targetMode);

    // Calculate max counts (from ALL bridges)
    maxCounts = calculateMaxBridgeCounts();

    // Update counts — guard elements that may not exist in default mode
    const elCritical = document.getElementById('count-critical');
    const elEmergent = document.getElementById('count-emergent');
    const elSatisfactory = document.getElementById('count-satisfactory');
    const elCompleted = document.getElementById('count-completed');
    if (elCritical) elCritical.textContent = maxCounts.critical;
    if (elEmergent) elEmergent.textContent = maxCounts.emergent;
    if (elSatisfactory) elSatisfactory.textContent = maxCounts.satisfactory;
    if (elCompleted) elCompleted.textContent = maxCounts.completed;
    document.getElementById('count-na').textContent = maxCounts.na;
    document.getElementById('count-hubdata').textContent = maxCounts.hubdata;
    document.getElementById('count-total').textContent = maxCounts.total;

    const btnCritical = document.getElementById('btn-critical');
    const btnEmergent = document.getElementById('btn-emergent');
    const btnSatisfactory = document.getElementById('btn-satisfactory');
    const btnCompleted = document.getElementById('btn-completed');
    const btnNA = document.getElementById('btn-na');
    const btnHubdata = document.getElementById('btn-hubdata');

    // Condition buttons — only exist in 'full' mode
    if (btnCritical) {
        if (maxCounts.critical > 0) {
            btnCritical.disabled = false;
            btnCritical.style.cursor = 'pointer';
            btnCritical.title = inspectionFiltersActive ? 'Click to isolate Past Due bridges' : 'Click to isolate Critical bridges';
            btnCritical.style.opacity = countCategoryState.critical ? '1.0' : '0.5';
        } else {
            btnCritical.style.opacity = '0.3';
            btnCritical.style.cursor = 'not-allowed';
            btnCritical.disabled = true;
        }
    }
    if (btnEmergent) {
        if (maxCounts.emergent > 0) {
            btnEmergent.disabled = false;
            btnEmergent.style.cursor = 'pointer';
            btnEmergent.title = inspectionFiltersActive ? 'Click to isolate Upcoming bridges' : 'Click to isolate Emergent bridges';
            btnEmergent.style.opacity = countCategoryState.emergent ? '1.0' : '0.5';
        } else {
            btnEmergent.style.opacity = '0.3';
            btnEmergent.style.cursor = 'not-allowed';
            btnEmergent.disabled = true;
        }
    }
    if (btnCompleted) {
        if (maxCounts.completed > 0) {
            btnCompleted.disabled = false;
            btnCompleted.style.cursor = 'pointer';
            btnCompleted.title = 'Click to isolate Completed bridges';
            btnCompleted.style.opacity = countCategoryState.completed ? '1.0' : '0.5';
        } else {
            btnCompleted.style.opacity = '0.3';
            btnCompleted.style.cursor = 'not-allowed';
            btnCompleted.disabled = true;
        }
    }
    if (btnSatisfactory) {
        if (maxCounts.satisfactory > 0) {
            btnSatisfactory.disabled = false;
            btnSatisfactory.style.cursor = 'pointer';
            btnSatisfactory.title = inspectionFiltersActive ? 'Click to isolate Completed bridges' : 'Click to isolate Satisfactory bridges';
            btnSatisfactory.style.opacity = countCategoryState.satisfactory ? '1.0' : '0.5';
        } else {
            btnSatisfactory.style.opacity = '0.3';
            btnSatisfactory.style.cursor = 'not-allowed';
            btnSatisfactory.disabled = true;
        }
    }

    // N/A button — always present
    if (btnNA) {
        if (maxCounts.na > 0) {
            btnNA.disabled = false;
            btnNA.style.cursor = 'pointer';
            btnNA.title = 'Click to isolate N/A bridges';
            btnNA.style.opacity = countCategoryState.na ? '1.0' : '0.5';
        } else {
            btnNA.style.opacity = '0.3';
            btnNA.style.cursor = 'not-allowed';
            btnNA.disabled = true;
        }
    }

    // HUB Data button — always present
    if (btnHubdata) {
        if (maxCounts.hubdata > 0) {
            btnHubdata.disabled = false;
            btnHubdata.style.cursor = 'pointer';
            btnHubdata.title = 'Click to isolate HUB Data bridges';
            btnHubdata.style.opacity = countCategoryState.hubdata ? '1.0' : '0.5';
        } else {
            btnHubdata.style.opacity = '0.3';
            btnHubdata.style.cursor = 'not-allowed';
            btnHubdata.disabled = true;
        }
    }

    // Total button always available
    const btnTotal = document.getElementById('btn-total');
    if (btnTotal) {
        btnTotal.disabled = false;
        btnTotal.style.cursor = 'pointer';
        btnTotal.title = 'Show all bridges (except N/A)';
        btnTotal.style.opacity = '1';
    }

    // Update button border styles
    updateButtonStyles();

    // Show box only when a filter is actually active (sliders moved, not just evaluation mode)
    const countReport = document.getElementById('countReport');
    const filtersEngaged = hasCondition || inspectionFiltersActive || hasAttributes || currentSearchQuery.length > 0;
    if (filtersEngaged && maxCounts.total > 0 && countReport.style.display !== 'block') {
        countReport.style.display = 'block';
        const header = document.getElementById('countReportHeader');
        if (header && !countReport.dataset.draggable) {
            makeDraggable(countReport, header);
            countReport.dataset.draggable = 'true';
        }
        positionCountReportOutsideBridges();
    } else if (!filtersEngaged && countReport.style.display === 'block') {
        closeCountReport();
    }
}

// Position count report outside visible bridge bounding box
function positionCountReportOutsideBridges() {
    const countReport = document.getElementById('countReport');
    if (!countReport) return;

    // Align CR bottom with Districts box bottom, 10px gap to its left
    const legend = document.querySelector('.legend');
    if (!legend) return;

    const legendRect = legend.getBoundingClientRect();
    const mapRect = map.getContainer().getBoundingClientRect();

    // CR is position:absolute inside the map container
    // Bottom-align: CR bottom = legend bottom (relative to map container)
    const legendBottom = legendRect.bottom - mapRect.top;
    const crWidth = 240;
    const crHeight = countReport.offsetHeight || 320;
    const top = legendBottom - crHeight;
    const left = legendRect.left - mapRect.left - crWidth - 10; // 10px gap

    countReport.style.top = Math.max(10, top) + 'px';
    countReport.style.left = Math.max(10, left) + 'px';
    countReport.style.transform = 'none';
}

// Update button visual states
function updateButtonStyles() {
    const buttons = [
        { id: 'btn-critical',     key: 'critical',     color: '#dc2626' },
        { id: 'btn-emergent',     key: 'emergent',     color: '#F97316' },
        { id: 'btn-completed',    key: 'completed',    color: '#10B981' },
        { id: 'btn-satisfactory', key: 'satisfactory', color: '#10b981' },
        { id: 'btn-na',           key: 'na',           color: '#6b7280' },
        { id: 'btn-hubdata',      key: 'hubdata',      color: '#22c55e' }
    ];

    buttons.forEach(({ id, key, color }) => {
        const btn = document.getElementById(id);
        if (btn && !btn.disabled) {
            btn.style.borderColor = countCategoryState[key] ? color : 'rgba(255,255,255,0.2)';
            btn.style.borderWidth = countCategoryState[key] ? '2px' : '1px';
        }
    });

    const btnTotal = document.getElementById('btn-total');
    if (btnTotal) {
        btnTotal.style.background = countCategoryState.total ? 'rgba(255,184,28,0.1)' : 'transparent';
    }
}

// Toggle category visibility
window.toggleCountCategory = function(category) {
    // Close the category detail table popup if open
    const catPopup = document.getElementById('category-table-popup');
    if (catPopup) catPopup.remove();

    const hasCondition = hasConditionSlidersActive();
    // HUB Data, N/A, and Total buttons always accessible; condition buttons require sliders
    if (category !== 'hubdata' && category !== 'na' && category !== 'total') {
        if (!hasCondition && !evaluationActive && !(typeof attributesFilterState !== 'undefined' && attributesFilterState.active)) return;
    }

    if (category === 'total') {
        // Total: Show all except N/A and hubdata
        countCategoryState.critical = true;
        countCategoryState.emergent = true;
        countCategoryState.satisfactory = true;
        countCategoryState.completed = true;
        countCategoryState.na = false;
        countCategoryState.hubdata = false;
        countCategoryState.total = true;
    } else if (category === 'hubdata') {
        // HUB Data: special isolation mode
        if (categoryClickState.hubdata === 1 && countCategoryState.hubdata) {
            // Double-click: restore to show all
            countCategoryState.critical = true;
            countCategoryState.emergent = true;
            countCategoryState.satisfactory = true;
            countCategoryState.completed = true;
            countCategoryState.na = false;
            countCategoryState.hubdata = false;
            countCategoryState.total = true;
            categoryClickState.hubdata = 0;
        } else {
            // First click: isolate HUB data bridges
            countCategoryState.critical = false;
            countCategoryState.emergent = false;
            countCategoryState.satisfactory = false;
            countCategoryState.completed = false;
            countCategoryState.na = false;
            countCategoryState.hubdata = true;
            countCategoryState.total = false;
            Object.keys(categoryClickState).forEach(k => categoryClickState[k] = 0);
            categoryClickState.hubdata = 1;
        }
    } else {
        // Check for second consecutive click on same isolated category
        const otherCats = ['critical', 'emergent', 'satisfactory', 'completed', 'na']
            .filter(k => k !== category);
        if (categoryClickState[category] === 1 &&
            otherCats.every(k => !countCategoryState[k]) &&
            countCategoryState[category]) {
            // Second click detected - restore all
            countCategoryState.critical = true;
            countCategoryState.emergent = true;
            countCategoryState.satisfactory = true;
            countCategoryState.completed = true;
            countCategoryState.na = false;
            countCategoryState.hubdata = false;
            countCategoryState.total = true;
            categoryClickState[category] = 0;
        } else {
            // First click or switching categories - isolate this category
            countCategoryState.critical = false;
            countCategoryState.emergent = false;
            countCategoryState.satisfactory = false;
            countCategoryState.completed = false;
            countCategoryState.na = false;
            countCategoryState.hubdata = false;
            countCategoryState.total = false;
            countCategoryState[category] = true;

            // Track click for double-click detection
            Object.keys(categoryClickState).forEach(k => categoryClickState[k] = 0);
            categoryClickState[category] = 1;
        }
    }

    // Reapply filters
    updateBridgeSizes();
    applyCountCategoryFilter();
    updateButtonStyles();
    updateProjectRings();
    syncHubButton();

    // Auto-zoom
    setTimeout(autoZoomToFilteredBridges, 100);
};

// Sync Hub Button (projectToggle) state based on CRHUB isolation
function syncHubButton() {
    const btn = document.getElementById('projectToggle');
    if (!btn) return;
    if (countCategoryState.hubdata) {
        // CRHUB active — grey out the Hub Button
        btn.style.opacity = '0.3';
        btn.style.pointerEvents = 'none';
        btn.style.cursor = 'not-allowed';
    } else {
        // CRHUB inactive — restore Hub Button to current hubDataMode state
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
        btn.style.cursor = 'pointer';
    }
}

// Apply category filter
function applyCountCategoryFilter() {
    // HUB Data isolation — works independently of condition sliders
    if (countCategoryState.hubdata) {
        const baseSize = getPointSize();
        Object.entries(bridgeLayers).forEach(([bars, marker]) => {
            const bridge = marker.bridgeData;
            if (!bridge) return;

            // Respect district filter
            if (!activeDistricts[bridge.district]) {
                if (marker._map) marker.remove();
                return;
            }

            // Respect search filter
            if (currentSearchQuery.length > 0) {
                const barsUpper = (bridge.bars_number || '').toUpperCase();
                const name = (bridge.bridge_name || '').toUpperCase();
                const isNumericSearch = /^\d/.test(currentSearchQuery);
                const matchesBars = isNumericSearch ? barsUpper.startsWith(currentSearchQuery) : barsUpper.includes(currentSearchQuery);
                const matchesName = isNumericSearch ? name.startsWith(currentSearchQuery) : name.includes(currentSearchQuery);
                if (!matchesBars && !matchesName) {
                    if (marker._map) marker.remove();
                    return;
                }
            }

            // Respect attributes filter
            if (typeof attributesFilterState !== 'undefined' && attributesFilterState.active) {
                if (!bridgePassesAttributesFilter(bridge)) {
                    if (marker._map) marker.remove();
                    return;
                }
            }

            // Only show bridges with project data, in solid green
            if (projectsData[bars]) {
                marker.setRadius(baseSize);
                marker.setStyle({
                    fillColor: '#22c55e',
                    fillOpacity: 1,
                    opacity: 1
                });
                if (!marker._map) marker.addTo(map);
            } else {
                if (marker._map) marker.remove();
            }
        });
        return;
    }

    // HUB Data theme mode — show only HUB bridges as green dots
    if (hubDataMode === 2) {
        const baseSize = getPointSize();
        Object.entries(bridgeLayers).forEach(([bars, marker]) => {
            const bridge = marker.bridgeData;
            if (!bridge) return;

            if (!activeDistricts[bridge.district]) {
                if (marker._map) marker.remove();
                return;
            }

            if (currentSearchQuery.length > 0) {
                const barsUpper = (bridge.bars_number || '').toUpperCase();
                const name = (bridge.bridge_name || '').toUpperCase();
                const isNumericSearch = /^\d/.test(currentSearchQuery);
                const matchesBars = isNumericSearch ? barsUpper.startsWith(currentSearchQuery) : barsUpper.includes(currentSearchQuery);
                const matchesName = isNumericSearch ? name.startsWith(currentSearchQuery) : name.includes(currentSearchQuery);
                if (!matchesBars && !matchesName) {
                    if (marker._map) marker.remove();
                    return;
                }
            }

            if (typeof attributesFilterState !== 'undefined' && attributesFilterState.active) {
                if (!bridgePassesAttributesFilter(bridge)) {
                    if (marker._map) marker.remove();
                    return;
                }
            }

            if (projectsData[bars]) {
                marker.setRadius(baseSize);
                marker.setStyle({
                    fillColor: '#22c55e',
                    fillOpacity: 1,
                    opacity: 1
                });
                if (!marker._map) marker.addTo(map);
            } else {
                if (marker._map) marker.remove();
            }
        });
        return;
    }

    const hasCondition = hasConditionSlidersActive();
    const hasAttributes = typeof attributesFilterState !== 'undefined' && attributesFilterState.active;

    // Check if a specific category is isolated via CR (NA or condition category)
    const hasIsolation = countCategoryState.na ||
        (!countCategoryState.critical || !countCategoryState.emergent || !countCategoryState.satisfactory || !countCategoryState.completed);

    // Apply category filtering when condition sliders active, in maintenance mode, attributes filter, or CR isolation
    if (!hasCondition && !evaluationActive && !hasAttributes && !hasIsolation) return;

    // Check if showing all (total state or all categories on except N/A)
    const showingAll = countCategoryState.total ||
                       (countCategoryState.critical && countCategoryState.emergent &&
                        countCategoryState.completed && countCategoryState.satisfactory && !countCategoryState.na);

    if (showingAll) return;

    const toShow = [];

    Object.values(bridgeLayers).forEach(marker => {
        const bridge = marker.bridgeData;

        // Skip if no bridge data (e.g., district markers)
        if (!bridge) return;

        // Respect search filter — don't re-add bridges that search has hidden
        if (currentSearchQuery.length > 0) {
            const bars = (bridge.bars_number || '').toUpperCase();
            const name = (bridge.bridge_name || '').toUpperCase();
            const isNumericSearch = /^\d/.test(currentSearchQuery);
            const matchesBars = isNumericSearch ? bars.startsWith(currentSearchQuery) : bars.includes(currentSearchQuery);
            const matchesName = isNumericSearch ? name.startsWith(currentSearchQuery) : name.includes(currentSearchQuery);
            if (!matchesBars && !matchesName) {
                if (marker._map) marker.remove();
                return;
            }
        }

        // Respect attributes filter — don't re-add bridges that were filtered out
        if (typeof attributesFilterState !== 'undefined' && attributesFilterState.active) {
            if (!bridgePassesAttributesFilter(bridge)) {
                if (marker._map) marker.remove();
                return;
            }
        }

        // Respect district filter
        if (!activeDistricts[bridge.district]) {
            if (marker._map) marker.remove();
            return;
        }

        const category = getBridgeCategory(bridge);

        let shouldShow = false;

        if (category === 'critical' && countCategoryState.critical) shouldShow = true;
        if (category === 'emergent' && countCategoryState.emergent) shouldShow = true;
        if (category === 'completed' && countCategoryState.completed) shouldShow = true;
        if (category === 'satisfactory' && countCategoryState.satisfactory) shouldShow = true;
        if (category === 'na' && countCategoryState.na) shouldShow = true;

        if (shouldShow) {
            const color = inspectionFiltersActive ? getInspectionColor(bridge) : getBridgeColor(bridge);
            // Don't re-show grey bridges (filtered out by sufficiency or missing ratings)
            if (!inspectionFiltersActive && color.toLowerCase() === '#6b7280' && !countCategoryState.na) {
                if (marker._map) marker.remove();
                return;
            }
            let zPriority;
            if (inspectionFiltersActive) {
                // Inspection: green(completed)=0, orange(upcoming)=1, red(past-due)=2
                zPriority = 0;
                if (color.startsWith('hsl(0')) zPriority = 2;
                else if (color.startsWith('hsl(')) zPriority = 1;
            } else {
                // Maintenance: best rating first, worst last
                const ratings = [bridge.deck_rating, bridge.superstructure_rating,
                    bridge.substructure_rating, bridge.bearings_rating, bridge.joints_rating]
                    .filter(r => typeof r === 'number' && !isNaN(r) && r >= 1 && r <= 9);
                zPriority = ratings.length > 0 ? Math.min(...ratings) : 10;
                zPriority = 10 - zPriority; // invert so worst = highest priority
            }
            toShow.push({ marker, bridge, color, zPriority });
        } else {
            if (marker._map) marker.remove();
        }
    });

    // Sort: lowest priority first, highest last (worst drawn on top)
    toShow.sort((a, b) => a.zPriority - b.zPriority);

    toShow.forEach(({ marker, bridge, color }) => {
        const size = evaluationActive ? getEvaluationSize(bridge, getPointSize()) : getPointSize();
        marker.setRadius(size);
        marker.setStyle({
            fillOpacity: 1,
            fillColor: color,
            opacity: 1
        });
        if (!marker._map) marker.addTo(map);
        marker.bringToFront();
    });
}

// Close count report
window.closeCountReport = function() {
    document.getElementById('countReport').style.display = 'none';
    crButtonMode = null; // force rebuild on next open
    crButtonInspection = null;
};

// ========================================
// PROJECT RINGS
// ========================================

function positionProjectToggle() {
    const legend = document.querySelector('.legend');
    const btn = document.getElementById('projectToggle');
    if (!legend || !btn) return;

    const legendRect = legend.getBoundingClientRect();
    const mapRect = document.getElementById('map').getBoundingClientRect();

    // Match width to legend
    btn.style.width = legendRect.width + 'px';
    // Position 10px above the legend, aligned right
    btn.style.bottom = (mapRect.bottom - legendRect.top + 10) + 'px';
    // Show button now that it's positioned
    btn.style.display = 'block';
}

function createProjectRings() {
    if (!projectsData || Object.keys(projectsData).length === 0) return;
    positionProjectToggle();

    const ringSize = getPointSize() + 4;

    Object.entries(bridgeLayers).forEach(([bars, marker]) => {
        if (!projectsData[bars]) return;

        const latlng = marker.getLatLng();
        const ring = L.circleMarker(latlng, {
            radius: ringSize,
            fillColor: 'transparent',
            fillOpacity: 0,
            color: '#22c55e',
            weight: 3,
            opacity: 0.9,
            interactive: false
        });

        // Store reference but don't add to map yet (starts OFF)
        ring.bridgeBars = bars;
        projectRingLayers[bars] = ring;
    });

    console.log(`✓ Created ${Object.keys(projectRingLayers).length} project rings`);
}

function updateProjectRings() {
    if (!projectRingsVisible) return;

    // Hide rings when HUB Data is isolated in CR (avoid green-on-green overlap)
    if (countCategoryState.hubdata) {
        Object.values(projectRingLayers).forEach(ring => {
            if (ring._map) ring.remove();
        });
        return;
    }

    const baseRingSize = getPointSize() + 4;
    Object.entries(projectRingLayers).forEach(([bars, ring]) => {
        // Match ring size to actual marker radius (handles evaluation-enlarged points)
        const bridgeMarker = bridgeLayers[bars];
        const markerRadius = bridgeMarker ? bridgeMarker.getRadius() : 0;
        ring.setRadius(Math.max(baseRingSize, markerRadius + 4));

        // Only show ring if the bridge marker is on the map
        if (bridgeMarker && bridgeMarker._map) {
            if (!ring._map) {
                ring.addTo(map);
                addPulseClass(ring);
            }
        } else {
            if (ring._map) ring.remove();
        }
    });
}

function addPulseClass(ring) {
    // Leaflet renders CircleMarkers as SVG — add CSS class to the path element
    const el = ring.getElement ? ring.getElement() : ring._path;
    if (el) {
        el.classList.add('project-ring');
    } else {
        // Element might not exist yet if not rendered, retry after a frame
        requestAnimationFrame(() => {
            const el2 = ring.getElement ? ring.getElement() : ring._path;
            if (el2) el2.classList.add('project-ring');
        });
    }
}

window.toggleProjectRings = function() {
    // Three-state cycle: 0 (off/blue) → 1 (on/yellow) → 2 (theme/green) → 0
    const prevMode = hubDataMode;
    hubDataMode = (hubDataMode + 1) % 3;
    projectRingsVisible = hubDataMode === 1;

    const btn = document.getElementById('projectToggle');
    btn.classList.remove('active', 'theme');

    if (hubDataMode === 0) {
        // Off: remove rings, restore normal bridge rendering
        Object.values(projectRingLayers).forEach(ring => {
            if (ring._map) ring.remove();
        });
        if (prevMode === 2) {
            updateBridgeSizes();
            applyCountCategoryFilter();
        }
    } else if (hubDataMode === 1) {
        // On: show rings + HUB Data radial menu option
        btn.classList.add('active');
        updateProjectRings();
    } else {
        // Theme: green HUB dots only, no rings
        btn.classList.add('theme');
        Object.values(projectRingLayers).forEach(ring => {
            if (ring._map) ring.remove();
        });
        updateBridgeSizes();
        applyCountCategoryFilter();
    }
};

// ========================================
// GUIDED TOUR
// ========================================

let tourActive = false;
let tourStep = 0;
let tourPreState = null; // saved UI state before tour

const tourSteps = [
    // Step 1: Welcome — dead center of screen
    {
        target: null,
        title: 'Welcome to SpanBase',
        text: 'SpanBase is a bridge management tool for WV\'s Operations Division. Use the search bar to find bridges by name, BARS number, route, or district. Let\'s walk through the key features.',
        position: 'bottom',
        onEnter: null,
        onExit: null
    },
    // Step 2: District Legend — tooltip to the left of the legend box
    {
        target: '.legend',
        title: 'District Legend',
        text: 'Each district has its own color. Click any district name to toggle its bridges on or off. Use the "All Off" button to hide everything, then selectively enable districts you want to focus on.',
        position: 'left',
        onEnter: null,
        onExit: null
    },
    // Step 3: Condition Filter — tooltip to the right of the tab
    {
        target: '#evaluationPanel .folder-tab',
        title: 'Condition Filter',
        text: 'This panel has two modes:\n\n\u2022 Maintenance \u2014 Sliders for Deck, Superstructure, Substructure, Bearings, and Joints. Drag a slider higher to highlight bridges with worse ratings for that component.\n\n\u2022 Inspection \u2014 Filter by inspection type and due month.\n\nAt the bottom is Calc. Sufficiency \u2014 an overall bridge health score from 0 (worst) to 100 (best). The \u2264/\u2265 Mode button toggles the direction: \u2264 shows bridges at or below your threshold (finding the worst bridges), and \u2265 shows bridges at or above it.',
        position: 'right',
        onEnter: function() {
            const condPanel = document.getElementById('evaluationPanel');
            const attrPanel = document.getElementById('attributesPanel');
            condPanel.classList.add('open');
            condPanel.classList.remove('behind');
            attrPanel.classList.add('open');
            attrPanel.classList.remove('ontop');
        },
        onExit: null
    },
    // Step 4: Attributes Filter
    {
        target: '#attributesPanel .folder-tab',
        title: 'Attributes Filter',
        text: 'Filter bridges by physical attributes:\n\n\u2022 Route / Subroute search\n\u2022 Dimension sliders (ADT, Age, Length, Width, Area)\n\u2022 NHS designation\n\u2022 On/Under bridge type checkboxes\n\nEach slider has a \u2264/\u2265 mode toggle for flexible filtering.',
        position: 'right',
        onEnter: function() {
            const condPanel = document.getElementById('evaluationPanel');
            const attrPanel = document.getElementById('attributesPanel');
            attrPanel.classList.add('open', 'ontop');
            condPanel.classList.add('open', 'behind');
        },
        onExit: null
    },
    // Step 5: Radial Menu explanation + teaser for next step
    {
        target: null,
        title: 'Radial Menu',
        text: 'Clicking a bridge dot opens a radial menu with up to 6 options:\n\n\u2022 Inspection \u2014 Inspection history and schedules\n\u2022 Narrative \u2014 Inspector notes and observations\n\u2022 Condition \u2014 Component condition ratings\n\u2022 Geometry \u2014 Bridge dimensions and specifications\n\u2022 Attributes \u2014 Route, classification, and features\n\u2022 HUB Data \u2014 Project data (when HUB Data is enabled)\n\nThe title bar shows the bridge name, BARS number, and links to Google Maps and AssetWise.\n\nGet ready \u2014 you\'re about to try it out for yourself!',
        position: 'bottom',
        onEnter: function() {
            const condPanel = document.getElementById('evaluationPanel');
            const attrPanel = document.getElementById('attributesPanel');
            condPanel.classList.remove('open', 'behind');
            attrPanel.classList.remove('open', 'ontop');
        },
        onExit: null
    },
    // Step 6: Interactive map — raise map above overlay, disable panning/zoom
    {
        target: '#map',
        title: 'Try It \u2014 Click a Bridge!',
        text: 'We\'ve zoomed into the Charleston area. Go ahead and click any bridge dot to see the radial menu in action! When you\'re done exploring, click Next to continue.',
        tooltipFixed: { bottom: 20 },
        onEnter: function() {
            const condPanel = document.getElementById('evaluationPanel');
            const attrPanel = document.getElementById('attributesPanel');
            condPanel.classList.remove('open', 'behind');
            attrPanel.classList.remove('open', 'ontop');
            map.setView([38.35, -81.63], 13);
            // Raise map above overlay so bridge dots + radial menu are clickable
            document.getElementById('map').style.zIndex = '12000';
            // Disable map panning/zoom — only bridge clicks should work
            map.dragging.disable();
            map.scrollWheelZoom.disable();
            map.doubleClickZoom.disable();
            map.touchZoom.disable();
            map.boxZoom.disable();
            map.keyboard.disable();
        },
        onExit: function() {
            // Restore map z-index and re-enable interactions
            document.getElementById('map').style.zIndex = '';
            map.dragging.enable();
            map.scrollWheelZoom.enable();
            map.doubleClickZoom.enable();
            map.touchZoom.enable();
            map.boxZoom.enable();
            map.keyboard.enable();
            closeAllMenus();
            map.fitBounds(wvBounds, { padding: [100, 50], maxZoom: 8 });
        }
    },
    // Step 7: Box Select — open AF, highlight route search, Ctrl+drag demo
    {
        target: '#route-search-box',
        title: 'Box Select',
        text: 'We\'ve searched Route 79 for you. Notice some results aren\'t on I-79 — they\'re inside the red circle. 🤫\n\nYou can either exclude these points OR hide all the others. Hold Ctrl and drag a box around them, then click Exclude or Include. You can also pan and zoom the map.\n\nA Reset button appears at the bottom when a box filter is active.',
        position: 'right',
        tooltipFixed: { right: 20 },
        onEnter: function() {
            const condPanel = document.getElementById('evaluationPanel');
            const attrPanel = document.getElementById('attributesPanel');

            // Open Attributes panel
            attrPanel.classList.add('open', 'ontop');
            condPanel.classList.remove('open');
            condPanel.classList.remove('behind');

            // Reset any lingering evaluation state
            evaluationActive = false;
            currentMode = 'default';

            // Reset count category state
            countCategoryState.critical = true;
            countCategoryState.emergent = true;
            countCategoryState.satisfactory = true;
            countCategoryState.completed = true;
            countCategoryState.na = false;
            countCategoryState.hubdata = false;
            countCategoryState.total = false;
            Object.keys(categoryClickState).forEach(k => categoryClickState[k] = 0);

            // Clear any box selection from prior use
            boxExcludedBars.clear();
            const ind = document.getElementById('box-filter-indicator');
            if (ind) ind.remove();

            // Auto-fill route search with "79" and trigger
            const routeInput = document.getElementById('route-search');
            routeInput.value = '79';
            attributesFilterState.route = '79';
            applyAttributesFilter();
            updateBridgeSizes();
            setTimeout(function() { autoZoomToFilteredBridges(); }, 150);

            // Grey overlay inside the panel to dim everything except route search
            const panelBody = attrPanel.querySelector('.panel-body');
            const overlay = document.createElement('div');
            overlay.id = 'tour-panel-overlay';
            overlay.style.cssText = 'position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); z-index: 1; pointer-events: none; border-radius: 0 0 12px 0;';
            panelBody.style.position = 'relative';
            panelBody.appendChild(overlay);

            // Raise route search box above the panel overlay
            const routeBox = document.getElementById('route-search-box');
            routeBox.style.position = 'relative';
            routeBox.style.zIndex = '2';

            // Disable AF scrollbar
            panelBody.style.overflow = 'hidden';

            // Disable CF folder tab
            const condTab = condPanel.querySelector('.folder-tab');
            condTab.style.pointerEvents = 'none';
            condTab.style.opacity = '0.3';

            // Disable radial menus during this step
            window._tourDisableRadial = true;

            // Enable Ctrl+drag box select during tour
            window._tourBoxSelectEnabled = true;

            // Raise panel and map above tour overlay
            attrPanel.style.zIndex = '12000';
            document.getElementById('map').style.zIndex = '12000';

            // Hide the tour overlay and spotlight so map is fully uncovered
            const tourOverlay = document.getElementById('tour-overlay');
            if (tourOverlay) tourOverlay.style.display = 'none';
            const tourSpotlight = document.getElementById('tour-spotlight');
            if (tourSpotlight) tourSpotlight.style.display = 'none';

            // Enable full map interaction (but disable boxZoom so Ctrl+drag works for box select)
            map.dragging.enable();
            map.scrollWheelZoom.enable();
            map.doubleClickZoom.enable();
            map.touchZoom.enable();
            map.keyboard.enable();
            map.boxZoom.disable();

            // Draw one big red circle around the non-interstate outlier cluster
            // Bounding bridges: left=03a158, right=20a724, top=20a519, bottom=03a073
            setTimeout(function() {
                window._tourRedCircles = [];
                const boundaryBars = ['03A158', '20A724', '20A519', '03A073'];
                const boundaryLatLngs = [];
                boundaryBars.forEach(function(bars) {
                    const marker = bridgeLayers[bars];
                    if (marker) boundaryLatLngs.push(marker.getLatLng());
                });
                if (boundaryLatLngs.length > 0) {
                    const bounds = L.latLngBounds(boundaryLatLngs);
                    const center = bounds.getCenter();
                    const centerPx = map.latLngToContainerPoint(center);
                    // Find farthest boundary point in pixels, add 40px padding
                    let maxPxDist = 0;
                    boundaryLatLngs.forEach(function(ll) {
                        const px = map.latLngToContainerPoint(ll);
                        const d = centerPx.distanceTo(px);
                        if (d > maxPxDist) maxPxDist = d;
                    });
                    // Convert pixel radius + 40px padding back to meters
                    const edgePx = L.point(centerPx.x + maxPxDist + 40, centerPx.y);
                    const edgeLatLng = map.containerPointToLatLng(edgePx);
                    const radiusMeters = center.distanceTo(edgeLatLng);
                    const bigCircle = L.circle(center, {
                        radius: radiusMeters,
                        fillColor: 'transparent',
                        fillOpacity: 0,
                        color: '#ff0000',
                        weight: 3,
                        opacity: 0.8,
                        dashArray: '8, 6'
                    }).addTo(map);
                    window._tourRedCircles.push(bigCircle);
                }
            }, 300);
        },
        onExit: function() {
            // Clear route search
            const routeInput = document.getElementById('route-search');
            if (routeInput) { routeInput.value = ''; }
            attributesFilterState.route = '';
            applyAttributesFilter();

            // Clear box selection
            boxExcludedBars.clear();
            const bfInd = document.getElementById('box-filter-indicator');
            if (bfInd) bfInd.remove();

            // Remove red circles
            if (window._tourRedCircles) {
                window._tourRedCircles.forEach(function(c) { if (c._map) c.remove(); });
                delete window._tourRedCircles;
            }

            // Remove panel overlay
            const panelOverlay = document.getElementById('tour-panel-overlay');
            if (panelOverlay) panelOverlay.remove();

            // Reset route search box styling
            const routeBox = document.getElementById('route-search-box');
            routeBox.style.position = '';
            routeBox.style.zIndex = '';

            // Restore AF scrollbar
            const attrPanel = document.getElementById('attributesPanel');
            const panelBody = attrPanel.querySelector('.panel-body');
            panelBody.style.overflow = '';

            // Restore CF folder tab
            const condPanel = document.getElementById('evaluationPanel');
            const condTab = condPanel.querySelector('.folder-tab');
            condTab.style.pointerEvents = '';
            condTab.style.opacity = '';

            // Re-enable radial menus
            delete window._tourDisableRadial;

            // Disable tour box select
            delete window._tourBoxSelectEnabled;

            // Re-enable boxZoom
            map.boxZoom.enable();

            // Restore tour overlay and spotlight
            const tourOverlay = document.getElementById('tour-overlay');
            if (tourOverlay) tourOverlay.style.display = '';
            const tourSpotlight = document.getElementById('tour-spotlight');
            if (tourSpotlight) tourSpotlight.style.display = '';

            // Reset panel and map z-indexes
            attrPanel.style.zIndex = '';
            document.getElementById('map').style.zIndex = '';

            // Close panels
            condPanel.classList.remove('open', 'behind');
            attrPanel.classList.remove('open', 'ontop');

            updateBridgeSizes();
        }
    },
    // Step 8: HUB Data interactive — user cycles the button
    {
        target: '#projectToggle',
        title: 'HUB Data Button',
        text: 'This button cycles through three modes:\n\n\u2022 Blue (off) \u2014 Normal bridge view, no project data.\n\u2022 Yellow \u2014 Green rings appear around bridges with project data. All bridges stay visible so you can see current conditions AND financials side-by-side.\n\u2022 Green \u2014 Only HUB data bridges remain.\n\nGive it a click and watch it cycle!',
        position: 'left',
        onEnter: function() {
            const condPanel = document.getElementById('evaluationPanel');
            const attrPanel = document.getElementById('attributesPanel');
            condPanel.classList.remove('open', 'behind');
            attrPanel.classList.remove('open', 'ontop');
            positionProjectToggle();
            // Raise HUB button above overlay so it's clickable
            document.getElementById('projectToggle').style.zIndex = '12000';
        },
        onExit: function() {
            document.getElementById('projectToggle').style.zIndex = '';
            // Reset HUB mode back to off
            if (hubDataMode !== 0) {
                hubDataMode = 0;
                projectRingsVisible = false;
                const btn = document.getElementById('projectToggle');
                btn.classList.remove('active', 'theme');
                Object.values(projectRingLayers).forEach(ring => {
                    if (ring._map) ring.remove();
                });
                updateBridgeSizes();
            }
        }
    },
    // Step 9: Guided exercise — bad joints, good sufficiency
    {
        target: '#eval-sliders-wrapper',
        title: 'Try It \u2014 Bad Joints, Good Bridges',
        text: 'Let\'s find an interesting set of bridges: ones with bad joints but an otherwise good sufficiency rating.\n\nWe\'ve set the Joints slider to 80% and Calc. Sufficiency to 75% in \u2265 mode \u2014 meaning bridges scoring 75 or higher overall, but with joint problems.\n\nThe map now highlights these bridges. Check the Count Report that just appeared!',
        position: 'right',
        onEnter: function() {
            const condPanel = document.getElementById('evaluationPanel');
            const attrPanel = document.getElementById('attributesPanel');
            condPanel.classList.add('open');
            condPanel.classList.remove('behind');
            attrPanel.classList.add('open');
            attrPanel.classList.remove('ontop');
            // Ensure maintenance tab is visible (not inspection)
            var maint = document.getElementById('maintenanceSection');
            var insp = document.getElementById('inspectionSection');
            if (maint) maint.classList.add('active');
            if (insp) insp.classList.remove('active');
            // Set up the filter: Joints at 80%, Sufficiency at 75% in ≥ mode
            sliderValues.joints = 80;
            document.getElementById('slider-joints').value = 80;
            document.getElementById('value-joints').textContent = '80%';
            sliderValues.sufficiency = 75;
            document.getElementById('slider-sufficiency').value = 75;
            document.getElementById('value-sufficiency').textContent = '75%';
            sufficiencyMode = 'gte';
            const toggleBtn = document.getElementById('sufficiency-mode-toggle');
            if (toggleBtn) toggleBtn.textContent = '\u2265 Mode';
            evaluationActive = true;
            currentMode = 'evaluation';
            updateBridgeSizes();
        },
        onExit: null
    },
    // Step 10: Count Report — shows the exercise results, interactive
    {
        target: '#countReport',
        title: 'Count Report',
        text: 'The Count Report appeared automatically from our filter. It breaks down the results by condition category.\n\nClick \u2630 on any category to open its detail table. Once you\'ve opened a table, you can click the category buttons to isolate those bridges on the map. Click the same category twice to restore all.',
        position: 'left',
        onEnter: function() {
            // Keep filter active, just close the panel so CR is visible
            const condPanel = document.getElementById('evaluationPanel');
            const attrPanel = document.getElementById('attributesPanel');
            condPanel.classList.remove('open', 'behind');
            attrPanel.classList.remove('open', 'ontop');
            // Raise CR above overlay so user can interact with it
            const cr = document.getElementById('countReport');
            cr.style.zIndex = '12000';
            // Gate category buttons behind first ☰ click
            window._tourCRUnlocked = false;
            window._origToggleCountCategory = window.toggleCountCategory;
            window.toggleCountCategory = function(cat) {
                if (!window._tourCRUnlocked) return;
                window._origToggleCountCategory(cat);
            };
            // Watch for detail table popup → unlock category buttons
            window._tourCRObserver = new MutationObserver(function(mutations) {
                for (var i = 0; i < mutations.length; i++) {
                    for (var j = 0; j < mutations[i].addedNodes.length; j++) {
                        var node = mutations[i].addedNodes[j];
                        if (node.id === 'category-table-popup') {
                            window._tourCRUnlocked = true;
                            return;
                        }
                    }
                }
            });
            window._tourCRObserver.observe(document.body, { childList: true });
        },
        onExit: function() {
            // Restore original toggleCountCategory
            if (window._origToggleCountCategory) {
                window.toggleCountCategory = window._origToggleCountCategory;
                delete window._origToggleCountCategory;
            }
            delete window._tourCRUnlocked;
            if (window._tourCRObserver) {
                window._tourCRObserver.disconnect();
                delete window._tourCRObserver;
            }
            const cr = document.getElementById('countReport');
            cr.style.zIndex = '';
            // Close any detail table popup opened during this step
            const catPopup = document.getElementById('category-table-popup');
            if (catPopup) catPopup.remove();
            // Reset all exercise filters
            sliderValues.joints = 0;
            document.getElementById('slider-joints').value = 0;
            document.getElementById('value-joints').textContent = '0%';
            sliderValues.sufficiency = 100;
            document.getElementById('slider-sufficiency').value = 100;
            document.getElementById('value-sufficiency').textContent = '100%';
            sufficiencyMode = 'lte';
            const toggleBtn = document.getElementById('sufficiency-mode-toggle');
            if (toggleBtn) toggleBtn.textContent = '\u2264 Mode';
            evaluationActive = false;
            currentMode = 'default';
            updateBridgeSizes();
        }
    },
    // Step 11: Wrap-up — dead center of screen
    {
        target: null,
        title: "You're Ready!",
        text: 'You now know the essentials of SpanBase. Explore districts, apply filters, and click bridges to dive deeper.\n\nOpen the Condition Filter panel and click Tutorial to replay this tour. Happy bridging!',
        position: 'bottom',
        onEnter: null,
        onExit: null
    }
];

function saveTourState() {
    const condPanel = document.getElementById('evaluationPanel');
    const attrPanel = document.getElementById('attributesPanel');
    tourPreState = {
        condOpen: condPanel.classList.contains('open'),
        condBehind: condPanel.classList.contains('behind'),
        attrOpen: attrPanel.classList.contains('open'),
        attrOnTop: attrPanel.classList.contains('ontop'),
        evalActive: evaluationActive,
        evalMode: currentMode,
        sliders: Object.assign({}, sliderValues),
        suffMode: sufficiencyMode,
        hubMode: hubDataMode,
        hubRingsVisible: projectRingsVisible,
        mapCenter: map.getCenter(),
        mapZoom: map.getZoom()
    };
}

function restoreTourState() {
    if (!tourPreState) return;
    const condPanel = document.getElementById('evaluationPanel');
    const attrPanel = document.getElementById('attributesPanel');

    // Restore condition panel
    condPanel.classList.toggle('open', tourPreState.condOpen);
    condPanel.classList.toggle('behind', tourPreState.condBehind);

    // Restore attributes panel
    attrPanel.classList.toggle('open', tourPreState.attrOpen);
    attrPanel.classList.toggle('ontop', tourPreState.attrOnTop);

    // Restore all slider values
    const saved = tourPreState.sliders;
    Object.keys(saved).forEach(key => {
        sliderValues[key] = saved[key];
        const slider = document.getElementById('slider-' + key);
        const display = document.getElementById('value-' + key);
        if (slider) slider.value = saved[key];
        if (display) display.textContent = saved[key] + '%';
    });

    // Restore sufficiency mode
    sufficiencyMode = tourPreState.suffMode;
    const suffBtn = document.getElementById('sufficiency-mode-toggle');
    if (suffBtn) suffBtn.textContent = (sufficiencyMode === 'lte') ? '\u2264 Mode' : '\u2265 Mode';

    // Restore evaluation state
    evaluationActive = tourPreState.evalActive;
    currentMode = tourPreState.evalMode;
    updateBridgeSizes();

    // Restore HUB data mode
    if (hubDataMode !== tourPreState.hubMode) {
        hubDataMode = tourPreState.hubMode;
        projectRingsVisible = tourPreState.hubRingsVisible;
        const hubBtn = document.getElementById('projectToggle');
        hubBtn.classList.remove('active', 'theme');
        if (hubDataMode === 1) hubBtn.classList.add('active');
        else if (hubDataMode === 2) hubBtn.classList.add('theme');
        if (!projectRingsVisible) {
            Object.values(projectRingLayers).forEach(ring => {
                if (ring._map) ring.remove();
            });
        } else {
            updateProjectRings();
        }
    }

    // Restore map view
    map.setView(tourPreState.mapCenter, tourPreState.mapZoom);

    // Close any radial menus left open
    closeAllMenus();

    // Reset Count Report z-index in case we quit during CR step
    const cr = document.getElementById('countReport');
    cr.style.zIndex = '';

    // Reset header, map, and panel z-indexes in case we quit during step 6 or 7
    document.querySelector('.header').style.zIndex = '';
    document.getElementById('map').style.zIndex = '';
    document.getElementById('evaluationPanel').style.zIndex = '';
    document.getElementById('attributesPanel').style.zIndex = '';

    // Clean up step 7 state
    const tourPanelOverlay = document.getElementById('tour-panel-overlay');
    if (tourPanelOverlay) tourPanelOverlay.remove();
    const routeSearchBox = document.getElementById('route-search-box');
    if (routeSearchBox) { routeSearchBox.style.position = ''; routeSearchBox.style.zIndex = ''; }
    const routeInput = document.getElementById('route-search');
    const subrouteInput = document.getElementById('subroute-search');
    if (routeInput) { routeInput.value = ''; }
    if (subrouteInput) { subrouteInput.value = ''; }
    attributesFilterState.route = '';
    attributesFilterState.subroute = '';
    applyAttributesFilter();

    // Remove red circles
    if (window._tourRedCircles) {
        window._tourRedCircles.forEach(function(c) { if (c._map) c.remove(); });
        delete window._tourRedCircles;
    }

    // Restore AF scrollbar
    const attrPanelBody = document.getElementById('attributesPanel').querySelector('.panel-body');
    if (attrPanelBody) attrPanelBody.style.overflow = '';

    // Restore CF folder tab
    const condTab = document.getElementById('evaluationPanel').querySelector('.folder-tab');
    if (condTab) { condTab.style.pointerEvents = ''; condTab.style.opacity = ''; }

    // Clean up tour flags
    delete window._tourDisableRadial;
    delete window._tourBoxSelectEnabled;

    // Restore tour overlay and spotlight
    const tourOverlay = document.getElementById('tour-overlay');
    if (tourOverlay) tourOverlay.style.display = '';
    const tourSpotlight = document.getElementById('tour-spotlight');
    if (tourSpotlight) tourSpotlight.style.display = '';
    map.dragging.enable();
    map.scrollWheelZoom.enable();
    map.doubleClickZoom.enable();
    map.touchZoom.enable();
    map.boxZoom.enable();
    map.keyboard.enable();

    // Reset HUB button z-index in case we quit during step 7
    document.getElementById('projectToggle').style.zIndex = '';

    // Clear search in case we quit during step 10
    document.getElementById('searchInput').value = '';
    currentSearchQuery = '';

    // Clear box select in case we quit during step 10
    boxExcludedBars.clear();
    const boxInd = document.getElementById('box-filter-indicator');
    if (boxInd) boxInd.remove();

    // Reset count category state
    countCategoryState.critical = true;
    countCategoryState.emergent = true;
    countCategoryState.satisfactory = true;
    countCategoryState.completed = true;
    countCategoryState.na = false;
    countCategoryState.hubdata = false;
    countCategoryState.total = false;
    Object.keys(categoryClickState).forEach(k => categoryClickState[k] = 0);

    applySearch();

    tourPreState = null;
}

window.startTour = function() {
    if (tourActive) return;
    saveTourState();
    tourActive = true;
    tourStep = 0;
    document.body.classList.add('tour-active');

    // Create overlay elements
    const overlay = document.createElement('div');
    overlay.id = 'tour-overlay';
    document.body.appendChild(overlay);

    const spotlight = document.createElement('div');
    spotlight.id = 'tour-spotlight';
    document.body.appendChild(spotlight);

    const tooltip = document.createElement('div');
    tooltip.id = 'tour-tooltip';
    document.body.appendChild(tooltip);

    // Disable panel slide transitions so panels snap instantly during tour
    document.getElementById('evaluationPanel').style.transition = 'none';
    document.getElementById('attributesPanel').style.transition = 'none';

    showTourStep(0);
    window.addEventListener('resize', onTourResize);
    window.addEventListener('keydown', onTourKeydown);
};

function showTourStep(index) {
    if (index < 0 || index >= tourSteps.length) return;

    const step = tourSteps[index];
    const spotlight = document.getElementById('tour-spotlight');
    const tooltip = document.getElementById('tour-tooltip');
    if (!spotlight || !tooltip) return;

    // Run onEnter
    if (step.onEnter) step.onEnter();

    // Allow DOM to settle after onEnter
    requestAnimationFrame(() => {
        // Compute target rect and position spotlight
        // We store spotRect so positionTooltip can use it directly
        // (can't measure spotlight later — it animates via CSS transition)
        let spotRect = null;
        const pad = 6;

        if (step.target) {
            const el = document.querySelector(step.target);
            if (el) {
                const rect = el.getBoundingClientRect();
                spotRect = {
                    top: rect.top - pad,
                    left: rect.left - pad,
                    right: rect.right + pad,
                    bottom: rect.bottom + pad,
                    width: rect.width + pad * 2,
                    height: rect.height + pad * 2
                };
                spotlight.classList.remove('no-target');
                spotlight.style.top = spotRect.top + 'px';
                spotlight.style.left = spotRect.left + 'px';
                spotlight.style.width = spotRect.width + 'px';
                spotlight.style.height = spotRect.height + 'px';
            } else {
                spotlight.classList.add('no-target');
            }
        } else {
            spotlight.classList.add('no-target');
        }

        // Build tooltip content
        const total = tourSteps.length;
        const backBtn = index > 0 ? '<button class="tour-btn" onclick="prevTourStep()">Back</button>' : '<span></span>';
        const nextLabel = index < total - 1 ? 'Next' : 'Finish';
        const nextBtn = '<button class="tour-btn" onclick="nextTourStep()">' + nextLabel + '</button>';
        const closeBtn = '<button class="tour-btn" onclick="endTour()" style="margin-left:8px;border-color:rgba(255,255,255,0.3);color:rgba(255,255,255,0.6);">✕</button>';

        // Convert newlines to <br> for multi-line text
        const formattedText = step.text.replace(/\n/g, '<br>');

        // Build page number links
        let pageLinks = '<div class="tour-pages">';
        for (let i = 0; i < total; i++) {
            const active = i === index ? ' tour-page-active' : '';
            pageLinks += '<span class="tour-page' + active + '" onclick="goToTourStep(' + i + ')">' + (i + 1) + '</span>';
        }
        pageLinks += '</div>';

        tooltip.innerHTML =
            '<h4>' + step.title + '</h4>' +
            '<p>' + formattedText + '</p>' +
            '<div class="tour-nav">' +
                backBtn +
                '<div>' + nextBtn + closeBtn + '</div>' +
            '</div>' +
            pageLinks;

        // Position tooltip using computed spotRect (not the animating spotlight element)
        positionTooltip(step, spotRect, tooltip);
    });
}

function positionTooltip(step, spotRect, tooltip) {
    // Reset for measurement
    tooltip.style.top = '0px';
    tooltip.style.left = '0px';
    tooltip.style.opacity = '0';

    requestAnimationFrame(() => {
        const tRect = tooltip.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const gap = 8;

        let top, left;

        // Fixed position override (e.g. pin to a corner)
        if (step.tooltipFixed) {
            const f = step.tooltipFixed;
            if (f.top !== undefined) top = f.top;
            if (f.bottom !== undefined) top = vh - tRect.height - f.bottom;
            if (f.left !== undefined) left = f.left;
            if (f.right !== undefined) left = vw - tRect.width - f.right;
            if (top === undefined) top = (vh - tRect.height) / 2;
            if (left === undefined) left = (vw - tRect.width) / 2;
        } else if (step.target === null || !spotRect) {
            // No target: center on screen
            top = (vh - tRect.height) / 2;
            left = (vw - tRect.width) / 2;
        } else {
            // Position relative to the pre-computed target rect (not the animating spotlight)
            switch (step.position) {
                case 'bottom':
                    top = spotRect.bottom + gap;
                    left = spotRect.left + (spotRect.width - tRect.width) / 2;
                    break;
                case 'top':
                    top = spotRect.top - tRect.height - gap;
                    left = spotRect.left + (spotRect.width - tRect.width) / 2;
                    break;
                case 'left':
                    top = spotRect.top + (spotRect.height - tRect.height) / 2;
                    left = spotRect.left - tRect.width - gap;
                    break;
                case 'right':
                    top = spotRect.top + (spotRect.height - tRect.height) / 2;
                    left = spotRect.right + gap;
                    break;
                default:
                    top = spotRect.bottom + gap;
                    left = spotRect.left + (spotRect.width - tRect.width) / 2;
            }
        }

        // Clamp to viewport
        if (left < 10) left = 10;
        if (left + tRect.width > vw - 10) left = vw - tRect.width - 10;
        if (top < 10) top = 10;
        if (top + tRect.height > vh - 10) top = vh - tRect.height - 10;

        tooltip.style.top = top + 'px';
        tooltip.style.left = left + 'px';
        tooltip.style.opacity = '1';
    });
}

window.nextTourStep = function() {
    if (!tourActive) return;
    const prev = tourSteps[tourStep];
    if (prev && prev.onExit) prev.onExit();

    tourStep++;
    if (tourStep >= tourSteps.length) {
        endTour();
    } else {
        showTourStep(tourStep);
    }
};

window.prevTourStep = function() {
    if (!tourActive || tourStep <= 0) return;
    const prev = tourSteps[tourStep];
    if (prev && prev.onExit) prev.onExit();

    tourStep--;
    showTourStep(tourStep);
};

window.goToTourStep = function(index) {
    if (!tourActive) return;
    if (index < 0 || index >= tourSteps.length || index === tourStep) return;
    const prev = tourSteps[tourStep];
    if (prev && prev.onExit) prev.onExit();

    tourStep = index;
    showTourStep(tourStep);
};

window.endTour = function() {
    if (!tourActive) return;

    // Run current step's onExit
    const cur = tourSteps[tourStep];
    if (cur && cur.onExit) cur.onExit();

    // Remove tour elements
    const overlay = document.getElementById('tour-overlay');
    const spotlight = document.getElementById('tour-spotlight');
    const tooltip = document.getElementById('tour-tooltip');
    if (overlay) overlay.remove();
    if (spotlight) spotlight.remove();
    if (tooltip) tooltip.remove();

    // Re-enable panel transitions
    document.getElementById('evaluationPanel').style.transition = '';
    document.getElementById('attributesPanel').style.transition = '';

    // Remove tour-active body class (drops category-table-popup z-index back to normal)
    document.body.classList.remove('tour-active');

    // Close any category table popup left open during tour
    const catPopup = document.getElementById('category-table-popup');
    if (catPopup) catPopup.remove();

    // Clean up CR button gating in case we quit during step 9
    if (window._origToggleCountCategory) {
        window.toggleCountCategory = window._origToggleCountCategory;
        delete window._origToggleCountCategory;
    }
    delete window._tourCRUnlocked;
    if (window._tourCRObserver) {
        window._tourCRObserver.disconnect();
        delete window._tourCRObserver;
    }

    // Restore UI state
    restoreTourState();

    tourActive = false;
    tourStep = 0;
    window.removeEventListener('resize', onTourResize);
    window.removeEventListener('keydown', onTourKeydown);
};

function onTourKeydown(e) {
    if (!tourActive) return;
    if (e.key === 'Escape') endTour();
}

function onTourResize() {
    if (!tourActive) return;
    showTourStep(tourStep);
}

// ═══════════════════════════════════════════════════════
// BOX SELECT — Ctrl+drag to select bridges, include/exclude
// ═══════════════════════════════════════════════════════

function initBoxSelect() {
    const mapContainer = document.getElementById('map');
    let isSelecting = false;
    let startX, startY;
    let selectionBox = null;

    // Use capture phase so this fires before Leaflet's internal handlers
    mapContainer.addEventListener('mousedown', function(e) {
        if (!e.ctrlKey || e.button !== 0) return;
        if (tourActive && !window._tourBoxSelectEnabled) return;

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        map.dragging.disable();
        map.boxZoom.disable();

        isSelecting = true;
        startX = e.clientX;
        startY = e.clientY;

        selectionBox = document.createElement('div');
        selectionBox.id = 'box-select-rect';
        selectionBox.style.left = startX + 'px';
        selectionBox.style.top = startY + 'px';
        document.body.appendChild(selectionBox);
    }, true);

    document.addEventListener('mousemove', function(e) {
        if (!isSelecting || !selectionBox) return;
        const x = Math.min(e.clientX, startX);
        const y = Math.min(e.clientY, startY);
        const w = Math.abs(e.clientX - startX);
        const h = Math.abs(e.clientY - startY);
        selectionBox.style.left = x + 'px';
        selectionBox.style.top = y + 'px';
        selectionBox.style.width = w + 'px';
        selectionBox.style.height = h + 'px';
    });

    document.addEventListener('mouseup', function(e) {
        if (!isSelecting) return;
        isSelecting = false;
        map.dragging.enable();
        // Don't re-enable boxZoom during tour (step 7 intentionally disables it)
        if (!window._tourBoxSelectEnabled) {
            map.boxZoom.enable();
        }

        const endX = e.clientX;
        const endY = e.clientY;
        const rect = {
            left: Math.min(startX, endX),
            top: Math.min(startY, endY),
            right: Math.max(startX, endX),
            bottom: Math.max(startY, endY)
        };

        if (selectionBox) {
            selectionBox.remove();
            selectionBox = null;
        }

        // Ignore tiny accidental drags
        if (rect.right - rect.left < 10 || rect.bottom - rect.top < 10) return;

        // Find visible bridges inside the rectangle
        const selected = [];
        Object.entries(bridgeLayers).forEach(([bars, marker]) => {
            if (!marker._map) return;
            const opts = marker.options;
            if (opts.fillOpacity === 0 || opts.opacity === 0) return;
            const pt = map.latLngToContainerPoint(marker.getLatLng());
            const mapEl = document.getElementById('map');
            const mapRect = mapEl.getBoundingClientRect();
            const screenX = mapRect.left + pt.x;
            const screenY = mapRect.top + pt.y;
            if (screenX >= rect.left && screenX <= rect.right &&
                screenY >= rect.top && screenY <= rect.bottom) {
                selected.push(bars);
            }
        });

        if (selected.length === 0) return;

        showBoxSelectPopup(selected, rect);
    });
}

function showBoxSelectPopup(selectedBars, rect) {
    // Remove existing popup
    const existing = document.getElementById('box-select-popup');
    if (existing) existing.remove();

    const popup = document.createElement('div');
    popup.id = 'box-select-popup';

    // Position near the center of the selection rectangle
    const cx = (rect.left + rect.right) / 2;
    const cy = rect.bottom + 10;
    popup.style.left = cx + 'px';
    popup.style.top = cy + 'px';

    popup.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 8px; color: var(--wvdoh-yellow);">${selectedBars.length} bridge${selectedBars.length !== 1 ? 's' : ''} selected</div>
        <div style="display: flex; gap: 6px;">
            <button id="box-select-include" style="flex: 1;">Include</button>
            <button id="box-select-exclude" style="flex: 1;">Exclude</button>
            <button id="box-select-cancel" style="flex: 1;">Cancel</button>
        </div>
    `;

    document.body.appendChild(popup);

    // Clamp to viewport
    const popRect = popup.getBoundingClientRect();
    if (popRect.right > window.innerWidth - 10) {
        popup.style.left = (window.innerWidth - popRect.width - 10) + 'px';
    }
    if (popRect.bottom > window.innerHeight - 10) {
        popup.style.top = (rect.top - popRect.height - 10) + 'px';
    }

    document.getElementById('box-select-include').addEventListener('click', function() {
        // Include = exclude everything EXCEPT the selected bridges
        const allVisible = [];
        Object.entries(bridgeLayers).forEach(([bars, marker]) => {
            if (!marker._map) return;
            const opts = marker.options;
            if (opts.fillOpacity === 0 || opts.opacity === 0) return;
            allVisible.push(bars);
        });
        allVisible.forEach(bars => {
            if (!selectedBars.includes(bars)) {
                boxExcludedBars.add(bars);
            }
        });
        // Hide tour red circle if present
        if (window._tourRedCircles) {
            window._tourRedCircles.forEach(function(c) { if (c._map) c.remove(); });
        }
        popup.remove();
        updateBridgeSizes();
        showBoxFilterIndicator();
    });

    document.getElementById('box-select-exclude').addEventListener('click', function() {
        selectedBars.forEach(bars => boxExcludedBars.add(bars));
        // Hide tour red circle if present
        if (window._tourRedCircles) {
            window._tourRedCircles.forEach(function(c) { if (c._map) c.remove(); });
        }
        popup.remove();
        updateBridgeSizes();
        showBoxFilterIndicator();
    });

    document.getElementById('box-select-cancel').addEventListener('click', function() {
        popup.remove();
    });

    // Close on click outside
    setTimeout(() => {
        document.addEventListener('mousedown', function closePopup(e) {
            if (!popup.contains(e.target)) {
                popup.remove();
                document.removeEventListener('mousedown', closePopup);
            }
        });
    }, 50);
}

function showBoxFilterIndicator() {
    let indicator = document.getElementById('box-filter-indicator');
    if (boxExcludedBars.size === 0) {
        if (indicator) indicator.remove();
        return;
    }
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'box-filter-indicator';
        document.body.appendChild(indicator);
    }
    indicator.innerHTML = `
        <span>${boxExcludedBars.size} bridge${boxExcludedBars.size !== 1 ? 's' : ''} filtered</span>
        <button onclick="clearBoxSelect()">Reset</button>
    `;
}

function clearBoxSelect() {
    boxExcludedBars.clear();
    const indicator = document.getElementById('box-filter-indicator');
    if (indicator) indicator.remove();
    updateBridgeSizes();
}

