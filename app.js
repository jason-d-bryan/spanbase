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
        map = L.map('map', { minZoom: 7 });
        
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
            if (currentZoom <= 8) {
                showDistrictTooltip(e, bridge);
            } else if (currentZoom >= 10) {
                showNameTooltip(e, bridge);
            }
        });

        marker.on('mouseout', function() {
            if (currentZoom <= 8) {
                delayedRemoveTooltip();
            } else {
                removeNameTooltip();
            }
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

            L.DomEvent.stopPropagation(e);
            removeNameTooltip();

            // HUB Data isolation mode: go directly to project info
            if (countCategoryState.hubdata) {
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
    
    // Create title above menu - 10px from center circle (117/2 = 58.5, + 10 = ~70px)
    const title = L.DomUtil.create('div', 'menu-title');
    title.style.left = point.x + 'px';
    title.style.top = (point.y - 277) + 'px'; // Moved up 7px more
    
    // Convert bridge name to title case
    const bridgeName = bridge.bridge_name || 'Unknown';
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
    
    // Build nodes - include HUB Data only when project rings are active
    const nodes = projectRingsVisible ? [
        { angle: 270, label: 'Narrative', action: () => showNarratives(bridge) },        // Top (12 o'clock)
        { angle: 330, label: 'Condition', action: () => showCondition(bridge) },         // Top-right
        { angle: 30,  label: 'HUB Data', action: () => showProjectInfo(bridge) },        // Right
        { angle: 90,  label: 'Geometry', action: () => showGeometry(bridge) },           // Bottom
        { angle: 150, label: 'Attributes', action: () => showAttributes(bridge) },       // Bottom-left
        { angle: 210, label: 'Inspection', action: () => showInspectionsPopup(bridge) }  // Left
    ] : [
        { angle: 270, label: 'Narrative', action: () => showNarratives(bridge) },        // Top (12 o'clock)
        { angle: 342, label: 'Condition', action: () => showCondition(bridge) },         // Top-right
        { angle: 54,  label: 'Geometry', action: () => showGeometry(bridge) },           // Bottom-right
        { angle: 126, label: 'Attributes', action: () => showAttributes(bridge) },       // Bottom
        { angle: 198, label: 'Inspection', action: () => showInspectionsPopup(bridge) }  // Bottom-left
    ];
    
    nodes.forEach(node => {
        const rad = node.angle * Math.PI / 180;
        const distance = 105; // Brought in 5px closer
        
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
    if (currentMode === 'evaluation' || (evaluationActive && currentMode !== 'inspection')) {
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
        
        // HIDE BRIDGES WITH N/A (gray color #6b7280) unless N/A is toggled on or search is active
        if (shouldShow && evaluationActive && color.toLowerCase() === '#6b7280') {
            if (!countCategoryState.na && currentSearchQuery.length === 0) {
                shouldShow = false;
            }
        }
        
        // Show or hide marker
        if (shouldShow) {
            marker.setRadius(size);
            marker.setStyle({
                fillColor: color,
                fillOpacity: 0.85,
                opacity: 1
            });
            if (!marker._map) {
                marker.addTo(map);
            }
        } else {
            if (marker._map) {
                marker.remove();
            }
        }
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

let mouseLatLng = { lat: 0, lng: 0 };

function createDebugPanel() {
    const panel = L.DomUtil.create('div', 'debug-panel');
    panel.id = 'debugPanel';
    document.body.appendChild(panel);

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
                    fillOpacity: 0.85,
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
};

// ESC key to reset — closes radial menus, CR window, HUB toggle, and mimics reset button
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeAllMenus();

        // Turn off HUB Data toggle if active
        if (projectRingsVisible) {
            projectRingsVisible = false;
            const btn = document.getElementById('projectToggle');
            if (btn) {
                btn.textContent = 'HUB Data: OFF';
                btn.classList.remove('active');
            }
            Object.values(projectRingLayers).forEach(ring => {
                if (ring._map) ring.remove();
            });
        }

        // Reset hubdata CR state if active
        if (countCategoryState.hubdata) {
            countCategoryState.critical = true;
            countCategoryState.emergent = true;
            countCategoryState.satisfactory = true;
            countCategoryState.na = false;
            countCategoryState.hubdata = false;
            countCategoryState.total = true;
        }

        resetCurrentTab();
        closeCountReport();
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
                    if (marker._map) marker.remove();
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
            if (marker._map) marker.remove();
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
    document.getElementById('value-area').textContent = '403,000';
    document.getElementById('area-mode-toggle').textContent = '≤ Mode';

    document.getElementById('slider-age').value = 100;
    document.getElementById('value-age').textContent = '210 years';
    document.getElementById('age-mode-toggle').textContent = '≤ Mode';
    
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
    attributesFilterState.active = false;
    
    // Close count report
    closeCountReport();
    
    applyAttributesFilter();
};

// Setup slider listeners
document.addEventListener('DOMContentLoaded', function() {
    const lengthSlider = document.getElementById('slider-length');
    if (lengthSlider) {
        lengthSlider.addEventListener('input', function() {
            const actualValue = sliderToValue(parseInt(this.value), 0, 4020);
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
            const actualValue = sliderToValue(parseInt(this.value), 0, 880);
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
            const actualValue = sliderToValue(parseInt(this.value), 0, 403000);
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
            const rawValue = sliderToValue(parseInt(this.value), 0, 210);
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
            attributesFilterState.route = this.value;
            applyAttributesFilter();
            // Auto-zoom if route entered
            if (this.value.length > 0) {
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
        attributesFilterState.length.value < 4020 ||
        attributesFilterState.width.value < 880 ||
        attributesFilterState.area.value < 403000 ||
        attributesFilterState.age.value < 210 ||
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
    
    // Hide N/A bridges unless toggle is on
    if (!attributesFilterState.showNA) {
        // Check if any active filter has N/A data
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
    
    // Route filter
    if (attributesFilterState.route.length > 0) {
        const route = (bridge.route || '').toString().toUpperCase();
        if (!route.includes(attributesFilterState.route.toUpperCase())) return false;
    }
    
    // Subroute filter
    if (attributesFilterState.subroute.length > 0) {
        const subroute = (bridge.subroute || '').toString().toUpperCase();
        if (!subroute.includes(attributesFilterState.subroute.toUpperCase())) return false;
    }
    
    return true;
}

// Logarithmic slider conversion for better distribution
// Power-curve scaling (quadratic) — more natural than logarithmic
function valueToSlider(value, min, max) {
    const range = max - min;
    if (range === 0) return 0;
    return Math.round(Math.pow((value - min) / range, 1 / 2) * 100);
}

function sliderToValue(position, min, max) {
    const range = max - min;
    return Math.round(Math.pow(position / 100, 2) * range + min);
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
            document.getElementById('value-area').textContent = '403,000 sq ft';
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
// COUNT REPORT SYSTEM (v7.6.5 - Show Max Counts)
// ============================================

// Track which categories are active (ALL on by default except N/A)
const countCategoryState = {
    critical: true,
    emergent: true,
    satisfactory: true,
    na: false,
    hubdata: false,
    total: true
};

// Store max counts (always show these)
let maxCounts = {
    critical: 0,
    emergent: 0,
    satisfactory: 0,
    na: 0,
    hubdata: 0,
    total: 0
};

// Track click state for double-click detection
const categoryClickState = {
    critical: 0,
    emergent: 0,
    satisfactory: 0,
    na: 0,
    hubdata: 0
};

// Categorize a bridge by its worst condition rating (data-based, not color-based)
// When evaluation sliders are active, only considers the active slider components
function getBridgeCategory(bridge) {
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
        else if (category === 'satisfactory') satisfactory++;
        else na++;
    });

    return { critical, emergent, satisfactory, na, hubdata, total: critical + emergent + satisfactory + na };
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
    
    // Calculate max counts (from ALL bridges)
    maxCounts = calculateMaxBridgeCounts();
    
    // Always display MAX counts
    document.getElementById('count-critical').textContent = maxCounts.critical;
    document.getElementById('count-emergent').textContent = maxCounts.emergent;
    document.getElementById('count-satisfactory').textContent = maxCounts.satisfactory;
    document.getElementById('count-na').textContent = maxCounts.na;
    document.getElementById('count-hubdata').textContent = maxCounts.hubdata;
    document.getElementById('count-total').textContent = maxCounts.total;

    const btnCritical = document.getElementById('btn-critical');
    const btnEmergent = document.getElementById('btn-emergent');
    const btnSatisfactory = document.getElementById('btn-satisfactory');
    const btnNA = document.getElementById('btn-na');
    const btnHubdata = document.getElementById('btn-hubdata');

    if (!hasCondition && !evaluationActive && !(typeof attributesFilterState !== 'undefined' && attributesFilterState.active)) {
        // Grey out condition buttons when no condition filtering and not in maintenance mode
        btnCritical.style.opacity = '0.3';
        btnCritical.style.cursor = 'not-allowed';
        btnCritical.disabled = true;

        btnEmergent.style.opacity = '0.3';
        btnEmergent.style.cursor = 'not-allowed';
        btnEmergent.disabled = true;

        btnSatisfactory.style.opacity = '0.3';
        btnSatisfactory.style.cursor = 'not-allowed';
        btnSatisfactory.disabled = true;

        btnNA.style.opacity = '0.3';
        btnNA.style.cursor = 'not-allowed';
        btnNA.disabled = true;
    } else {
        // Enable buttons that have bridges
        if (maxCounts.critical > 0) {
            btnCritical.disabled = false;
            btnCritical.style.cursor = 'pointer';
            btnCritical.title = 'Click to isolate Critical bridges';
            btnCritical.style.opacity = countCategoryState.critical ? '1.0' : '0.5';
        } else {
            btnCritical.style.opacity = '0.3';
            btnCritical.style.cursor = 'not-allowed';
            btnCritical.disabled = true;
        }

        if (maxCounts.emergent > 0) {
            btnEmergent.disabled = false;
            btnEmergent.style.cursor = 'pointer';
            btnEmergent.title = 'Click to isolate Emergent bridges';
            btnEmergent.style.opacity = countCategoryState.emergent ? '1.0' : '0.5';
        } else {
            btnEmergent.style.opacity = '0.3';
            btnEmergent.style.cursor = 'not-allowed';
            btnEmergent.disabled = true;
        }

        if (maxCounts.satisfactory > 0) {
            btnSatisfactory.disabled = false;
            btnSatisfactory.style.cursor = 'pointer';
            btnSatisfactory.title = 'Click to isolate Satisfactory bridges';
            btnSatisfactory.style.opacity = countCategoryState.satisfactory ? '1.0' : '0.5';
        } else {
            btnSatisfactory.style.opacity = '0.3';
            btnSatisfactory.style.cursor = 'not-allowed';
            btnSatisfactory.disabled = true;
        }

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

    // HUB Data button — always enabled when CR is visible and has project data
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
    const filtersEngaged = hasCondition || inspectionFiltersActive ||
                           (typeof attributesFilterState !== 'undefined' && attributesFilterState.active);
    if (filtersEngaged && maxCounts.total > 0 && countReport.style.display !== 'block') {
        countReport.style.display = 'block';
        const header = document.getElementById('countReportHeader');
        if (header && !countReport.dataset.draggable) {
            makeDraggable(countReport, header);
            countReport.dataset.draggable = 'true';
        }
        positionCountReportOutsideBridges();
    }
}

// Position count report outside visible bridge bounding box
function positionCountReportOutsideBridges() {
    const countReport = document.getElementById('countReport');
    if (!countReport || !map) return;
    
    // Get bounding box of all visible bridges
    let minLat = Infinity, maxLat = -Infinity;
    let minLng = Infinity, maxLng = -Infinity;
    let hasVisible = false;
    
    Object.values(bridgeLayers).forEach(marker => {
        if (marker.options.fillOpacity > 0) {
            const latlng = marker.getLatLng();
            minLat = Math.min(minLat, latlng.lat);
            maxLat = Math.max(maxLat, latlng.lat);
            minLng = Math.min(minLng, latlng.lng);
            maxLng = Math.max(maxLng, latlng.lng);
            hasVisible = true;
        }
    });
    
    if (!hasVisible) {
        // Default position
        countReport.style.top = '145px';
        countReport.style.left = '50%';
        countReport.style.transform = 'translateX(-50%)';
        return;
    }
    
    // Convert to screen coordinates
    const topLeft = map.latLngToContainerPoint([maxLat, minLng]);
    const bottomRight = map.latLngToContainerPoint([minLat, maxLng]);
    
    const boxWidth = 350;
    const boxHeight = 320;
    const padding = 15;
    
    const mapWidth = map.getContainer().clientWidth;
    const mapHeight = map.getContainer().clientHeight;
    
    let left, top;
    
    // Try right side first
    if (bottomRight.x + boxWidth + padding * 2 < mapWidth) {
        left = bottomRight.x + padding;
        top = Math.max(145, topLeft.y);
    }
    // Try left side
    else if (topLeft.x - boxWidth - padding * 2 > 0) {
        left = topLeft.x - boxWidth - padding;
        top = Math.max(145, topLeft.y);
    }
    // Try below
    else if (bottomRight.y + boxHeight + padding < mapHeight) {
        left = (mapWidth / 2) - (boxWidth / 2);
        top = bottomRight.y + padding;
    }
    // Try above
    else if (topLeft.y - boxHeight - padding > 0) {
        left = (mapWidth / 2) - (boxWidth / 2);
        top = topLeft.y - boxHeight - padding;
    }
    // Default center-top
    else {
        left = (mapWidth / 2) - (boxWidth / 2);
        top = 145;
    }
    
    // Clamp to screen
    left = Math.max(10, Math.min(left, mapWidth - boxWidth - 10));
    top = Math.max(10, Math.min(top, mapHeight - boxHeight - 10));
    
    countReport.style.top = top + 'px';
    countReport.style.left = left + 'px';
    countReport.style.transform = 'none';
}

// Update button visual states
function updateButtonStyles() {
    const btnCritical = document.getElementById('btn-critical');
    const btnEmergent = document.getElementById('btn-emergent');
    const btnSatisfactory = document.getElementById('btn-satisfactory');
    const btnNA = document.getElementById('btn-na');
    const btnHubdata = document.getElementById('btn-hubdata');
    const btnTotal = document.getElementById('btn-total');

    // Active buttons get highlighted border
    if (btnCritical && !btnCritical.disabled) {
        btnCritical.style.borderColor = countCategoryState.critical ? '#dc2626' : 'rgba(255,255,255,0.2)';
        btnCritical.style.borderWidth = countCategoryState.critical ? '2px' : '1px';
    }

    if (btnEmergent && !btnEmergent.disabled) {
        btnEmergent.style.borderColor = countCategoryState.emergent ? '#F97316' : 'rgba(255,255,255,0.2)';
        btnEmergent.style.borderWidth = countCategoryState.emergent ? '2px' : '1px';
    }

    if (btnSatisfactory && !btnSatisfactory.disabled) {
        btnSatisfactory.style.borderColor = countCategoryState.satisfactory ? '#10b981' : 'rgba(255,255,255,0.2)';
        btnSatisfactory.style.borderWidth = countCategoryState.satisfactory ? '2px' : '1px';
    }

    if (btnNA && !btnNA.disabled) {
        btnNA.style.borderColor = countCategoryState.na ? '#6b7280' : 'rgba(255,255,255,0.2)';
        btnNA.style.borderWidth = countCategoryState.na ? '2px' : '1px';
    }

    if (btnHubdata && !btnHubdata.disabled) {
        btnHubdata.style.borderColor = countCategoryState.hubdata ? '#22c55e' : 'rgba(255,255,255,0.2)';
        btnHubdata.style.borderWidth = countCategoryState.hubdata ? '2px' : '1px';
    }

    if (btnTotal) {
        btnTotal.style.background = countCategoryState.total ? 'rgba(255,184,28,0.1)' : 'transparent';
    }
}

// Toggle category visibility
window.toggleCountCategory = function(category) {
    const hasCondition = hasConditionSlidersActive();
    // HUB Data button bypasses the condition slider requirement
    if (category !== 'hubdata' && category !== 'total') {
        if (!hasCondition && !evaluationActive && !(typeof attributesFilterState !== 'undefined' && attributesFilterState.active)) return;
    }

    if (category === 'total') {
        // Total: Show all except N/A and hubdata
        countCategoryState.critical = true;
        countCategoryState.emergent = true;
        countCategoryState.satisfactory = true;
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
            countCategoryState.na = false;
            countCategoryState.hubdata = false;
            countCategoryState.total = true;
            categoryClickState.hubdata = 0;
        } else {
            // First click: isolate HUB data bridges
            countCategoryState.critical = false;
            countCategoryState.emergent = false;
            countCategoryState.satisfactory = false;
            countCategoryState.na = false;
            countCategoryState.hubdata = true;
            countCategoryState.total = false;
            Object.keys(categoryClickState).forEach(k => categoryClickState[k] = 0);
            categoryClickState.hubdata = 1;
        }
    } else {
        // Check for double-click (click same button twice)
        if (categoryClickState[category] === 1 &&
            !countCategoryState.critical && !countCategoryState.emergent &&
            !countCategoryState.satisfactory && !countCategoryState.na &&
            countCategoryState[category]) {
            // Double-click detected - show all
            countCategoryState.critical = true;
            countCategoryState.emergent = true;
            countCategoryState.satisfactory = true;
            countCategoryState.na = false;
            countCategoryState.hubdata = false;
            countCategoryState.total = true;
            categoryClickState[category] = 0;
        } else {
            // First click or switching categories - isolate this category
            countCategoryState.critical = false;
            countCategoryState.emergent = false;
            countCategoryState.satisfactory = false;
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

    // Auto-zoom
    setTimeout(autoZoomToFilteredBridges, 100);
};

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
                    fillOpacity: 0.85,
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

    // Apply category filtering when condition sliders active OR in maintenance mode
    if (!hasCondition && !evaluationActive && !(typeof attributesFilterState !== 'undefined' && attributesFilterState.active)) return;

    // Check if showing all (total state or all categories on except N/A)
    const showingAll = countCategoryState.total ||
                       (countCategoryState.critical && countCategoryState.emergent &&
                        countCategoryState.satisfactory && !countCategoryState.na);

    if (showingAll) return;

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
        if (category === 'satisfactory' && countCategoryState.satisfactory) shouldShow = true;
        if (category === 'na' && countCategoryState.na) shouldShow = true;

        if (shouldShow) {
            // Add to map if not already there
            if (!marker._map) {
                const size = evaluationActive ? getEvaluationSize(bridge, getPointSize()) : getPointSize();
                marker.setRadius(size);
                marker.setStyle({
                    fillOpacity: 0.85,
                    fillColor: getBridgeColor(bridge),
                    opacity: 1
                });
                marker.addTo(map);
            }
        } else {
            // Remove from map if it's there
            if (marker._map) {
                marker.remove();
            }
        }
    });
}

// Close count report
window.closeCountReport = function() {
    document.getElementById('countReport').style.display = 'none';
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

    const ringSize = getPointSize() + 4;
    Object.entries(projectRingLayers).forEach(([bars, ring]) => {
        ring.setRadius(ringSize);

        // Only show ring if the bridge marker is on the map
        const bridgeMarker = bridgeLayers[bars];
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
    projectRingsVisible = !projectRingsVisible;

    const btn = document.getElementById('projectToggle');
    if (projectRingsVisible) {
        btn.textContent = 'HUB Data: ON';
        btn.classList.add('active');
        updateProjectRings();
    } else {
        btn.textContent = 'HUB Data: OFF';
        btn.classList.remove('active');
        // Remove all rings from map
        Object.values(projectRingLayers).forEach(ring => {
            if (ring._map) ring.remove();
        });
    }

};

