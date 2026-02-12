// SpanBase - Complete Build with All Features
let map;
let bridgesData = [];
let sufficiencyData = {}; // BARS number -> calculated sufficiency rating
let bridgeLayers = {};
let projectsData = {};
let hubData = {};
let projectRingLayers = {};
let projectRingsVisible = false;
let hubPanelActive = false;
let currentMode = 'default';
let currentZoom = 8;
const wvBounds = [[37.206, -82.605], [40.621, -77.742]];
const initialView = { bounds: wvBounds, padding: [30, 30] }; // For resetting to WV overview
let hoveredBridge = null;
let radialMenu = null;
let nameTooltip = null;
let currentSearchQuery = ''; // Track search state
let boxExcludedBars = new Set(); // Bridges excluded by box select or Ctrl+Click
let excludeUndoStack = []; // Stack of actions: each entry is an array of BARS strings

// Inspection system
let inspectionsData = {}; // BARS number -> array of inspections
let inspectionFiltersActive = false;
let selectedInspectionTypes = [];
let selectedMonths = [];
let showOverduePlus = false;

// Live URL update
let _urlUpdateTimer = null;
let _urlUpdateEnabled = false;

// CR manual close tracking
let crManuallyHidden = false;

// Both-mode (dCR) category isolation — independent maint/insp sections
let bothActiveSection = null;   // 'maint' or 'insp' when a dCR category button is clicked
let bothActiveCategory = null;  // 'critical', 'emergent', 'satisfactory' when isolated

// Report Mode state
let reportPanelOpen = false;
let reportCategory = 'critical';     // selected category filter — default to critical
let reportBridgeList = [];           // bridges matching current category
let reportCurrentIndex = 0;          // current bridge index in the list
let reportHighlightMarker = null;    // temp highlight ring on map
let reportViewMode = 'maintenance';  // 'maintenance' or 'inspection' — controls section order/defaults
let reportBarsSet = null;            // Set of BARS in current report list (for quick lookup)
let reportMapMode = 'panZoom';       // 'panZoom' | 'pan' | 'off' — controls map behavior during RE nav
let reportZoomFromNav = false;       // flag to distinguish programmatic zoom from user zoom
let reTourShownThisSession = false;  // only auto-show RE tutorial once per session
let reTourActive = false;
let reTourStep = 0;

// RE Condition filter toggles — clicking a rating square filters map bridges
let reportConditionFilters = {};     // e.g. { deck_rating: '4', substructure_rating: '6' }
let reportSufficiencyFilter = null;  // target value; shows bridges within ±10

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
        updateSliderLabels();
        buildBridgeTypeCheckboxes();

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

        // Load HUB funding data
        try {
            const hubResponse = await fetch('hub_data.json.gz');
            const hubCompressed = await hubResponse.arrayBuffer();
            const hubDecompressed = pako.inflate(new Uint8Array(hubCompressed), { to: 'string' });
            hubData = JSON.parse(hubDecompressed);
            console.log(`✓ Loaded HUB data for ${Object.keys(hubData).length} bridges`);
            buildHubFilterUI();
        } catch(e) {
            console.warn('HUB data not available:', e.message);
            hubData = {};
        }

        // Initialize map with WV bounding box
        map = L.map('map', {
            minZoom: 8,
            maxZoom: 15,
            maxBounds: [[35.5, -84.5], [42.0, -76.0]],
            maxBoundsViscosity: 0.8
        });

        // Temporary view until we fit to bridge data
        map.setView([38.9135, -80.1735], 8);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap',
            maxZoom: 19
        }).addTo(map);

        addBridges();

        // Zoom to fit all bridge points
        if (bridgesData.length > 0) {
            const lats = bridgesData.map(b => parseFloat(b.latitude)).filter(v => !isNaN(v));
            const lngs = bridgesData.map(b => parseFloat(b.longitude)).filter(v => !isNaN(v));
            if (lats.length > 0 && lngs.length > 0) {
                const dataBounds = [
                    [Math.min(...lats), Math.min(...lngs)],
                    [Math.max(...lats), Math.max(...lngs)]
                ];
                map.fitBounds(dataBounds, { padding: [30, 30] });
            }
        }
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
            // Update highlight ring radius to match new point size
            if (reportHighlightMarker) {
                reportHighlightMarker.setRadius(getHighlightRingRadius());
            }
            // If RE is open and zoom wasn't from navigation, switch to pan-only mode
            if (reportPanelOpen && !reportZoomFromNav && reportMapMode === 'panZoom') {
                reportMapMode = 'pan';
                renderReportTitleBox();
            }
            reportZoomFromNav = false;
            // Re-apply condition lock colors after updateBridgeSizes resets them
            if (reportPanelOpen) {
                applyReportCategoryFilter();
            }
        });

        map.on('moveend', updateUrlHash);

        initBoxSelect();
        initEasterEggs();
        checkMothmanDay();
        checkFlatwoodsDay();

        // Restore shared link state if URL has hash params
        if (window.location.hash.length > 1) {
            restoreFromUrl();
            updateBridgeSizes();
        }

        // Show CR with dual sections on load
        updateCountReport();
    

        document.getElementById('loading').style.display = 'none';
        console.log('✓ SpanBase ready');

        // Enable live URL updates after init settles
        setTimeout(() => { _urlUpdateEnabled = true; }, 600);
        
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
            // At low zoom (district tooltip level), clicking solos/unsolos that district
            if (currentZoom < 10) {
                const districtName = bridge.district;
                if (!districtName) return;
                const onlyThisActive = activeDistricts[districtName] &&
                    Object.entries(activeDistricts).filter(([k,v]) => v && k !== districtName).length === 0;
                const districtItems = document.querySelectorAll('.cr-district-item');
                if (onlyThisActive) {
                    Object.keys(activeDistricts).forEach(d => { activeDistricts[d] = true; });
                    districtItems.forEach(i => i.classList.remove('inactive'));
                    map.fitBounds(wvBounds, { padding: [30, 30] });
                } else {
                    Object.keys(activeDistricts).forEach(d => { activeDistricts[d] = (d === districtName); });
                    districtItems.forEach(i => {
                        i.classList.toggle('inactive', i.getAttribute('data-district') !== districtName);
                    });
                    const bounds = districtBounds[districtName];
                    if (bounds) map.fitBounds(bounds, { padding: [30, 30] });
                }
                syncToggleAllButton();
                updateBridgeVisibility();
                updateUrlHash();
                return;
            }
            // Disabled during certain tour steps
            if (window._tourDisableRadial) {
                return;
            }

            L.DomEvent.stopPropagation(e);
            removeNameTooltip();

            // Ctrl+Click: exclude this single bridge point
            if (e.originalEvent && e.originalEvent.ctrlKey) {
                boxExcludedBars.add(bridge.bars_number);
                excludeUndoStack.push([bridge.bars_number]);
                updateBridgeSizes();
                showBoxFilterIndicator();
                return;
            }

            // Report Explorer open: navigate RE to this bridge instead of radial menu
            if (reportPanelOpen) {
                let idx = reportBridgeList.findIndex(b => b.bars_number === bridge.bars_number);
                if (idx < 0) {
                    // Bridge not in current category — switch to Total
                    switchReportCategory('total');
                    idx = reportBridgeList.findIndex(b => b.bars_number === bridge.bars_number);
                }
                if (idx >= 0) {
                    reportCurrentIndex = idx;
                    renderReportDetail(reportBridgeList[reportCurrentIndex]);
                    // Place highlight ring at current zoom — no pan/zoom since user clicked on the map
                    removeReportHighlight();
                    const b = reportBridgeList[reportCurrentIndex];
                    if (b && b.latitude && b.longitude) {
                        reportHighlightMarker = L.circleMarker(
                            [parseFloat(b.latitude), parseFloat(b.longitude)],
                            { radius: getHighlightRingRadius(), color: '#000000', weight: 3, fillColor: 'transparent', fillOpacity: 0, className: 'report-highlight-ring' }
                        ).addTo(map);
                    }
                    updateReportNav();
                    renderReportBridgeList();
                    applyReportCategoryFilter();
                }
                return;
            }

            // HUB Data theme mode: go directly to project info
            if (hubDataMode === 2) {
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

// Easter egg: Rick Roll popup
function showRickRoll() {
    const existing = document.getElementById('rickroll-popup');
    if (existing) existing.remove();
    const popup = document.createElement('div');
    popup.id = 'rickroll-popup';
    popup.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:99999;background:#000;border:1px solid var(--wvdoh-yellow);border-radius:12px;padding:8px;box-shadow:0 8px 40px rgba(0,0,0,0.8);';
    popup.innerHTML = '<div style="position:relative;">' +
        '<button onclick="document.getElementById(\'rickroll-popup\').remove()" style="position:absolute;top:-4px;right:2px;background:none;border:none;color:#fff;font-size:16pt;cursor:pointer;z-index:1;">✕</button>' +
        '<iframe width="480" height="270" src="https://www.youtube.com/embed/Ay8lynMZ4mE?autoplay=1" frameborder="0" allow="autoplay;encrypted-media" allowfullscreen></iframe>' +
        '<div style="text-align:center;color:var(--wvdoh-yellow);font-size:16pt;font-weight:600;padding:8px 0;">This bridge is never gonna let you down.</div>' +
        '</div>';
    document.body.appendChild(popup);
}

function removeNameTooltip() {
    if (nameTooltip) {
        nameTooltip.remove();
        nameTooltip = null;
    }
}

// Seasonal NRG Bridge images for radial menu title
const nrgSeasonImages = ['Bridge-Spring-3.jpg', 'Bridge-Spring-3.jpg', 'bridge%20fall.jpg', 'bridge%20winter.jpg'];
const nrgSeasonLabels = ['Spring', 'Summer', 'Fall', 'Winter'];
const nrgSeasonPositions = ['center', 'center', 'center', 'center calc(50% + 10px)'];
const nrgSeasonBorders = ['#3a9e4f', '#FFB81C', '#e87830', '#ffffff'];
const nrgSeasonBorderWidths = ['2px', '1px', '1px', '1px'];
function getNrgSeasonIndex() {
    const month = new Date().getMonth(); // 0-11
    if (month >= 2 && month <= 4) return 0;        // Mar-May: Spring
    if (month >= 5 && month <= 7) return 1;        // Jun-Aug: Summer
    if (month >= 8 && month <= 10) return 2;       // Sep-Nov: Fall
    return 3;                                       // Dec-Feb: Winter
}

function getNrgSeasonImage() {
    return nrgSeasonImages[getNrgSeasonIndex()];
}

function getNrgSeasonLabel() {
    return nrgSeasonLabels[getNrgSeasonIndex()];
}

function showRadialMenu(latlng, bridge) {
    closeAllMenus();
    window._radialBridge = bridge;

    const point = map.latLngToContainerPoint(latlng);

    // Create title above menu - 10px from center circle (117/2 = 58.5, + 10 = ~70px)
    const title = L.DomUtil.create('div', 'menu-title');
    title.style.left = point.x + 'px';
    title.style.top = (point.y - 277) + 'px'; // Moved up 7px more

    // Convert bridge name to title case
    const bridgeName = cleanBridgeName(bridge.bridge_name);
    const titleCaseName = bridgeName.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

    const isNRG = bridge.bars_number === '10A214';
    if (isNRG) {
        const seasonIdx = getNrgSeasonIndex();
        const seasonImg = nrgSeasonImages[seasonIdx];
        const seasonPos = nrgSeasonPositions[seasonIdx];
        title.style.borderColor = nrgSeasonBorders[seasonIdx];
        title.style.borderWidth = nrgSeasonBorderWidths[seasonIdx];
        title.innerHTML = `
            <div class="menu-title-bg" style="background-image: url('${seasonImg}'); background-position: ${seasonPos};"></div>`;
    } else {
        title.innerHTML = '';
    }
    title.innerHTML += `
        <div class="menu-title-text">
            ${titleCaseName}<br>
            <span style="font-size: 12pt;">${bridge.bars_number}</span>
        </div>
        <div class="menu-title-links">
            <a href="https://www.google.com/maps?q=${bridge.latitude},${bridge.longitude}"
               target="_blank" class="menu-title-link" data-tip="Open this bridge location in Google Maps">Google Maps</a>
            <a href="${bridge.bars_hyperlink || '#'}"
               target="_blank" class="menu-title-link" data-tip="Open this bridge record in AssetWise">AssetWise</a>
            <a href="javascript:void(0)" class="menu-title-link" onclick="openRadialShare(this, window._radialBridge)" data-tip="Share this bridge's data via link, email, or QR code">Share</a>
            <a href="javascript:void(0)" class="menu-title-link" onclick="openBridgeReport(window._radialBridge)" data-tip="Open this bridge in Report Mode — browse all details in a scrollable panel">Report</a>
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
    const hubPanelOpen = document.getElementById('hubPanel') && document.getElementById('hubPanel').classList.contains('ontop');
    const hasHubData = (hubDataMode === 1 && projectsData[bridge.bars_number]) || (hubPanelOpen && hubData[bridge.bars_number]);
    const nodes = hasHubData ? [
        { angle: 150, label: 'Attributes',  action: () => showAttributes(bridge),       z: 1, tip: 'Location, route, subroute, functional class, ADT, NHS designation, on/under bridge type, utilities, and design number' },
        { angle: 90,  label: 'Geometry',     action: () => showGeometry(bridge),         z: 2, tip: 'Bridge dimensions — length, width, area, skew, clearances, year built, age, bridge type, and span lengths' },
        { angle: 30,  label: 'HUB Data',     action: () => showHubDataInfo(bridge),      z: 3, tip: 'Project data from the HUB system — project number, SPN, phase, status, family code, financials (amount, expenditure, balance), and timeline' },
        { angle: 330, label: 'Condition',    action: () => showCondition(bridge),        z: 4, tip: 'Component condition ratings for Deck, Superstructure, Substructure, Bearings, and Joints on a 1–9 scale, plus the calculated sufficiency rating' },
        { angle: 210, label: 'Narrative',    action: () => showNarratives(bridge),       z: 5, tip: 'Inspector notes by component — Deck, Superstructure, Substructure, Joints, Railings, Paint, plus Summary & Recommendations and Engineer\'s Comments' },
        { angle: 270, label: 'Inspection',   action: () => showInspectionsPopup(bridge), z: 6, tip: 'Inspection history and schedule — type, begin/completion/due dates, and current status (On Time, Due Soon, Overdue, or Past Due)' },
    ] : [
        { angle: 126, label: 'Attributes',  action: () => showAttributes(bridge),       z: 1, tip: 'Location, route, subroute, functional class, ADT, NHS designation, on/under bridge type, utilities, and design number' },
        { angle: 54,  label: 'Geometry',     action: () => showGeometry(bridge),         z: 2, tip: 'Bridge dimensions — length, width, area, skew, clearances, year built, age, bridge type, and span lengths' },
        { angle: 342, label: 'Condition',    action: () => showCondition(bridge),        z: 4, tip: 'Component condition ratings for Deck, Superstructure, Substructure, Bearings, and Joints on a 1–9 scale, plus the calculated sufficiency rating' },
        { angle: 198, label: 'Narrative',    action: () => showNarratives(bridge),       z: 5, tip: 'Inspector notes by component — Deck, Superstructure, Substructure, Joints, Railings, Paint, plus Summary & Recommendations and Engineer\'s Comments' },
        { angle: 270, label: 'Inspection',   action: () => showInspectionsPopup(bridge), z: 6, tip: 'Inspection history and schedule — type, begin/completion/due dates, and current status (On Time, Due Soon, Overdue, or Past Due)' },
    ];

    nodes.forEach(node => {
        const rad = node.angle * Math.PI / 180;
        const distance = 105; // Brought in 5px closer

        const option = L.DomUtil.create('div', 'radial-option', menu);
        option.style.left = (distance * Math.cos(rad)) + 'px';
        option.style.top = (distance * Math.sin(rad)) + 'px';
        option.style.zIndex = node.z;
        option.innerHTML = `<span class="label">${node.label}</span>`;
        if (node.tip) option.setAttribute('data-tip', node.tip);

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
            // Don't close if clicking on menu, title, info panel, share popover, or another bridge
            if (menu.contains(e.target) ||
                title.contains(e.target) ||
                e.target.closest('.info-panel') ||
                e.target.closest('#share-popover') ||
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

function showHubDataInfo(bridge) {
    const bars = bridge.bars_number;
    const projects = hubData[bars];

    if (!projects || projects.length === 0) {
        createInfoPanel('HUB Data', `
            <div style="padding: 10px; color: #999; text-align: center;">
                No HUB data for this bridge.
            </div>
        `, bridge);
        return;
    }

    function fmtMoney(val) {
        if (val === 0 || val === null || val === undefined) return '$0.00';
        return '$' + Math.abs(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (val < 0 ? ' (CR)' : '');
    }

    let html = '';
    projects.forEach((proj, i) => {
        if (projects.length > 1) {
            html += `<div style="margin-bottom:8px; padding-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.15); font-weight:700; color:#22c55e;">Project ${i + 1} of ${projects.length}</div>`;
        }
        // Family codes can be long with || separators — split them
        let familyHtml = 'N/A';
        if (proj.family_code) {
            const codes = proj.family_code.split('||').map(c => c.trim()).filter(c => c);
            familyHtml = codes.map(c => {
                const parts = c.split('-');
                return parts[0] || c;
            }).join(', ');
        }

        html += `
            <div class="info-grid">
                <div class="info-item">
                    <span class="info-label">Project</span>
                    <span class="info-value">${proj.project || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">SPN</span>
                    <span class="info-value">${proj.spn || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Federal Project</span>
                    <span class="info-value">${proj.federal_project || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Name</span>
                    <span class="info-value">${proj.name || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Phase</span>
                    <span class="info-value">${proj.phase || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Allocation</span>
                    <span class="info-value">${proj.allocation || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">District</span>
                    <span class="info-value">${proj.district || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Division</span>
                    <span class="info-value">${proj.division || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Project Status</span>
                    <span class="info-value">${proj.project_status || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Phase Status</span>
                    <span class="info-value">${proj.phase_status || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Family Code</span>
                    <span class="info-value">${familyHtml}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Est/Authorized</span>
                    <span class="info-value">${proj.est_auth || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">P/NP</span>
                    <span class="info-value">${proj.p_np || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Amount</span>
                    <span class="info-value">${fmtMoney(proj.amount)}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Expenditure</span>
                    <span class="info-value">${fmtMoney(proj.expenditure)}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Balance</span>
                    <span class="info-value">${fmtMoney(proj.balance)}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Start Date</span>
                    <span class="info-value">${proj.start_date || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Days to Expiration</span>
                    <span class="info-value">${proj.days_expiration || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">End Date</span>
                    <span class="info-value">${proj.end_date || 'N/A'}</span>
                </div>
            </div>
        `;
        if (i < projects.length - 1) {
            html += '<div style="margin:12px 0; border-top:2px solid rgba(34,197,94,0.3);"></div>';
        }
    });

    createInfoPanel('HUB Data', html, bridge);
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
    // Close share popover
    const sharePop = document.getElementById('share-popover');
    if (sharePop) sharePop.remove();
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

    // HF panel active — show only hubData bridges in green
    if (hubPanelActive) {
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

            if (hubData[bars]) {
                if (hubFilterState.active && !bridgePassesHubFilter(bars)) {
                    if (marker._map) marker.remove();
                    return;
                }
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
    
    // If a both-mode dCR button is active, re-apply its isolation (overrides above)
    if (bothActiveSection && bothActiveCategory) {
        applyBothCategoryFilter();
    } else {
        // Apply count category filter (if condition sliders active)
        applyCountCategoryFilter();
    }

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
                crManuallyHidden = false;
                updateBridgeSizes();
                updateUrlHash();
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
    updateUrlHash();
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
        updateUrlHash();
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
    window.addEventListener('resize', centerStatusBars);
    // positionProjectToggle removed — HUB DATA button now lives in the CR

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

        <div class="debug-section">
            <span onclick="showEasterEggList()" style="color:var(--wvdoh-yellow);font-size:8pt;cursor:pointer;text-decoration:underline;opacity:0.6;">Easter Eggs</span>
        </div>
    `;
}

function showEasterEggList() {
    const existing = document.getElementById('egg-list-popup');
    if (existing) { existing.remove(); return; }
    const popup = document.createElement('div');
    popup.id = 'egg-list-popup';
    popup.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:99999;background:var(--wvdoh-blue);border:1px solid var(--wvdoh-yellow);border-radius:10px;padding:20px 28px;box-shadow:0 8px 40px rgba(0,0,0,0.7);max-width:460px;';
    popup.innerHTML =
        '<button onclick="document.getElementById(\'egg-list-popup\').remove()" style="position:absolute;top:8px;right:12px;background:none;border:none;color:#fff;font-size:14pt;cursor:pointer;">✕</button>' +
        '<div style="color:var(--wvdoh-yellow);font-weight:700;font-size:12pt;margin-bottom:14px;">Easter Eggs</div>' +
        '<div style="color:rgba(255,255,255,0.85);font-size:9.5pt;line-height:2.2;">' +
        '<b style="color:var(--wvdoh-yellow);">1.</b> Type <b>rick</b> or <b>astley</b> in Route Search &mdash; Rick Roll<br>' +
        '<b style="color:var(--wvdoh-yellow);">2.</b> Type <b>42</b> in Route Search &mdash; Hitchhiker\'s Guide<br>' +
        '<b style="color:var(--wvdoh-yellow);">3.</b> Type <b>↑↑↓↓←→←→BA</b> on keyboard &mdash; Contra 30 Lives<br>' +
        '<b style="color:var(--wvdoh-yellow);">4.</b> Type <b>wv</b> or <b>country roads</b> in Route Search &mdash; Take Me Home<br>' +
        '<b style="color:var(--wvdoh-yellow);">5.</b> Click <b>SpanBase</b> title <b>7 times</b> &mdash; Enter the Matrix<br>' +
        '<b style="color:var(--wvdoh-yellow);">6.</b> <b>December 15th</b> (or Ctrl+Shift+M) &mdash; Mothman / Silver Bridge Memorial<br>' +
        '<b style="color:var(--wvdoh-yellow);">7.</b> <b>September 12th</b> (or Ctrl+Shift+F) &mdash; Flatwoods Monster' +
        '</div>';
    document.body.appendChild(popup);
}

// District toggle functionality
function setupDistrictToggles() {
    // Attach click handlers to CR district drawer items
    const districtItems = document.querySelectorAll('.cr-district-item');
    districtItems.forEach(item => {
        const districtName = item.getAttribute('data-district');
        item.addEventListener('click', () => {
            const onlyThisOneActive = activeDistricts[districtName] &&
                                     Object.entries(activeDistricts).filter(([k,v]) => v && k !== districtName).length === 0;

            if (onlyThisOneActive) {
                // Clicking the only active district — turn all back on and zoom to WV
                Object.keys(activeDistricts).forEach(d => { activeDistricts[d] = true; });
                districtItems.forEach(i => i.classList.remove('inactive'));
                map.fitBounds(initialView.bounds, { padding: initialView.padding });
            } else {
                // Solo this district
                Object.keys(activeDistricts).forEach(d => {
                    activeDistricts[d] = (d === districtName);
                });
                districtItems.forEach(i => {
                    i.classList.toggle('inactive', i.getAttribute('data-district') !== districtName);
                });
                const bounds = districtBounds[districtName];
                if (bounds) {
                    map.fitBounds(bounds, { padding: [30, 30] });
                }
            }

            syncToggleAllButton();
            updateBridgeVisibility();
            updateUrlHash();
        });
    });

    // Also wire up the old hidden legend items so existing code that calls
    // querySelectorAll('.legend-item') doesn't break
    const legendItems = document.querySelectorAll('.legend-item');
    // no-op — they're hidden placeholders now
}

window.toggleAllDistricts = function() {
    const districtItems = document.querySelectorAll('.cr-district-item');
    const toggleBtn = document.getElementById('toggleAllDistricts');

    const allActive = Object.values(activeDistricts).every(v => v === true);

    if (allActive) {
        Object.keys(activeDistricts).forEach(d => { activeDistricts[d] = false; });
        districtItems.forEach(item => item.classList.add('inactive'));
        if (toggleBtn) toggleBtn.textContent = 'All On';
    } else {
        Object.keys(activeDistricts).forEach(d => { activeDistricts[d] = true; });
        districtItems.forEach(item => item.classList.remove('inactive'));
        if (toggleBtn) toggleBtn.textContent = 'All Off';
        map.fitBounds(initialView.bounds, { padding: initialView.padding });
    }

    updateBridgeVisibility();
    updateUrlHash();
};

function syncToggleAllButton() {
    const toggleBtn = document.getElementById('toggleAllDistricts');
    if (!toggleBtn) return;
    
    const allActive = Object.values(activeDistricts).every(v => v === true);
    toggleBtn.textContent = allActive ? 'All Off' : 'All On';
}

// Toggle the districts drawer on the CR
window.toggleCrDistricts = function() {
    const slideout = document.getElementById('crDistrictSlideout');
    if (!slideout) return;
    slideout.classList.toggle('open');
    // Once opened, stop the nudge animation — it's served its purpose
    const tab = slideout.querySelector('.cr-district-tab');
    if (tab) tab.style.animation = 'none';
};

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
        // Auto-activate inspection theme: check all type checkboxes and apply
        document.querySelectorAll('[id^="insp-"]').forEach(cb => { cb.checked = true; });
        applyInspectionFilters();
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
    crManuallyHidden = false;
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
            styleCRHubButton();
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
    updateUrlHash();
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

    // Clear box select / Ctrl+Click exclusions
    if (boxExcludedBars.size > 0) {
        clearBoxSelect();
    }

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
        styleCRHubButton();
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

    // Clear both-mode isolation
    bothActiveSection = null;
    bothActiveCategory = null;

    // Close report panel if open
    if (reportPanelOpen) {
        const rp = document.getElementById('reportsPanel');
        if (rp) rp.classList.remove('open', 'ontop');
        reportPanelOpen = false;
        removeReportHighlight();
    }

    // Close district filter slideout if open
    const dfSlideout = document.getElementById('crDistrictSlideout');
    if (dfSlideout) dfSlideout.classList.remove('open');

    // Reopen the dCR in 'both' mode instead of closing it
    crManuallyHidden = false;
    crButtonMode = null; // force rebuild
    updateCountReport();
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
        // Clear live URL hash back to clean index
        if (window.location.hash.length > 1) {
            history.replaceState(null, '', window.location.pathname);
        }
    }
});

// Ctrl+Z to undo last Ctrl+Click exclusion
document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        // Don't interfere if user is typing in an input field
        const tag = document.activeElement && document.activeElement.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        e.stopPropagation();
        if (excludeUndoStack.length > 0) {
            undoExclude();
        }
    }
});

// Arrow keys for Report Mode navigation
// Up/Down = navigate bridges, Left/Right = cycle categories
document.addEventListener('keydown', function(e) {
    if (!reportPanelOpen || tourActive || reTourActive) return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        reportNextBridge();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        reportPrevBridge();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        // Cycle through categories
        const catOrder = ['critical', 'emergent', 'satisfactory', 'na', 'hubdata', 'total'];
        let idx = catOrder.indexOf(reportCategory);
        if (e.key === 'ArrowRight') {
            idx = (idx + 1) % catOrder.length;
        } else {
            idx = (idx - 1 + catOrder.length) % catOrder.length;
        }
        switchReportCategory(catOrder[idx]);
    }
});

// Update status bar
// Dynamically center status bar text in the visible area (accounting for open panels)
function centerStatusBars() {
    // Determine leftmost open panel width
    let leftOffset = 0;
    const reportsPanel = document.getElementById('reportsPanel');
    const evalPanel = document.getElementById('evaluationPanel');
    const attrPanel = document.getElementById('attributesPanel');
    const hubPanel = document.getElementById('hubPanel');

    // Reports panel is widest (384px) and always on top when open
    if (reportsPanel && reportsPanel.classList.contains('open')) {
        leftOffset = 384;
    } else if (hubPanel && hubPanel.classList.contains('open')) {
        leftOffset = 320;
    } else if (attrPanel && attrPanel.classList.contains('open')) {
        leftOffset = 320;
    } else if (evalPanel && evalPanel.classList.contains('open')) {
        leftOffset = 320;
    }

    // Apply to both status bars — use padding-left to shift center point
    const statusBar = document.getElementById('statusBar');
    const reStatusBar = document.getElementById('re-status-bar');
    if (statusBar) statusBar.style.paddingLeft = leftOffset + 'px';
    if (reStatusBar) reStatusBar.style.paddingLeft = leftOffset + 'px';
}

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
    centerStatusBars();
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

        // CHECK HUB FILTER (if active, must pass)
        if (hubFilterState.active) {
            if (!bridgePassesHubFilter(bars)) {
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
    
    // If a both-mode dCR button is active, re-apply its isolation
    if (bothActiveSection && bothActiveCategory) {
        applyBothCategoryFilter();
    } else {
        // Apply count category filter (if active)
        applyCountCategoryFilter();
    }

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
    closeReportExplorerIfOpen();
    const attrPanel = document.getElementById('attributesPanel');
    const condPanel = document.getElementById('evaluationPanel');
    const hubPanel = document.getElementById('hubPanel');

    const attrIsOnTop = attrPanel.classList.contains('ontop');
    const panelsOpen = attrPanel.classList.contains('open');

    if (panelsOpen && attrIsOnTop) {
        attrPanel.classList.remove('open', 'ontop');
        condPanel.classList.remove('open', 'behind');
        if (hubPanel) hubPanel.classList.remove('open', 'ontop');
        hubPanelActive = false;
    } else {
        attrPanel.classList.add('open', 'ontop');
        condPanel.classList.add('open');
        condPanel.classList.remove('behind');
        if (hubPanel) { hubPanel.classList.add('open'); hubPanel.classList.remove('ontop'); }
        if (hubPanelActive) { hubPanelActive = false; updateBridgeSizes(); }
    }
    updateUrlHash();
    centerStatusBars();
};

// Condition filter toggle
window.toggleEvaluationPanel = function() {
    closeReportExplorerIfOpen();
    const attrPanel = document.getElementById('attributesPanel');
    const condPanel = document.getElementById('evaluationPanel');
    const hubPanel = document.getElementById('hubPanel');

    const condIsOnTop = condPanel.classList.contains('open') && !condPanel.classList.contains('behind') && !attrPanel.classList.contains('ontop') && !(hubPanel && hubPanel.classList.contains('ontop'));
    const panelsOpen = condPanel.classList.contains('open');

    if (panelsOpen && condIsOnTop) {
        condPanel.classList.remove('open', 'behind');
        attrPanel.classList.remove('open', 'ontop');
        if (hubPanel) hubPanel.classList.remove('open', 'ontop');
        hubPanelActive = false;
    } else {
        condPanel.classList.add('open');
        condPanel.classList.remove('behind');
        attrPanel.classList.add('open');
        attrPanel.classList.remove('ontop');
        if (hubPanel) { hubPanel.classList.add('open'); hubPanel.classList.remove('ontop'); }
        if (hubPanelActive) { hubPanelActive = false; updateBridgeSizes(); }
    }
    updateUrlHash();
    centerStatusBars();
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
    bridgeType: [],
    bridgeTypeMode: 'multi',  // 'multi' = additive isolate, 'solo' = radio button (one at a time)
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

window.isolate600kBridge = function() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.value = '31A065';
        searchInput.dispatchEvent(new Event('input'));
    }
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
    attributesFilterState.length = { value: sliderMaxValues.length, mode: 'lte' };
    attributesFilterState.width = { value: sliderMaxValues.width, mode: 'lte' };
    attributesFilterState.area = { value: sliderMaxValues.area, mode: 'lte' };
    attributesFilterState.age = { value: sliderMaxValues.age, mode: 'lte' };

    document.getElementById('slider-length').value = 100;
    document.getElementById('value-length').textContent = sliderMaxValues.length.toLocaleString() + ' ft';
    document.getElementById('length-mode-toggle').textContent = '≤ Mode';

    document.getElementById('slider-width').value = 100;
    document.getElementById('value-width').textContent = sliderMaxValues.width.toLocaleString() + ' ft';
    document.getElementById('width-mode-toggle').textContent = '≤ Mode';

    document.getElementById('slider-area').value = 100;
    document.getElementById('value-area').innerHTML = sliderMaxValues.area.toLocaleString() + ' ft<sup>2</sup>';
    document.getElementById('area-mode-toggle').textContent = '≤ Mode';

    document.getElementById('slider-age').value = 100;
    document.getElementById('value-age').textContent = sliderMaxValues.age.toLocaleString() + ' years';
    document.getElementById('age-mode-toggle').textContent = '≤ Mode';

    attributesFilterState.adt = { value: sliderMaxValues.adt, mode: 'lte' };
    document.getElementById('slider-adt').value = 100;
    document.getElementById('value-adt').textContent = sliderMaxValues.adt.toLocaleString();
    document.getElementById('adt-mode-toggle').textContent = '≤ Mode';

    setNhsFilter('all');

    document.getElementById('attr-utilities').checked = false;
    document.querySelectorAll('.on-bridge-cb').forEach(cb => cb.checked = false);
    document.querySelectorAll('.under-bridge-cb').forEach(cb => cb.checked = false);

    // Reset bridge type checkboxes and mode
    attributesFilterState.bridgeType = [];
    attributesFilterState.bridgeTypeMode = 'multi';
    document.querySelectorAll('.bridge-type-cb').forEach(cb => cb.checked = false);
    const btModeBtn = document.getElementById('bridge-type-mode-toggle');
    if (btModeBtn) btModeBtn.textContent = 'SOLO';

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

    // Re-enable all dimension sliders
    ['slider-length', 'slider-width', 'slider-area'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.disabled = false; el.style.opacity = '1'; el.style.cursor = 'pointer'; }
    });

    // Close count report
    closeCountReport();

    applyAttributesFilter();
};

// Setup slider listeners
document.addEventListener('DOMContentLoaded', function() {
    const lengthSlider = document.getElementById('slider-length');
    if (lengthSlider) {
        lengthSlider.addEventListener('input', function() {
            const actualValue = sliderToValue(parseInt(this.value), 0, sliderMaxValues.length, 'length');
            attributesFilterState.length.value = actualValue;
            document.getElementById('value-length').textContent = actualValue.toLocaleString() + ' ft';
            checkDimensionSliders();
            applyAttributesFilter();
        });
        lengthSlider.addEventListener('change', function() {
            if (attributesFilterState.length.value < sliderMaxValues.length) {
                setTimeout(autoZoomToFilteredBridges, 100);
            }
        });
    }

    const widthSlider = document.getElementById('slider-width');
    if (widthSlider) {
        widthSlider.addEventListener('input', function() {
            const actualValue = sliderToValue(parseInt(this.value), 0, sliderMaxValues.width, 'width');
            attributesFilterState.width.value = actualValue;
            document.getElementById('value-width').textContent = actualValue.toLocaleString() + ' ft';
            checkDimensionSliders();
            applyAttributesFilter();
        });
        widthSlider.addEventListener('change', function() {
            if (attributesFilterState.width.value < sliderMaxValues.width) {
                setTimeout(autoZoomToFilteredBridges, 100);
            }
        });
    }

    const areaSlider = document.getElementById('slider-area');
    if (areaSlider) {
        areaSlider.addEventListener('input', function() {
            const actualValue = sliderToValue(parseInt(this.value), 0, sliderMaxValues.area, 'area');
            attributesFilterState.area.value = actualValue;
            document.getElementById('value-area').innerHTML = actualValue.toLocaleString() + ' ft<sup>2</sup>';
            checkDimensionSliders();
            applyAttributesFilter();
        });
        areaSlider.addEventListener('change', function() {
            if (attributesFilterState.area.value < sliderMaxValues.area) {
                setTimeout(autoZoomToFilteredBridges, 100);
            }
        });
    }

    const ageSlider = document.getElementById('slider-age');
    if (ageSlider) {
        ageSlider.addEventListener('input', function() {
            const rawValue = sliderToValue(parseInt(this.value), 0, sliderMaxValues.age, 'age');
            // Round to nearest 5 years
            const actualValue = Math.round(rawValue / 5) * 5;
            attributesFilterState.age.value = actualValue;
            document.getElementById('value-age').textContent = actualValue.toLocaleString() + ' years';
            checkDimensionSliders();
            applyAttributesFilter();
        });
        ageSlider.addEventListener('change', function() {
            if (attributesFilterState.age.value < sliderMaxValues.age) {
                setTimeout(autoZoomToFilteredBridges, 100);
            }
        });
    }

    const adtSlider = document.getElementById('slider-adt');
    if (adtSlider) {
        adtSlider.addEventListener('input', function() {
            const actualValue = sliderToValue(parseInt(this.value), 0, sliderMaxValues.adt, 'adt');
            attributesFilterState.adt.value = actualValue;
            document.getElementById('value-adt').textContent = actualValue.toLocaleString();
            applyAttributesFilter();
        });
        adtSlider.addEventListener('change', function() {
            if (attributesFilterState.adt.value < sliderMaxValues.adt) {
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
            const val = this.value.trim().toLowerCase();
            // Easter eggs
            if (val === 'rick' || val === 'astley' || val === 'rick astley') {
                showRickRoll();
                return;
            }
            if (val === '42') {
                showHitchhikerEgg();
                return;
            }
            if (val === 'wv' || val === 'country roads') {
                showCountryRoadsEgg();
                return;
            }
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
    crManuallyHidden = false;
    // Check if any filter is active
    const isActive =
        attributesFilterState.showNA ||
        attributesFilterState.length.value < sliderMaxValues.length ||
        attributesFilterState.width.value < sliderMaxValues.width ||
        attributesFilterState.area.value < sliderMaxValues.area ||
        attributesFilterState.age.value < sliderMaxValues.age ||
        attributesFilterState.adt.value < sliderMaxValues.adt ||
        attributesFilterState.nhs !== 'all' ||
        attributesFilterState.utilities ||
        attributesFilterState.onBridge.length > 0 ||
        attributesFilterState.underBridge.length > 0 ||
        attributesFilterState.bridgeType.length > 0 ||
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
        centerStatusBars();
    }

    // Reapply bridge visibility
    updateBridgeSizes();

    // Auto-zoom to filtered bridges when filter is active
    if (isActive) {
        autoZoomToFilteredBridges();
    }

    updateUrlHash();
}

// Check if bridge passes attributes filter
function bridgePassesAttributesFilter(bridge) {
    if (!attributesFilterState.active) return true;
    
    // NA mode: when showNA is checked, ONLY show bridges with N/A data
    // When showNA is unchecked, hide bridges with N/A data for active dimensions
    if (attributesFilterState.showNA) {
        // Exclusive NA mode — bridge must have N/A in at least one dimension
        // If sliders are moved, check only active dimensions; otherwise check all four
        const lengthActive = attributesFilterState.length.value < sliderMaxValues.length;
        const widthActive = attributesFilterState.width.value < sliderMaxValues.width;
        const areaActive = attributesFilterState.area.value < sliderMaxValues.area;
        const ageActive = attributesFilterState.age.value < sliderMaxValues.age;
        const adtActive = attributesFilterState.adt.value < sliderMaxValues.adt;
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
        if (attributesFilterState.length.value < sliderMaxValues.length) {
            const length = parseFloat(bridge.bridge_length);
            if (isNaN(length) || length === 0) return false;
        }
        if (attributesFilterState.width.value < sliderMaxValues.width) {
            const width = parseFloat(bridge.width_out_to_out);
            if (isNaN(width) || width === 0) return false;
        }
        if (attributesFilterState.area.value < sliderMaxValues.area) {
            const area = parseFloat(bridge.bridge_area);
            if (isNaN(area) || area === 0) return false;
        }
        if (attributesFilterState.age.value < sliderMaxValues.age) {
            const age = parseInt(bridge.bridge_age);
            if (isNaN(age) || age === 0) return false;
        }
        if (attributesFilterState.adt.value < sliderMaxValues.adt) {
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
    if (attributesFilterState.adt.value < sliderMaxValues.adt) {
        const adt = parseInt(bridge.adt) || 0;
        if (attributesFilterState.adt.mode === 'lte' && adt > attributesFilterState.adt.value) return false;
        if (attributesFilterState.adt.mode === 'gte' && adt < attributesFilterState.adt.value) return false;
    }

    // NHS filter
    if (attributesFilterState.nhs === 'yes' && bridge.nhs !== 'Yes') return false;
    if (attributesFilterState.nhs === 'no' && bridge.nhs === 'Yes') return false;
    
    // Utilities filter
    if (attributesFilterState.utilities && bridge.utilities_on_bridge !== 'Yes') return false;

    // Bridge Type filter
    if (attributesFilterState.bridgeType.length > 0) {
        if (!attributesFilterState.bridgeType.includes(bridge.bridge_type_code || '')) return false;
    }

    // On Bridge filter — AND logic (all checked categories must match)
    if (attributesFilterState.onBridge.length > 0) {
        const onBridge = (bridge.on_bridge || '').charAt(0);
        for (const values of attributesFilterState.onBridge) {
            if (!values.includes(onBridge)) return false;
        }
    }

    // Under Bridge filter — AND logic (all checked categories must match)
    if (attributesFilterState.underBridge.length > 0) {
        const underBridge = (bridge.under_bridge || '').charAt(0);
        for (const values of attributesFilterState.underBridge) {
            if (!values.includes(underBridge)) return false;
        }
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
const sliderMaxValues = { length: 4020, width: 880, area: 403000, age: 210, adt: 150000 };

function buildQuantileTables() {
    const fields = {
        length: { getter: b => parseFloat(b.bridge_length) || 0, round: v => Math.ceil(v / 10) * 10 },
        width:  { getter: b => parseFloat(b.width_out_to_out) || 0, round: v => Math.ceil(v / 10) * 10 },
        area:   { getter: b => parseFloat(b.bridge_area) || 0, round: v => Math.ceil(v / 1000) * 1000 },
        age:    { getter: b => parseInt(b.bridge_age) || 0, round: v => Math.ceil(v / 10) * 10 },
        adt:    { getter: b => parseInt(b.adt) || 0, round: v => Math.ceil(v / 1000) * 1000 }
    };

    // Compute max from data
    Object.entries(fields).forEach(([key, cfg]) => {
        let values = bridgesData.map(cfg.getter).filter(v => v > 0).sort((a, b) => a - b);
        // Exclude the 600k ADT outlier from max/quantile computation (it gets its own button)
        if (key === 'adt') values = values.filter(v => v < 500000);
        const rawMax = Math.max(...values);
        sliderMaxValues[key] = cfg.round(rawMax);

        // Build 101-point table (positions 0-100)
        const table = new Array(101);
        table[0] = 0;
        for (let i = 1; i <= 97; i++) {
            const idx = Math.min(Math.round((i / 100) * (values.length - 1)), values.length - 1);
            table[i] = Math.round(values[idx]);
        }
        // Smooth ramp from p97 data value to computed max over positions 98-100
        const p97val = table[97];
        table[98] = Math.round(p97val + (sliderMaxValues[key] - p97val) * 0.33);
        table[99] = Math.round(p97val + (sliderMaxValues[key] - p97val) * 0.66);
        table[100] = sliderMaxValues[key];
        quantileTables[key] = table;
    });

    // Update filter state defaults to use computed maxes
    attributesFilterState.length.value = sliderMaxValues.length;
    attributesFilterState.width.value = sliderMaxValues.width;
    attributesFilterState.area.value = sliderMaxValues.area;
    attributesFilterState.age.value = sliderMaxValues.age;
    attributesFilterState.adt.value = sliderMaxValues.adt;

    console.log('✓ Built quantile tables for slider normalization', sliderMaxValues);
}

function updateSliderLabels() {
    const labels = {
        length: { id: 'max-label-length', valueId: 'value-length', fmt: v => v.toLocaleString() + ' ft', maxFmt: v => v.toLocaleString() },
        width:  { id: 'max-label-width',  valueId: 'value-width',  fmt: v => v.toLocaleString() + ' ft', maxFmt: v => v.toLocaleString() },
        area:   { id: 'max-label-area',   valueId: 'value-area',   fmt: v => v.toLocaleString() + ' ft<sup>2</sup>', maxFmt: v => v.toLocaleString() },
        age:    { id: 'max-label-age',    valueId: 'value-age',    fmt: v => v.toLocaleString() + ' years', maxFmt: v => v.toLocaleString() },
        adt:    { id: 'max-label-adt',    valueId: 'value-adt',    fmt: v => v.toLocaleString(), maxFmt: v => v.toLocaleString() }
    };
    Object.entries(labels).forEach(([key, cfg]) => {
        const maxLabel = document.getElementById(cfg.id);
        if (maxLabel) maxLabel.textContent = cfg.maxFmt(sliderMaxValues[key]);
        const valueEl = document.getElementById(cfg.valueId);
        if (valueEl) {
            if (key === 'area') {
                valueEl.innerHTML = cfg.fmt(sliderMaxValues[key]);
            } else {
                valueEl.textContent = cfg.fmt(sliderMaxValues[key]);
            }
        }
    });
}

let bridgeTypeCounts = {};
let bridgeTypeSortMode = 'count'; // 'alpha' or 'count'

function buildBridgeTypeCheckboxes() {
    // Count occurrences of each bridge_type_code
    bridgeTypeCounts = {};
    bridgesData.forEach(b => {
        const code = b.bridge_type_code || '';
        if (code) {
            bridgeTypeCounts[code] = (bridgeTypeCounts[code] || 0) + 1;
        }
    });

    renderBridgeTypeCheckboxes();
    console.log(`✓ Built ${Object.keys(bridgeTypeCounts).length} bridge type checkboxes`);
}

function renderBridgeTypeCheckboxes() {
    const container = document.getElementById('bridge-type-checkboxes');
    if (!container) return;

    // Sort based on current mode
    const codes = Object.keys(bridgeTypeCounts);
    if (bridgeTypeSortMode === 'alpha') {
        codes.sort();
    } else {
        codes.sort((a, b) => bridgeTypeCounts[b] - bridgeTypeCounts[a] || a.localeCompare(b));
    }

    // Preserve checked state
    const checked = new Set(attributesFilterState.bridgeType);

    // Generate checkbox HTML
    container.innerHTML = codes.map(code =>
        `<label class="checkbox-label" style="display: block; padding: 2px 0; font-size: 9pt; white-space: nowrap;">` +
        `<input type="checkbox" class="bridge-type-cb" value="${code}"${checked.has(code) ? ' checked' : ''} style="margin-right: 6px;">` +
        `${code} <span style="color: rgba(255,255,255,0.5);">(${bridgeTypeCounts[code]})</span></label>`
    ).join('');

    // Attach change listeners
    container.querySelectorAll('.bridge-type-cb').forEach(cb => {
        cb.addEventListener('change', function() {
            if (attributesFilterState.bridgeTypeMode === 'solo' && this.checked) {
                // Radio behavior: uncheck all others
                container.querySelectorAll('.bridge-type-cb').forEach(other => {
                    if (other !== this) other.checked = false;
                });
                attributesFilterState.bridgeType = [this.value];
            } else if (this.checked) {
                attributesFilterState.bridgeType.push(this.value);
            } else {
                attributesFilterState.bridgeType = attributesFilterState.bridgeType.filter(v => v !== this.value);
            }
            applyAttributesFilter();
        });
    });
}

window.toggleBridgeTypeSort = function() {
    bridgeTypeSortMode = bridgeTypeSortMode === 'alpha' ? 'count' : 'alpha';
    document.getElementById('bridge-type-sort-toggle').textContent = bridgeTypeSortMode === 'alpha' ? '#' : 'A-Z';
    renderBridgeTypeCheckboxes();
};

window.toggleBridgeTypeMode = function() {
    const btn = document.getElementById('bridge-type-mode-toggle');
    const container = document.getElementById('bridge-type-checkboxes');
    if (attributesFilterState.bridgeTypeMode === 'multi') {
        attributesFilterState.bridgeTypeMode = 'solo';
        btn.textContent = 'MULTI';  // clicking will switch to multi
        // If multiple checked, keep only the first
        if (attributesFilterState.bridgeType.length > 1) {
            const keep = attributesFilterState.bridgeType[0];
            attributesFilterState.bridgeType = [keep];
            if (container) {
                container.querySelectorAll('.bridge-type-cb').forEach(cb => {
                    cb.checked = cb.value === keep;
                });
            }
            applyAttributesFilter();
        }
    } else {
        attributesFilterState.bridgeTypeMode = 'multi';
        btn.textContent = 'SOLO';  // clicking will switch to solo
    }
};

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
    const lengthActive = attributesFilterState.length.value < sliderMaxValues.length;
    const widthActive = attributesFilterState.width.value < sliderMaxValues.width;
    const areaActive = attributesFilterState.area.value < sliderMaxValues.area;

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
            attributesFilterState.area.value = sliderMaxValues.area;
            document.getElementById('value-area').innerHTML = sliderMaxValues.area.toLocaleString() + ' ft<sup>2</sup>';
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
            attributesFilterState.width.value = sliderMaxValues.width;
            document.getElementById('value-width').textContent = sliderMaxValues.width.toLocaleString() + ' ft';
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
            attributesFilterState.length.value = sliderMaxValues.length;
            document.getElementById('value-length').textContent = sliderMaxValues.length.toLocaleString() + ' ft';
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
        // Calculate left padding based on which panel is open
        let leftPad = 50;
        const reportsPanel = document.getElementById('reportsPanel');
        const evalPanel = document.getElementById('evaluationPanel');
        const attrPanel = document.getElementById('attributesPanel');
        const hubPanel = document.getElementById('hubPanel');
        if (reportsPanel && reportsPanel.classList.contains('open')) {
            leftPad = 384 + 30;
        } else if (hubPanel && hubPanel.classList.contains('open')) {
            leftPad = 320 + 30;
        } else if (attrPanel && attrPanel.classList.contains('open')) {
            leftPad = 320 + 30;
        } else if (evalPanel && evalPanel.classList.contains('open')) {
            leftPad = 320 + 30;
        }
        map.fitBounds(bounds, {
            paddingTopLeft: [leftPad, 50],
            paddingBottomRight: [50, 50],
            maxZoom: 12,
            animate: true,
            duration: 0.5
        });
        console.log(`Auto-zoomed to ${count} filtered bridges (leftPad: ${leftPad})`);
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

    const btnStyle = 'display: flex; justify-content: space-between; align-items: center; width: 100%; padding: 4px 8px; margin-bottom: 2px; background: transparent; border: 2px solid rgba(255,255,255,0.2); border-radius: 4px; cursor: pointer; transition: all 0.2s;';
    const dotStyle = 'width: 10px; height: 10px; border-radius: 50%; border: 1px solid #fff;';
    const labelStyle = 'color: #fff; font-weight: 600; font-size: 9pt;';
    const countStyle = 'color: #fff; font-size: 10pt; font-weight: 700;';

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
                    <span onclick="event.stopPropagation(); toggleCategoryTablePopup('critical','insp')"
                          style="cursor:pointer; font-size:11pt; color:#FFB81C; opacity:1;" title="View table">☰</span>
                </div>
            </button>`;
            html += `<button id="btn-emergent" onclick="toggleCountCategory('emergent')" style="${btnStyle}">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="${dotStyle} background: #F97316;"></div>
                    <span style="${labelStyle}">Upcoming</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="${countStyle}" id="count-emergent">0</span>
                    <span onclick="event.stopPropagation(); toggleCategoryTablePopup('emergent','insp')"
                          style="cursor:pointer; font-size:11pt; color:#FFB81C; opacity:1;" title="View table">☰</span>
                </div>
            </button>`;
            html += `<button id="btn-satisfactory" onclick="toggleCountCategory('satisfactory')" style="${btnStyle}">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="${dotStyle} background: #10B981;"></div>
                    <span style="${labelStyle}">Completed</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="${countStyle}" id="count-satisfactory">0</span>
                    <span onclick="event.stopPropagation(); toggleCategoryTablePopup('satisfactory','insp')"
                          style="cursor:pointer; font-size:11pt; color:#FFB81C; opacity:1;" title="View table">☰</span>
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
                    <span onclick="event.stopPropagation(); toggleCategoryTablePopup('critical','maint')"
                          style="cursor:pointer; font-size:11pt; color:#FFB81C; opacity:1;" title="View table">☰</span>
                </div>
            </button>`;
            html += `<button id="btn-emergent" onclick="toggleCountCategory('emergent')" style="${btnStyle}">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="${dotStyle} background: #F97316;"></div>
                    <span style="${labelStyle}">Emergent</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="${countStyle}" id="count-emergent">0</span>
                    <span onclick="event.stopPropagation(); toggleCategoryTablePopup('emergent','maint')"
                          style="cursor:pointer; font-size:11pt; color:#FFB81C; opacity:1;" title="View table">☰</span>
                </div>
            </button>`;
            html += `<button id="btn-satisfactory" onclick="toggleCountCategory('satisfactory')" style="${btnStyle}">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="${dotStyle} background: #10b981;"></div>
                    <span style="${labelStyle}">Satisfactory</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="${countStyle}" id="count-satisfactory">0</span>
                    <span onclick="event.stopPropagation(); toggleCategoryTablePopup('satisfactory','maint')"
                          style="cursor:pointer; font-size:11pt; color:#FFB81C; opacity:1;" title="View table">☰</span>
                </div>
            </button>`;
        }
    } else if (mode === 'both') {
        // Dual-section mode: Maintenance + Inspection
        const sectionBtnStyle = 'display: flex; justify-content: space-between; align-items: center; width: 100%; padding: 3px 8px; margin-top: 2px; margin-bottom: 2px; background: rgba(0, 40, 85, 0.5); border: 2px solid rgba(255,184,28,0.4); border-radius: 4px; cursor: pointer; transition: all 0.2s;';
        const sectionLabelSpanStyle = 'color: #FFB81C; font-weight: 700; font-size: 8pt; text-transform: uppercase; letter-spacing: 1.5px;';
        const sectionCountStyle = 'color: #FFB81C; font-size: 9pt; font-weight: 700;';

        // — Maintenance section total button —
        html += `<button id="btn-maint-total" onclick="toggleBothCategory('maint','total')" style="${sectionBtnStyle}" data-tip="Show all bridges in the maintenance condition theme — colored by worst component rating (red = critical, orange = emergent, green = satisfactory).">
            <span style="${sectionLabelSpanStyle}">Maintenance</span>
        </button>`;
        html += `<button id="btn-maint-critical" onclick="toggleBothCategory('maint','critical')" style="${btnStyle}" data-tip="Isolate bridges with a worst condition rating of 1 (critical). Click again to deselect.">
            <div style="display: flex; align-items: center; gap: 8px;">
                <div style="${dotStyle} background: #dc2626;"></div>
                <span style="${labelStyle}">Critical</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
                <span style="${countStyle}" id="count-maint-critical">0</span>
                <span onclick="event.stopPropagation(); toggleCategoryTablePopup('critical','maint')"
                      style="cursor:pointer; font-size:11pt; color:#FFB81C; opacity:1;" title="View table">☰</span>
            </div>
        </button>`;
        html += `<button id="btn-maint-emergent" onclick="toggleBothCategory('maint','emergent')" style="${btnStyle}" data-tip="Isolate bridges with a worst condition rating of 2–4 (emergent). Click again to deselect.">
            <div style="display: flex; align-items: center; gap: 8px;">
                <div style="${dotStyle} background: #F97316;"></div>
                <span style="${labelStyle}">Emergent</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
                <span style="${countStyle}" id="count-maint-emergent">0</span>
                <span onclick="event.stopPropagation(); toggleCategoryTablePopup('emergent','maint')"
                      style="cursor:pointer; font-size:11pt; color:#FFB81C; opacity:1;" title="View table">☰</span>
            </div>
        </button>`;
        html += `<button id="btn-maint-satisfactory" onclick="toggleBothCategory('maint','satisfactory')" style="${btnStyle}" data-tip="Isolate bridges with a worst condition rating of 5–9 (satisfactory). Click again to deselect.">
            <div style="display: flex; align-items: center; gap: 8px;">
                <div style="${dotStyle} background: #10b981;"></div>
                <span style="${labelStyle}">Satisfactory</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
                <span style="${countStyle}" id="count-maint-satisfactory">0</span>
                <span onclick="event.stopPropagation(); toggleCategoryTablePopup('satisfactory','maint')"
                      style="cursor:pointer; font-size:11pt; color:#FFB81C; opacity:1;" title="View table">☰</span>
            </div>
        </button>`;

        // — Inspection section total button —
        html += `<button id="btn-insp-total" onclick="toggleBothCategory('insp','total')" style="${sectionBtnStyle} margin-top: 6px; border-top: 1px solid rgba(255,255,255,0.15);" data-tip="Show all bridges in the inspection theme — colored by due-date status (red gradient = past due, orange = upcoming, green = completed).">
            <span style="${sectionLabelSpanStyle}">Inspection</span>
        </button>`;
        html += `<button id="btn-insp-critical" onclick="toggleBothCategory('insp','critical')" style="${btnStyle}" data-tip="Isolate bridges with at least one inspection past its due date. Click again to deselect.">
            <div style="display: flex; align-items: center; gap: 8px;">
                <div style="${dotStyle} background: #dc2626;"></div>
                <span style="${labelStyle}">Past Due</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
                <span style="${countStyle}" id="count-insp-critical">0</span>
                <span onclick="event.stopPropagation(); toggleCategoryTablePopup('critical','both-insp')"
                      style="cursor:pointer; font-size:11pt; color:#FFB81C; opacity:1;" title="View table">☰</span>
            </div>
        </button>`;
        html += `<button id="btn-insp-emergent" onclick="toggleBothCategory('insp','emergent')" style="${btnStyle}" data-tip="Isolate bridges with inspections due within the next 60 days. Click again to deselect.">
            <div style="display: flex; align-items: center; gap: 8px;">
                <div style="${dotStyle} background: #F97316;"></div>
                <span style="${labelStyle}">Upcoming</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
                <span style="${countStyle}" id="count-insp-emergent">0</span>
                <span onclick="event.stopPropagation(); toggleCategoryTablePopup('emergent','both-insp')"
                      style="cursor:pointer; font-size:11pt; color:#FFB81C; opacity:1;" title="View table">☰</span>
            </div>
        </button>`;
        html += `<button id="btn-insp-satisfactory" onclick="toggleBothCategory('insp','satisfactory')" style="${btnStyle}" data-tip="Isolate bridges with all inspections completed and not due for 60+ days. Click again to deselect.">
            <div style="display: flex; align-items: center; gap: 8px;">
                <div style="${dotStyle} background: #10B981;"></div>
                <span style="${labelStyle}">Completed</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
                <span style="${countStyle}" id="count-insp-satisfactory">0</span>
                <span onclick="event.stopPropagation(); toggleCategoryTablePopup('satisfactory','both-insp')"
                      style="cursor:pointer; font-size:11pt; color:#FFB81C; opacity:1;" title="View table">☰</span>
            </div>
        </button>`;
    }

    // Separator before shared buttons in 'both' mode
    if (mode === 'both') {
        html += `<div style="margin-top: 6px; border-top: 1px solid rgba(255,255,255,0.15); padding-top: 4px;"></div>`;
    }

    // N/A — always present
    html += `<button id="btn-na" onclick="toggleCountCategory('na')" style="${btnStyle}" data-tip="Isolate bridges with missing or invalid condition ratings. Click again to restore all.">
        <div style="display: flex; align-items: center; gap: 8px;">
            <div style="${dotStyle} background: #6b7280;"></div>
            <span style="${labelStyle}">N/A</span>
        </div>
        <span style="${countStyle}" id="count-na">0</span>
    </button>`;

    // HUB Data — always present (extra bottom margin before Total)
    // Cycles through 3 modes: Off (blue) → Rings (yellow) → Theme (green)
    html += `<button id="btn-hubdata" onclick="toggleProjectRings()" style="${btnStyle} margin-bottom: 6px;" data-tip="Cycle HUB Data display: Off, Rings around project bridges, or Full green highlight. Three clicks to cycle through all modes.">
        <div style="display: flex; align-items: center; gap: 8px;">
            <div id="hubdata-dot" style="${dotStyle} background: #22c55e;"></div>
            <span id="hubdata-label" style="${labelStyle}">HUB Data</span>
        </div>
        <span style="${countStyle}" id="count-hubdata">0</span>
    </button>`;

    // Total — always present
    html += `<button id="btn-total" onclick="toggleCountCategory('total')" style="display: flex; justify-content: space-between; align-items: center; width: 100%; padding: 4px 8px; background: rgba(0, 40, 85, 0.5); border: 2px solid var(--wvdoh-yellow); border-radius: 4px; cursor: pointer; transition: all 0.2s;" data-tip="Reset to the default district-colored view showing all bridges (except N/A). Clears any active category isolation.">
        <span style="color: var(--wvdoh-yellow); font-weight: 700; font-size: 9pt; text-transform: uppercase; letter-spacing: 1px;">TOTAL</span>
        <span style="color: var(--wvdoh-yellow); font-size: 10pt; font-weight: 700;" id="count-total">0</span>
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

// Categorize a bridge by condition ratings only (maintenance section)
function getMaintenanceCategoryForBridge(bridge) {
    const ratingMap = {
        deck: bridge.deck_rating,
        superstructure: bridge.superstructure_rating,
        substructure: bridge.substructure_rating,
        bearings: bridge.bearings_rating,
        joints: bridge.joints_rating
    };

    // If evaluation sliders active, use only the active slider components
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

    const ratings = Object.values(ratingMap)
        .filter(r => typeof r === 'number' && !isNaN(r) && r >= 1 && r <= 9);
    if (ratings.length === 0) return 'na';
    const worst = Math.min(...ratings);
    if (worst <= 1) return 'critical';
    if (worst <= 4) return 'emergent';
    return 'satisfactory';
}

// Categorize a bridge by inspection due dates only (inspection section)
function getInspectionCategoryForBridge(bridge) {
    const inspections = inspectionsData[bridge.bars_number];
    if (!inspections) return 'na';

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

    if (hasOverdue) return 'critical';
    if (hasUpcoming) return 'emergent';
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

        // HUB filter
        if (hubFilterState.active) {
            if (!bridgePassesHubFilter(bars)) return;
        }

        // Box select exclusion
        if (boxExcludedBars.has(bars)) return;

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

// Calculate inspection counts for 'both' mode CR (parallel to calculateMaxBridgeCounts)
function calculateInspectionCounts() {
    let critical = 0;   // Past Due
    let emergent = 0;   // Upcoming (within 60 days)
    let satisfactory = 0; // Completed / future
    let na = 0;

    const today = new Date();
    const sixtyDays = new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000);

    Object.entries(bridgeLayers).forEach(([bars, marker]) => {
        const bridge = marker.bridgeData;
        if (!bridge) return;

        // Apply same base filters as calculateMaxBridgeCounts
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

        if (boxExcludedBars.has(bars)) return;

        // Inspection categorization
        const inspections = inspectionsData[bars];
        if (!inspections || inspections.length === 0) {
            na++;
            return;
        }

        let hasOverdue = false, hasUpcoming = false;

        inspections.forEach(insp => {
            const due = parseDateString(insp.due);
            if (!due) return;
            if (due < today) hasOverdue = true;
            else if (due <= sixtyDays) hasUpcoming = true;
        });

        if (hasOverdue) critical++;
        else if (hasUpcoming) emergent++;
        else satisfactory++;
    });

    return { critical, emergent, satisfactory, na, total: critical + emergent + satisfactory + na };
}

// Category label mapping for inspection CR table popups
const categoryLabels = {
    critical: 'Past Due',
    emergent: 'Upcoming',
    satisfactory: 'Completed'
};

// Toggle category table popup — clicking hamburger again hides it
function toggleCategoryTablePopup(category, mode) {
    const existing = document.getElementById('category-table-popup');
    if (existing) {
        existing.remove();
        return;
    }
    if (mode === 'maint') {
        showMaintenanceCategoryTable(category);
    } else if (mode === 'both-insp') {
        showCategoryTableForBothMode(category);
    } else {
        showCategoryTable(category);
    }
}

// Show a detail table popup for a CR inspection category
function showCategoryTable(category) {
    removeReportHighlight();
    const savedPos = _saveCategoryPopupPos();
    const label = getInspectionTableTitle(category);
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

        // Box select exclusion
        if (boxExcludedBars.has(bars)) return;

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
        const dueFmt = worstDue ? ((worstDue.getMonth()+1)+'/'+worstDue.getDate()+'/'+String(worstDue.getFullYear()).slice(-2)) : (worstInsp.due || '');
        // Completion date and "days since" for Completed category
        const compDate = parseDateString(worstInsp.completion);
        const compDateStr = compDate ? ((compDate.getMonth()+1)+'/'+compDate.getDate()+'/'+String(compDate.getFullYear()).slice(-2)) : '';
        const daysSince = compDate ? Math.floor((today - compDate) / 86400000) : null;

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
            dueDateStr: dueFmt,
            days: worstDays,
            completionDateStr: compDateStr,
            daysSince: daysSince
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
    const label = getInspectionTableTitle(category);
    const isCompleted = category === 'satisfactory';
    const daysColHeader = category === 'critical' ? 'Days Past Due' : isCompleted ? 'Since' : 'Due';

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
        if (isCompleted) {
            daysText = r.daysSince != null ? `${r.daysSince}d` : '—';
            rowStyle = '';
        } else if (r.days > 0) {
            daysText = `${r.days}`;
            rowStyle = 'background: rgba(220, 38, 38, 0.2); color: #FCA5A5;';
        } else if (r.days === 0) {
            daysText = 'Today';
            rowStyle = 'background: rgba(245, 158, 11, 0.15);';
        } else {
            daysText = `in ${Math.abs(r.days)} days`;
            rowStyle = '';
        }

        if (isCompleted) {
            tableRows += `<tr style="${rowStyle} border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
                <td style="padding: 6px 8px; text-align: center;">${i + 1}</td>
                <td style="padding: 6px 8px;">${r.district.replace('District ', '')}</td>
                <td style="padding: 6px 8px;"><a href="${r.barsLink}" target="_blank" style="color: #60A5FA; text-decoration: underline;">${r.bars}</a></td>
                <td class="col-name" style="padding: 6px 8px;"><a href="${mapsLink}" target="_blank" style="color: #60A5FA; text-decoration: underline;">${titleCaseName}</a></td>
                <td style="padding: 6px 8px;">${r.type}</td>
                <td style="padding: 6px 8px; text-align: center;">${r.completionDateStr || '—'}</td>
                <td style="padding: 6px 8px; text-align: center;">${r.interval}</td>
                <td style="padding: 6px 8px; text-align: center;">${daysText}</td>
                <td style="padding: 6px 8px; text-align: center;">${r.dueDateStr}</td>
            </tr>`;
        } else {
            tableRows += `<tr style="${rowStyle} border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
                <td style="padding: 6px 8px; text-align: center;">${i + 1}</td>
                <td style="padding: 6px 8px;">${r.district.replace('District ', '')}</td>
                <td style="padding: 6px 8px;"><a href="${r.barsLink}" target="_blank" style="color: #60A5FA; text-decoration: underline;">${r.bars}</a></td>
                <td class="col-name" style="padding: 6px 8px;"><a href="${mapsLink}" target="_blank" style="color: #60A5FA; text-decoration: underline;">${titleCaseName}</a></td>
                <td style="padding: 6px 8px;">${r.type}</td>
                <td style="padding: 6px 8px; text-align: center;">${r.interval}</td>
                <td style="padding: 6px 8px; text-align: center;">${r.dueDateStr}</td>
                <td style="padding: 6px 8px; text-align: center;">${daysText}</td>
            </tr>`;
        }
    });

    // Remove any existing category table popup
    const existing = document.getElementById('category-table-popup');
    if (existing) existing.remove();

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
            const countEl = document.getElementById(c.countId) || document.getElementById('count-insp-' + c.key);
            const count = countEl ? parseInt(countEl.textContent, 10) : 0;
            const empty = isNaN(count) || count === 0;
            if (isCurrent) {
                return `<button disabled style="${inspNavBtnStyle} background: ${c.color}; color: #fff; cursor: default; opacity: 0.7;">${c.label}</button>`;
            }
            if (empty) {
                return `<button disabled style="${inspNavBtnStyle} background: rgba(255,255,255,0.15); color: rgba(255,255,255,0.3); cursor: default;">${c.label}</button>`;
            }
            return `<button onclick="showCategoryTable('${c.key}')" style="${inspNavBtnStyle} background: ${c.color}; color: #fff; cursor: pointer;">${c.label}</button>`;
        })
        .join('');

    popup.innerHTML = `
        <div class="info-header" id="category-table-header" style="cursor: default;">
            <h3>${label} \u2014 ${rows.length} Bridge${rows.length !== 1 ? 's' : ''}</h3>
            <div style="display: flex; align-items: center; gap: 8px;">
                ${inspNavButtons}
                <button onclick="openCrReportShare(this)" title="Share report"
                   style="background: rgba(255,184,28,0.2); border: 1px solid var(--wvdoh-yellow); color: var(--wvdoh-yellow); padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 9pt; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">&#8599; Share</button>
                <button onclick="exportCategoryCSV(window._categoryTableRows, '${label.replace(/\s+/g, '')}')"
                        style="background: rgba(255,184,28,0.2); border: 1px solid var(--wvdoh-yellow); color: var(--wvdoh-yellow); padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 9pt; font-weight: 600;">Export CSV</button>
                <button class="close-btn" onclick="document.getElementById('category-table-popup').remove()">&#215;</button>
            </div>
        </div>
        <div class="info-content" style="cursor: default;">
            <table style="border-collapse: collapse; font-size: 10pt; color: #fff; cursor: text;">
                ${isCompleted ? `<colgroup>
                    <col style="width: 35px;">
                    <col style="width: 55px;">
                    <col style="width: 85px;">
                    <col>
                    <col style="width: 100px;">
                    <col style="width: 80px;">
                    <col style="width: 60px;">
                    <col style="width: 60px;">
                    <col style="width: 80px;">
                </colgroup>
                <thead>
                    <tr style="background: rgba(0, 40, 85, 0.95); border-bottom: 2px solid #FFB81C; position: sticky; top: 0; z-index: 1;">
                        <th style="${thStyle} text-align: center; cursor: default;">#</th>
                        <th style="${thStyle} text-align: left;" onclick="sortCategoryTable('district')">District${arrow('district')}</th>
                        <th style="${thStyle} text-align: left;" onclick="sortCategoryTable('bars')">BARS${arrow('bars')}</th>
                        <th class="col-name" style="${thStyle} text-align: left;" onclick="sortCategoryTable('name')">Bridge Name${arrow('name')}</th>
                        <th style="${thStyle} text-align: left;" onclick="sortCategoryTable('type')">Type${arrow('type')}</th>
                        <th style="${thStyle} text-align: center;" onclick="sortCategoryTable('completionDateStr')">Completed${arrow('completionDateStr')}</th>
                        <th style="${thStyle} text-align: center;" onclick="sortCategoryTable('interval')">Interval${arrow('interval')}</th>
                        <th style="${thStyle} text-align: center;" onclick="sortCategoryTable('daysSince')">${daysColHeader}${arrow('daysSince')}</th>
                        <th style="${thStyle} text-align: center;" onclick="sortCategoryTable('dueDate')">Due${arrow('dueDate')}</th>
                    </tr>
                </thead>` : `<colgroup>
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
                    <tr style="background: rgba(0, 40, 85, 0.95); border-bottom: 2px solid #FFB81C; position: sticky; top: 0; z-index: 1;">
                        <th style="${thStyle} text-align: center; cursor: default;">#</th>
                        <th style="${thStyle} text-align: left;" onclick="sortCategoryTable('district')">District${arrow('district')}</th>
                        <th style="${thStyle} text-align: left;" onclick="sortCategoryTable('bars')">BARS${arrow('bars')}</th>
                        <th class="col-name" style="${thStyle} text-align: left;" onclick="sortCategoryTable('name')">Bridge Name${arrow('name')}</th>
                        <th style="${thStyle} text-align: left;" onclick="sortCategoryTable('type')">Type${arrow('type')}</th>
                        <th style="${thStyle} text-align: center;" onclick="sortCategoryTable('interval')">Interval${arrow('interval')}</th>
                        <th style="${thStyle} text-align: center;" onclick="sortCategoryTable('dueDate')">Due Date${arrow('dueDate')}</th>
                        <th style="${thStyle} text-align: center;" onclick="sortCategoryTable('days')">${daysColHeader}${arrow('days')}</th>
                    </tr>
                </thead>`}
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
        window._categoryTableSortAsc = (col === 'days' || col === 'daysSince') ? false : true;
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

    const cat = window._categoryTableCategory;
    const isCompleted = cat === 'satisfactory';
    const headers = isCompleted
        ? '#,District,BARS,Bridge Name,Type,Completed,Interval,Days Since,Due Date'
        : '#,District,BARS,Bridge Name,Type,Interval,Due Date,Days Past Due';
    const csvRows = rows.map((r, i) => {
        const titleCaseName = (r.name || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
        if (isCompleted) {
            return `${i + 1},${r.district.replace('District ', '')},"${r.bars}","${titleCaseName}",${r.type},${r.completionDateStr || ''},${r.interval},${r.daysSince != null ? r.daysSince : ''},${r.dueDateStr}`;
        }
        let daysText;
        if (r.days > 0) daysText = r.days;
        else if (r.days === 0) daysText = 0;
        else daysText = -Math.abs(r.days);
        return `${i + 1},${r.district.replace('District ', '')},"${r.bars}","${titleCaseName}",${r.type},${r.interval},${r.dueDateStr},${daysText}`;
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
    return `Maintenance \u2014 ${base} \u2014 ${components}`;
}

function getInspectionTableTitle(category) {
    const base = categoryLabels[category] || category;
    const types = selectedInspectionTypes.length > 0
        ? selectedInspectionTypes.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(' / ')
        : 'All Types';
    return `Inspection \u2014 ${base} \u2014 ${types}`;
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

// Show inspection category table from 'both' mode (temporarily activates inspection logic)
function showCategoryTableForBothMode(category) {
    const wasActive = inspectionFiltersActive;
    const wasSIT = selectedInspectionTypes.slice();
    const wasSM = selectedMonths.slice();
    inspectionFiltersActive = true;
    selectedInspectionTypes = [];
    selectedMonths = [];
    showCategoryTable(category);
    inspectionFiltersActive = wasActive;
    selectedInspectionTypes = wasSIT;
    selectedMonths = wasSM;
}

// Show a detail table popup for a maintenance CR category
function showMaintenanceCategoryTable(category) {
    removeReportHighlight();
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

        // Box select exclusion
        if (boxExcludedBars.has(bars)) return;

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

        // Must match the requested maintenance category (always use maintenance logic)
        if (getMaintenanceCategoryForBridge(bridge) !== category) return;

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
            <td style="padding: 6px 8px;">${r.district.replace('District ', '')}</td>
            <td style="padding: 6px 8px;"><a href="${r.barsLink}" target="_blank" style="color: #60A5FA; text-decoration: underline;">${r.bars}</a></td>
            <td class="col-name" style="padding: 6px 8px;"><a href="${mapsLink}" target="_blank" style="color: #60A5FA; text-decoration: underline;">${titleCaseName}</a></td>
            <td style="padding: 6px 8px; text-align: center;">${highlightRating('deck', r.deck)}</td>
            <td style="padding: 6px 8px; text-align: center;">${highlightRating('superstructure', r.superstructure)}</td>
            <td style="padding: 6px 8px; text-align: center;">${highlightRating('substructure', r.substructure)}</td>
            <td style="padding: 6px 8px; text-align: center;">${highlightRating('bearings', r.bearings)}</td>
            <td style="padding: 6px 8px; text-align: center;">${highlightRating('joints', r.joints)}</td>
            <td style="padding: 6px 8px; text-align: center;">${sliderValues.sufficiency < 100 ? '<span style="color: ' + catColor + '; font-weight: 700;">' + r.sufficiencyDisplay + '</span>' : r.sufficiencyDisplay}</td>
            <td style="padding: 6px 8px; text-align: center;">${nhsDisplay}</td>
            <td style="padding: 6px 8px; text-align: right;">${adtDisplay}</td>
            <td style="padding: 6px 8px; text-align: center;">${adtYearDisplay}</td>
            <td style="padding: 6px 8px; text-align: center;">${ageDisplay}</td>
        </tr>`;
    });

    // Remove any existing popup
    const existing = document.getElementById('category-table-popup');
    if (existing) existing.remove();

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
            const countEl = document.getElementById(c.countId) || document.getElementById('count-maint-' + c.key);
            const count = countEl ? parseInt(countEl.textContent, 10) : 0;
            const empty = isNaN(count) || count === 0;
            if (isCurrent) {
                return `<button disabled style="${navBtnStyle} background: ${c.color}; color: #fff; cursor: default; opacity: 0.7;">${c.label}</button>`;
            }
            if (empty) {
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
            <h3>${label} \u2014 ${rows.length} Bridge${rows.length !== 1 ? 's' : ''}</h3>
            <div style="display: flex; align-items: center; gap: 8px;">
                ${navButtons}
                <button onclick="openCrReportShare(this)" title="Share report"
                   style="background: rgba(255,184,28,0.2); border: 1px solid var(--wvdoh-yellow); color: var(--wvdoh-yellow); padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 9pt; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">&#8599; Share</button>
                <button onclick="exportMaintenanceCategoryCSV(window._maintTableRows, '${csvLabel}')"
                        style="background: rgba(255,184,28,0.2); border: 1px solid var(--wvdoh-yellow); color: var(--wvdoh-yellow); padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 9pt; font-weight: 600;">Export CSV</button>
                <button class="close-btn" onclick="document.getElementById('category-table-popup').remove()">&#215;</button>
            </div>
        </div>
        <div class="info-content" style="cursor: default;">
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
                    <tr style="background: rgba(0, 40, 85, 0.95); border-bottom: 2px solid #FFB81C; position: sticky; top: 0; z-index: 1;">
                        <th style="${thStyle} text-align: center; cursor: default;">#</th>
                        <th style="${thStyle} text-align: left;" onclick="sortMaintenanceCategoryTable('district')">District${arrow('district')}</th>
                        <th style="${thStyle} text-align: left;" onclick="sortMaintenanceCategoryTable('bars')">BARS${arrow('bars')}</th>
                        <th class="col-name" style="${thStyle} text-align: left;" onclick="sortMaintenanceCategoryTable('name')">Bridge Name${arrow('name')}</th>
                        <th style="${thStyle} text-align: center;${thHighlight('deck')}" onclick="sortMaintenanceCategoryTable('deck')">Deck${arrow('deck')}</th>
                        <th style="${thStyle} text-align: center;${thHighlight('superstructure')}" onclick="sortMaintenanceCategoryTable('superstructure')">Super${arrow('superstructure')}</th>
                        <th style="${thStyle} text-align: center;${thHighlight('substructure')}" onclick="sortMaintenanceCategoryTable('substructure')">Sub${arrow('substructure')}</th>
                        <th style="${thStyle} text-align: center;${thHighlight('bearings')}" onclick="sortMaintenanceCategoryTable('bearings')">Bearings${arrow('bearings')}</th>
                        <th style="${thStyle} text-align: center;${thHighlight('joints')}" onclick="sortMaintenanceCategoryTable('joints')">Joints${arrow('joints')}</th>
                        <th style="${thStyle} text-align: center;${sliderValues.sufficiency < 100 ? ' color: ' + catColor + '; font-weight: 700;' : ''}" onclick="sortMaintenanceCategoryTable('sufficiency')">Calc. Suff.${arrow('sufficiency')}</th>
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
        return `${i + 1},${r.district.replace('District ', '')},"${r.bars}","${titleCaseName}",${deckVal},${superVal},${subVal},${bearVal},${jointVal},${suffVal},${nhsText},${adtVal},${adtYearVal},${ageVal}`;
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

    // Always use 'both' mode — all three sections visible at all times
    const filtersEngaged = hasCondition || inspectionFiltersActive || hasAttributes || currentSearchQuery.length > 0;
    const targetMode = 'both';

    // Build/rebuild buttons if mode changed
    buildCountReportButtons(targetMode);

    // Calculate counts for both sections
    maxCounts = calculateMaxBridgeCounts();
    const inspCounts = calculateInspectionCounts();

    // Maintenance counts
    const elMC = document.getElementById('count-maint-critical');
    const elME = document.getElementById('count-maint-emergent');
    const elMS = document.getElementById('count-maint-satisfactory');
    if (elMC) elMC.textContent = maxCounts.critical;
    if (elME) elME.textContent = maxCounts.emergent;
    if (elMS) elMS.textContent = maxCounts.satisfactory;

    // Inspection counts
    const elIC = document.getElementById('count-insp-critical');
    const elIE = document.getElementById('count-insp-emergent');
    const elIS = document.getElementById('count-insp-satisfactory');
    if (elIC) elIC.textContent = inspCounts.critical;
    if (elIE) elIE.textContent = inspCounts.emergent;
    if (elIS) elIS.textContent = inspCounts.satisfactory;

    // Shared bottom buttons
    const elNA = document.getElementById('count-na');
    const elHub = document.getElementById('count-hubdata');
    const elTotal = document.getElementById('count-total');
    if (elNA) elNA.textContent = maxCounts.na;
    if (elHub) elHub.textContent = maxCounts.hubdata;
    if (elTotal) elTotal.textContent = maxCounts.total;

    // N/A button
    const btnNA2 = document.getElementById('btn-na');
    if (btnNA2) {
        btnNA2.disabled = false;
        btnNA2.style.cursor = 'pointer';
        btnNA2.title = 'Click to isolate N/A bridges';
    }

    // HUB Data button — cycles through 3 modes (off/rings/theme)
    const btnHubdata = document.getElementById('btn-hubdata');
    if (btnHubdata) {
        btnHubdata.disabled = false;
        btnHubdata.style.cursor = 'pointer';
        btnHubdata.title = hubDataMode === 0 ? 'Click to show HUB Data rings' :
                           hubDataMode === 1 ? 'Click for HUB Data theme mode' :
                                               'Click to turn off HUB Data';
        styleCRHubButton();
    }

    // Total button
    const btnTotal = document.getElementById('btn-total');
    if (btnTotal) {
        btnTotal.disabled = false;
        btnTotal.style.cursor = 'pointer';
        btnTotal.title = 'Show all bridges (except N/A)';
        btnTotal.style.opacity = '1';
    }

    // Update both-mode button styles
    updateBothButtonStyles();

    // Show the dCR unless user manually closed it
    const countReport = document.getElementById('countReport');
    if (!crManuallyHidden && maxCounts.total > 0 && countReport.style.display !== 'block') {
        countReport.style.display = 'block';
    }
}

// CR is now fixed-position bottom-right — no dynamic positioning needed
function positionCountReportOutsideBridges() {
    // No-op: CR uses position:fixed bottom:20px right:20px in CSS
}

// Update button visual states
function updateButtonStyles() {
    // Only shared/single-mode buttons — both-mode buttons handled by updateBothButtonStyles()
    const buttons = [
        { id: 'btn-critical',          key: 'critical',     color: '#dc2626' },
        { id: 'btn-emergent',          key: 'emergent',     color: '#F97316' },
        { id: 'btn-completed',         key: 'completed',    color: '#10B981' },
        { id: 'btn-satisfactory',      key: 'satisfactory', color: '#10b981' },
        { id: 'btn-na',                key: 'na',           color: '#6b7280' }
        // btn-hubdata styled separately by styleCRHubButton() based on hubDataMode
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

// Toggle category visibility (N/A, Total — shared buttons in dCR)
window.toggleCountCategory = function(category) {
    // Close the category detail table popup if open
    const catPopup = document.getElementById('category-table-popup');
    if (catPopup) catPopup.remove();

    // Clear any both-mode section isolation when using shared buttons
    bothActiveSection = null;
    bothActiveCategory = null;

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
    updateBothButtonStyles();  // Reset both-mode button visuals (cleared above)
    updateProjectRings();
    syncHubButton();

    // Auto-zoom
    setTimeout(autoZoomToFilteredBridges, 100);
    updateUrlHash();
};

// Toggle a both-mode (dCR) category button — independent maint/insp sections
window.toggleBothCategory = function(section, category) {
    // Close any open detail table popup
    const catPopup = document.getElementById('category-table-popup');
    if (catPopup) catPopup.remove();

    // Reset shared countCategoryState to defaults (clear any N/A/Total/HUB isolation)
    countCategoryState.critical = true;
    countCategoryState.emergent = true;
    countCategoryState.satisfactory = true;
    countCategoryState.completed = true;
    countCategoryState.na = false;
    countCategoryState.hubdata = false;
    countCategoryState.total = true;
    Object.keys(categoryClickState).forEach(k => categoryClickState[k] = 0);

    if (bothActiveSection === section && bothActiveCategory === category) {
        // Second click on same button — deselect, show all
        bothActiveSection = null;
        bothActiveCategory = null;
    } else {
        bothActiveSection = section;
        bothActiveCategory = category;
    }

    applyBothCategoryFilter();
    updateBothButtonStyles();
    updateButtonStyles();  // Reset shared button visuals (N/A, Total)
    updateProjectRings();
    setTimeout(autoZoomToFilteredBridges, 100);
    updateUrlHash();

    // Sync RE with CR: switch RE mode and category to match
    if (reportPanelOpen && bothActiveSection && bothActiveCategory) {
        const newMode = (bothActiveSection === 'insp') ? 'inspection' : 'maintenance';
        if (reportViewMode !== newMode) {
            reportViewMode = newMode;
            renderReportModeBar();
            buildReportCategoryButtons();
        }
        reportCategory = bothActiveCategory;
        buildReportBridgeList(reportCategory);
        reportCurrentIndex = 0;
        updateReportCategoryButtonStates();
        removeReportHighlight();
        if (reportBridgeList.length > 0) {
            renderReportDetail(reportBridgeList[0]);
        } else {
            document.getElementById('reportDetail').innerHTML = '<div style="color:#999;text-align:center;padding:20px;">No bridges in this category.</div>';
            document.getElementById('reportTitleBox').innerHTML = '';
        }
        updateReportNav();
        renderReportBridgeList();
        applyReportCategoryFilter();
        updateReStatusBar();
    } else if (reportPanelOpen && !bothActiveSection) {
        // CR deselected — switch RE to total
        reportCategory = 'total';
        buildReportBridgeList('total');
        reportCurrentIndex = 0;
        updateReportCategoryButtonStates();
        removeReportHighlight();
        if (reportBridgeList.length > 0) {
            renderReportDetail(reportBridgeList[0]);
        }
        updateReportNav();
        renderReportBridgeList();
        applyReportCategoryFilter();
        updateReStatusBar();
    }
};

// Apply filtering for both-mode category isolation
function applyBothCategoryFilter() {
    if (!bothActiveSection || !bothActiveCategory) {
        // No isolation — restore normal display
        updateBridgeSizes();
        return;
    }

    const baseSize = getPointSize();
    const toShow = [];

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

        // Respect box exclusion
        if (boxExcludedBars.has(bars)) {
            if (marker._map) marker.remove();
            return;
        }

        // Respect sufficiency filter
        if (sliderValues.sufficiency < 100) {
            const calcSuff = getSufficiencyRating(bridge);
            if (calcSuff == null) { if (marker._map) marker.remove(); return; }
            const suffThreshold = sliderValues.sufficiency / 100 * 9;
            if (sufficiencyMode === 'lte') {
                if (calcSuff > suffThreshold) { if (marker._map) marker.remove(); return; }
            } else {
                if (calcSuff < suffThreshold) { if (marker._map) marker.remove(); return; }
            }
        }

        // Categorize using the correct section logic
        let cat;
        if (bothActiveSection === 'insp') {
            cat = getInspectionCategoryForBridge(bridge);
        } else {
            cat = getMaintenanceCategoryForBridge(bridge);
        }

        // 'total' means show all non-N/A bridges; otherwise match exact category
        const matchesCategory = bothActiveCategory === 'total' ? (cat !== 'na') : (cat === bothActiveCategory);

        if (matchesCategory) {
            let color, zPriority;

            if (bothActiveSection === 'insp') {
                // Inspection theme: gradient HSL colors from getInspectionColor
                color = getInspectionColor(bridge);
                // Skip N/A grey bridges
                if (color === '#888') {
                    if (marker._map) marker.remove();
                    return;
                }
                // z-priority: past due (red) on top, upcoming (orange) middle, completed (green) bottom
                if (color.startsWith('hsl(0')) zPriority = 2;       // past due reds
                else if (color.startsWith('hsl(')) zPriority = 1;   // upcoming oranges
                else zPriority = 0;                                  // completed greens
            } else {
                // Maintenance theme: condition colors (respects sliders when active)
                color = evaluationActive ? getEvaluationColor(bridge) : getWorstConditionColor(bridge);
                // Skip grey (N/A) bridges in maintenance isolation
                if (color === '#6b7280') {
                    if (marker._map) marker.remove();
                    return;
                }
                // z-priority: worst condition on top
                const ratings = [bridge.deck_rating, bridge.superstructure_rating,
                    bridge.substructure_rating, bridge.bearings_rating, bridge.joints_rating]
                    .filter(r => typeof r === 'number' && !isNaN(r) && r >= 1 && r <= 9);
                zPriority = ratings.length > 0 ? 10 - Math.min(...ratings) : 0;
            }

            toShow.push({ marker, bridge, color, zPriority });
        } else {
            if (marker._map) marker.remove();
        }
    });

    // Sort so worst bridges render on top
    toShow.sort((a, b) => a.zPriority - b.zPriority);

    toShow.forEach(({ marker, bridge, color }) => {
        let size;
        if (bothActiveSection === 'insp') {
            // Inspection theme: uniform size (no evaluation sizing)
            size = baseSize;
        } else {
            // Maintenance theme: evaluation sizing when sliders active
            size = evaluationActive ? getEvaluationSize(bridge, baseSize) : baseSize;
        }
        marker.setRadius(size);
        marker.setStyle({ fillColor: color, fillOpacity: 1, opacity: 1 });
        if (!marker._map) marker.addTo(map);
        marker.bringToFront();
    });
}

// Update button styles for both-mode — only highlight the active section/category
function updateBothButtonStyles() {
    const colors = { critical: '#dc2626', emergent: '#F97316', satisfactory: '#10b981' };

    ['critical', 'emergent', 'satisfactory'].forEach(cat => {
        const maintBtn = document.getElementById('btn-maint-' + cat);
        if (maintBtn) {
            const isActive = (bothActiveSection === 'maint' && (bothActiveCategory === cat || bothActiveCategory === 'total'));
            maintBtn.style.borderColor = isActive ? colors[cat] : 'rgba(255,255,255,0.2)';
            maintBtn.style.opacity = '1';
        }

        const inspBtn = document.getElementById('btn-insp-' + cat);
        if (inspBtn) {
            const isActive = (bothActiveSection === 'insp' && (bothActiveCategory === cat || bothActiveCategory === 'total'));
            inspBtn.style.borderColor = isActive ? colors[cat] : 'rgba(255,255,255,0.2)';
            inspBtn.style.opacity = '1';
        }
    });

    // Section total buttons
    const btnMaintTotal = document.getElementById('btn-maint-total');
    if (btnMaintTotal) {
        const isActive = (bothActiveSection === 'maint' && bothActiveCategory === 'total');
        btnMaintTotal.style.borderColor = isActive ? '#FFB81C' : 'rgba(255,184,28,0.4)';
        btnMaintTotal.style.background = isActive ? 'rgba(255,184,28,0.15)' : 'rgba(0, 40, 85, 0.5)';
    }
    const btnInspTotal = document.getElementById('btn-insp-total');
    if (btnInspTotal) {
        const isActive = (bothActiveSection === 'insp' && bothActiveCategory === 'total');
        btnInspTotal.style.borderColor = isActive ? '#FFB81C' : 'rgba(255,184,28,0.4)';
        btnInspTotal.style.background = isActive ? 'rgba(255,184,28,0.15)' : 'rgba(0, 40, 85, 0.5)';
    }

    // N/A and bottom Total buttons
    const btnNA = document.getElementById('btn-na');
    if (btnNA) {
        btnNA.style.borderColor = 'rgba(255,255,255,0.2)';
    }
    const btnTotal = document.getElementById('btn-total');
    if (btnTotal) {
        btnTotal.style.background = (!bothActiveSection) ? 'rgba(0, 40, 85, 0.5)' : 'rgba(0, 40, 85, 0.3)';
    }
}

// Sync Hub Button (projectToggle) state based on CRHUB isolation
function syncHubButton() {
    // Standalone button is hidden; just update CR button styling
    styleCRHubButton();
}

// Apply category filter
function applyCountCategoryFilter() {
    // HUB Data isolation — intersect with all active filters
    if (countCategoryState.hubdata) {
        const baseSize = getPointSize();
        const conditionActive = hasConditionSlidersActive();
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

            // Respect box select / Ctrl+Click exclusions
            if (boxExcludedBars.has(bars)) {
                if (marker._map) marker.remove();
                return;
            }

            // Respect condition/evaluation filters
            if (conditionActive) {
                const color = getBridgeColor(bridge);
                if (color.toLowerCase() === '#6b7280') {
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

    // HUB Data theme mode — show only HUB bridges as green dots, intersected with all active filters
    if (hubDataMode === 2) {
        const baseSize = getPointSize();
        const conditionActive = hasConditionSlidersActive();
        const hasIsolation = countCategoryState.na ||
            (!countCategoryState.critical || !countCategoryState.emergent || !countCategoryState.satisfactory || !countCategoryState.completed);

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

            // Respect box select / Ctrl+Click exclusions
            if (boxExcludedBars.has(bars)) {
                if (marker._map) marker.remove();
                return;
            }

            // Respect condition/evaluation filters — bridge must pass category check
            if (conditionActive || hasIsolation) {
                const category = getBridgeCategory(bridge);
                let passesCategory = false;
                if (category === 'critical' && countCategoryState.critical) passesCategory = true;
                if (category === 'emergent' && countCategoryState.emergent) passesCategory = true;
                if (category === 'completed' && countCategoryState.completed) passesCategory = true;
                if (category === 'satisfactory' && countCategoryState.satisfactory) passesCategory = true;
                if (category === 'na' && countCategoryState.na) passesCategory = true;
                if (!passesCategory) {
                    if (marker._map) marker.remove();
                    return;
                }
                // Also hide grey (N/A) bridges unless NA is toggled on
                const color = getBridgeColor(bridge);
                if (color.toLowerCase() === '#6b7280' && !countCategoryState.na) {
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
    crManuallyHidden = true;
};

// ========================================
// PROJECT RINGS
// ========================================

function positionProjectToggle() {
    // No-op: HUB DATA button is now in the CR, old standalone button hidden
}

function createProjectRings() {
    if (!projectsData || Object.keys(projectsData).length === 0) return;
    // HUB DATA button above districts is hidden; CR HUB Data button handles cycling now

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

    // Update standalone button if visible (tour mode)
    const btn = document.getElementById('projectToggle');
    if (btn) {
        btn.classList.remove('active', 'theme');
    }

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
        if (btn) btn.classList.add('active');
        updateProjectRings();
    } else {
        // Theme: green HUB dots only, no rings
        if (btn) btn.classList.add('theme');
        Object.values(projectRingLayers).forEach(ring => {
            if (ring._map) ring.remove();
        });
        updateBridgeSizes();
        applyCountCategoryFilter();
    }

    // Update CR HUB Data button styling to reflect mode
    styleCRHubButton();
    updateUrlHash();
};

// Style the CR HUB Data button to reflect the current hubDataMode
function styleCRHubButton() {
    const crBtn = document.getElementById('btn-hubdata');
    if (!crBtn) return;
    const dot = document.getElementById('hubdata-dot');
    const label = document.getElementById('hubdata-label');

    if (hubDataMode === 0) {
        // Off: normal look, full opacity
        crBtn.style.background = 'transparent';
        crBtn.style.borderColor = 'rgba(255,255,255,0.2)';
        crBtn.style.borderWidth = '1px';
        crBtn.style.opacity = '1';
        if (dot) dot.style.background = '#22c55e';
        if (label) label.style.color = '#fff';
    } else if (hubDataMode === 1) {
        // Rings: yellow highlight (matches standalone .active state)
        crBtn.style.background = 'rgba(255,184,28,0.15)';
        crBtn.style.borderColor = '#FFB81C';
        crBtn.style.borderWidth = '2px';
        crBtn.style.opacity = '1';
        if (dot) dot.style.background = '#FFB81C';
        if (label) label.style.color = '#FFB81C';
    } else {
        // Theme: green highlight (matches standalone .theme state)
        crBtn.style.background = 'rgba(34,197,94,0.15)';
        crBtn.style.borderColor = '#22c55e';
        crBtn.style.borderWidth = '2px';
        crBtn.style.opacity = '1';
        if (dot) dot.style.background = '#22c55e';
        if (label) label.style.color = '#22c55e';
    }
}

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
    // Step 2: District Drawer — tooltip to the left of the CR
    {
        target: '#crDistrictTab',
        title: 'Districts',
        text: 'Click this tab to open the Districts drawer. Click any district to solo it — only that district\'s bridges will show and the map will zoom to it. Click the district again to show all.',
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
            map.fitBounds(wvBounds, { padding: [30, 30] });
        }
    },
    // Step 7: Box Select — open AF, highlight route search, Ctrl+drag demo
    {
        target: '#route-search-box',
        title: 'Box Select',
        text: 'We\'ve searched Route 79 for you. Notice some results aren\'t on I-79 — they\'re inside the red circle. 🤫\n\nYou can either exclude these points OR hide all the others. Hold Ctrl and drag a box around them, then click Exclude or Include. You can also Ctrl+Click individual bridge points to exclude them one at a time.\n\nUse Ctrl+Z to undo your last exclusion. A Reset button appears at the bottom when a filter is active.',
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
            excludeUndoStack.length = 0;
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
            excludeUndoStack.length = 0;
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
    // Step 8: HUB Data interactive — user cycles the button (temporarily shows standalone button for tour)
    {
        target: '#projectToggle',
        title: 'HUB Data Button',
        text: 'This button cycles through three modes:\n\n\u2022 Blue (off) \u2014 Normal bridge view, no project data.\n\u2022 Yellow \u2014 Green rings appear around bridges with project data. All bridges stay visible so you can see current conditions AND financials side-by-side.\n\u2022 Green \u2014 Only HUB data bridges remain.\n\nGive it a click and watch it cycle!\n\nOutside the tour, this same button lives in the Count Report.',
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
            // Hide the standalone button again (it only shows during tour)
            document.getElementById('projectToggle').style.display = 'none';
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
                styleCRHubButton();
            }
        }
    },
    // Step 9: Guided exercise — bad joints, good sufficiency
    {
        target: '#eval-sliders-wrapper',
        title: 'Try It \u2014 Bad Joints, Good Bridges',
        text: 'Let\'s find an interesting set of bridges: ones with bad joints but an otherwise good sufficiency rating.\n\nWe\'ve set the Joints slider to 80% and Calc. Sufficiency to 75% in \u2265 mode \u2014 meaning bridges scoring 75 or higher overall, but with joint problems.\n\nTry dragging the sliders yourself to see how the map changes. The Count Report on the right shows the results!',
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
            setTimeout(autoZoomToFilteredBridges, 150);

            // Raise CF panel above overlay so sliders are interactive
            condPanel.style.zIndex = '12000';

            // Hide tour overlay so map is visible alongside sliders
            const tourOverlay = document.getElementById('tour-overlay');
            if (tourOverlay) tourOverlay.style.display = 'none';
            const tourSpotlight = document.getElementById('tour-spotlight');
            if (tourSpotlight) tourSpotlight.style.display = 'none';
        },
        onExit: function() {
            // Restore CF panel z-index
            const condPanel = document.getElementById('evaluationPanel');
            condPanel.style.zIndex = '';

            // Restore tour overlay
            const tourOverlay = document.getElementById('tour-overlay');
            if (tourOverlay) tourOverlay.style.display = '';
            const tourSpotlight = document.getElementById('tour-spotlight');
            if (tourSpotlight) tourSpotlight.style.display = '';
        }
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
        if (hubBtn) {
            hubBtn.classList.remove('active', 'theme');
            hubBtn.style.display = 'none'; // Keep hidden after tour
            if (hubDataMode === 1) hubBtn.classList.add('active');
            else if (hubDataMode === 2) hubBtn.classList.add('theme');
        }
        if (!projectRingsVisible) {
            Object.values(projectRingLayers).forEach(ring => {
                if (ring._map) ring.remove();
            });
        } else {
            updateProjectRings();
        }
        styleCRHubButton();
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

    // Reset HUB button z-index and hide it (only shown during tour)
    const hubToggle = document.getElementById('projectToggle');
    if (hubToggle) { hubToggle.style.zIndex = ''; hubToggle.style.display = 'none'; }

    // Clear search in case we quit during step 10
    document.getElementById('searchInput').value = '';
    currentSearchQuery = '';

    // Clear box select in case we quit during step 10
    boxExcludedBars.clear();
    excludeUndoStack.length = 0;
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
    if (e.key === 'ArrowRight') { e.preventDefault(); nextTourStep(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); prevTourStep(); }
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
        const newlyExcluded = [];
        allVisible.forEach(bars => {
            if (!selectedBars.includes(bars)) {
                boxExcludedBars.add(bars);
                newlyExcluded.push(bars);
            }
        });
        if (newlyExcluded.length > 0) excludeUndoStack.push(newlyExcluded);
        // Hide tour red circle if present
        if (window._tourRedCircles) {
            window._tourRedCircles.forEach(function(c) { if (c._map) c.remove(); });
        }
        popup.remove();
        updateBridgeSizes();
        showBoxFilterIndicator();
    });

    document.getElementById('box-select-exclude').addEventListener('click', function() {
        const newlyExcluded = [];
        selectedBars.forEach(bars => {
            if (!boxExcludedBars.has(bars)) newlyExcluded.push(bars);
            boxExcludedBars.add(bars);
        });
        if (newlyExcluded.length > 0) excludeUndoStack.push(newlyExcluded);
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
    const undoBtn = excludeUndoStack.length > 0
        ? `<button onclick="undoExclude()" data-tip="Undo the last exclusion (Ctrl+Z)">Undo</button>`
        : '';
    indicator.innerHTML = `
        <span>${boxExcludedBars.size} bridge${boxExcludedBars.size !== 1 ? 's' : ''} filtered</span>
        ${undoBtn}
        <button onclick="clearBoxSelect()" data-tip="Reset all excluded bridges. You can also press Esc.">Reset</button>
    `;
}

window.undoExclude = function() {
    if (excludeUndoStack.length === 0) return;
    const lastAction = excludeUndoStack.pop();
    lastAction.forEach(bars => boxExcludedBars.delete(bars));
    updateBridgeSizes();
    showBoxFilterIndicator();
};

function clearBoxSelect() {
    boxExcludedBars.clear();
    excludeUndoStack.length = 0;
    const indicator = document.getElementById('box-filter-indicator');
    if (indicator) indicator.remove();
    updateBridgeSizes();
}

// ═══════════════════════════════════════════════════════
// EASTER EGGS
// ═══════════════════════════════════════════════════════

function initEasterEggs() {
    // Konami Code: ↑↑↓↓←→←→BA
    const konamiSequence = [38,38,40,40,37,39,37,39,66,65];
    let konamiIndex = 0;
    document.addEventListener('keydown', function(e) {
        if (e.keyCode === konamiSequence[konamiIndex]) {
            konamiIndex++;
            if (konamiIndex === konamiSequence.length) {
                konamiIndex = 0;
                triggerKonamiEgg();
            }
        } else {
            konamiIndex = 0;
        }
    });

    // Mothman: Ctrl+Shift+M
    document.addEventListener('keydown', function(e) {
        if (e.ctrlKey && e.shiftKey && e.key === 'M') {
            e.preventDefault();
            checkMothmanDay(true);
        }
    });

    // Flatwoods Monster: Ctrl+Shift+F
    document.addEventListener('keydown', function(e) {
        if (e.ctrlKey && e.shiftKey && e.key === 'F') {
            e.preventDefault();
            checkFlatwoodsDay(true);
        }
    });

    // Matrix: click header title 7 times
    let headerClicks = 0;
    let headerClickTimer = null;
    const headerTitle = document.querySelector('.header h1');
    if (headerTitle) {
        headerTitle.style.cursor = 'default';
        headerTitle.addEventListener('click', function() {
            headerClicks++;
            clearTimeout(headerClickTimer);
            headerClickTimer = setTimeout(function() { headerClicks = 0; }, 2000);
            if (headerClicks >= 7) {
                headerClicks = 0;
                triggerMatrixEgg();
            }
        });
    }

}

// Hitchhiker's Guide — route search "42"
function showHitchhikerEgg() {
    const existing = document.getElementById('egg-popup');
    if (existing) existing.remove();
    const popup = document.createElement('div');
    popup.id = 'egg-popup';
    popup.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:99999;background:url(galaxy42.jpg) center/cover no-repeat;border:1px solid var(--wvdoh-yellow);border-radius:12px;padding:30px 40px;box-shadow:0 8px 40px rgba(0,0,0,0.8);text-align:center;width:570px;';
    popup.innerHTML =
        '<button onclick="document.getElementById(\'egg-popup\').remove()" style="position:absolute;top:8px;right:12px;background:none;border:none;color:#fff;font-size:16pt;cursor:pointer;text-shadow:0 0 6px #000;">✕</button>' +
        '<div style="font-size:48pt;margin-bottom:12px;text-shadow:0 0 20px rgba(0,0,0,0.9),0 0 40px rgba(0,0,0,0.7);">42</div>' +
        '<div style="color:var(--wvdoh-yellow);font-size:14pt;font-weight:600;margin-bottom:8px;text-shadow:0 0 10px rgba(0,0,0,0.9),0 2px 4px rgba(0,0,0,0.8);">The Answer to Life, the Universe,<br>and Bridge Sufficiency.</div>' +
        '<div style="color:rgba(255,255,255,0.8);font-size:9pt;font-style:italic;text-shadow:0 0 8px rgba(0,0,0,0.9);">Don\'t Panic.</div>';
    document.body.appendChild(popup);
}

// Konami Code — Contra 30 lives reference
function triggerKonamiEgg() {
    // Chiptune sound
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const melody = [523, 659, 784, 1047];
        melody.forEach(function(freq, i) {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.value = freq;
            osc.type = 'square';
            gain.gain.value = 0.06;
            osc.start(audioCtx.currentTime + i * 0.15);
            osc.stop(audioCtx.currentTime + i * 0.15 + 0.12);
        });
    } catch(e) {}

    const existing = document.getElementById('egg-popup');
    if (existing) existing.remove();
    const popup = document.createElement('div');
    popup.id = 'egg-popup';
    popup.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:99999;background:#000;border:1px solid var(--wvdoh-yellow);border-radius:0;padding:30px 50px;box-shadow:0 0 60px rgba(0,0,0,0.9);text-align:center;image-rendering:pixelated;';
    popup.innerHTML =
        '<div style="font-family:\'Courier New\',monospace;color:#fff;font-size:11pt;margin-bottom:12px;letter-spacing:2px;">PLAYER 1</div>' +
        '<div style="font-family:\'Courier New\',monospace;color:#ff0;font-size:36pt;font-weight:900;letter-spacing:6px;text-shadow:3px 3px 0 #c00;margin-bottom:12px;">30 BRIDGES</div>' +
        '<div style="font-family:\'Courier New\',monospace;color:#0f0;font-size:14pt;letter-spacing:3px;animation:blink8bit 0.6s infinite;">★ UNLOCKED ★</div>' +
        '<div style="font-family:\'Courier New\',monospace;color:rgba(255,255,255,0.4);font-size:8pt;margin-top:16px;">↑ ↑ ↓ ↓ ← → ← → B A</div>' +
        '<style>@keyframes blink8bit{0%,49%{opacity:1}50%,100%{opacity:0}}</style>';
    document.body.appendChild(popup);
    setTimeout(function() { if (popup.parentNode) popup.remove(); }, 4000);
}

// Matrix — green-on-black theme for 10 seconds
function triggerMatrixEgg() {
    const style = document.createElement('style');
    style.id = 'matrix-egg-style';
    style.textContent = `
        * { transition: all 0.5s ease !important; }

        /* Header */
        .header { background: #000 !important; border-color: #00ff41 !important; }
        .header-overlay { opacity: 0 !important; }
        .header h1, .header .subtitle, .header .email a { color: #00ff41 !important; }
        .header .search input { background: #000 !important; border-color: #00ff41 !important; color: #00ff41 !important; }
        #version-label { color: #00ff41 !important; }

        /* Last Updated box */
        .last-updated { background: #000 !important; border-color: #00ff41 !important; color: #00ff41 !important; }

        /* Map */
        #map { filter: hue-rotate(90deg) saturate(3) !important; }
        .leaflet-tile { filter: grayscale(1) brightness(0.3) !important; }

        /* Panels */
        .evaluation-panel, .attributes-panel { background: #000 !important; }
        .panel-header { background: #000 !important; }
        .panel-header h3 { color: #00ff41 !important; }
        .panel-body { background: #000 !important; }
        .folder-tab { background: #000 !important; }
        .folder-tab-text { color: #00ff41 !important; }
        .section-title, .slider-label, .checkbox-label { color: #00ff41 !important; }
        .section-btn { background: #000 !important; color: #00ff41 !important; border-color: #00ff41 !important; }
        .section-btn.active { background: #00ff41 !important; color: #000 !important; }

        /* All panel sub-boxes (inline bg #003b5c) */
        .panel-body div[style*="003b5c"],
        .inspection-types-section,
        .inspection-months-section,
        .inspection-options-section,
        #route-search-box,
        .disabled-section,
        .slider-group[style*="003b5c"] { background: #000 !important; border-color: #00ff41 !important; }

        /* Inputs inside panels */
        #route-search, #subroute-search { background: #000 !important; border-color: #00ff41 !important; color: #00ff41 !important; }
        .slider-value { color: #00ff41 !important; }
        .nhs-btn { background: #000 !important; border-color: #00ff41 !important; color: #00ff41 !important; }
        .nhs-btn.active { background: #00ff41 !important; color: #000 !important; }
        button[id*="-mode-toggle"] { background: #000 !important; border-color: #00ff41 !important; color: #00ff41 !important; }

        /* Count Report */
        #countReport { background: #000 !important; border-color: #00ff41 !important; }
        #countReport button { background: #000 !important; border-color: #00ff41 !important; }
        #countReport span { color: #00ff41 !important; }

        /* Legend / Districts */
        .legend { background: #000 !important; border-color: #00ff41 !important; }
        .legend h4 { background: #000 !important; color: #00ff41 !important; }
        .legend-item { color: #00ff41 !important; }
        .legend-item:hover { border-color: #00ff41 !important; }

        /* Hub data button */
        #hub-data-btn { background: #000 !important; border-color: #00ff41 !important; color: #00ff41 !important; }

        /* Sliders and checkboxes */
        input[type="range"] { accent-color: #00ff41 !important; }
        input[type="checkbox"] { accent-color: #00ff41 !important; }
        .eval-slider::-webkit-slider-thumb { background: #00ff41 !important; }

        /* Status bars */
        .status-bar { background: #000 !important; border-color: #00ff41 !important; }
        .status-bar span { color: #00ff41 !important; }

        /* Leaflet SVG paths (bridge dots) */
        .leaflet-interactive { stroke: #00ff41 !important; fill: #00ff41 !important; }
    `;
    document.head.appendChild(style);

    // Random Matrix quote in last-updated box (different each time)
    const matrixQuotes = [
        'There is no spoon.',
        'Wake up, Neo...',
        'Follow the white rabbit.',
        'The Matrix has you.',
        'I know kung fu.',
        'Free your mind.',
        'Dodge this.',
        'He is the One.',
        'What is real?',
        'Welcome to the desert of the real.'
    ];
    const lastUpdated = document.querySelector('.last-updated');
    const originalUpdatedText = lastUpdated ? lastUpdated.textContent : '';
    if (lastUpdated) lastUpdated.textContent = matrixQuotes[Math.floor(Math.random() * matrixQuotes.length)];

    // Digital rain overlay
    const canvas = document.createElement('canvas');
    canvas.id = 'matrix-rain';
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:99998;pointer-events:none;opacity:0.15;';
    document.body.appendChild(canvas);
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');
    const columns = Math.floor(canvas.width / 14);
    const drops = Array(columns).fill(1);
    const chars = 'SPANBASE01アイウエオカキクケコ'.split('');

    const rainInterval = setInterval(function() {
        ctx.fillStyle = 'rgba(0,0,0,0.05)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#00ff41';
        ctx.font = '12px monospace';
        for (let i = 0; i < drops.length; i++) {
            const char = chars[Math.floor(Math.random() * chars.length)];
            ctx.fillText(char, i * 14, drops[i] * 14);
            if (drops[i] * 14 > canvas.height && Math.random() > 0.975) drops[i] = 0;
            drops[i]++;
        }
    }, 50);

    setTimeout(function() {
        clearInterval(rainInterval);
        style.remove();
        canvas.remove();
        if (lastUpdated) {
            lastUpdated.textContent = originalUpdatedText;
            lastUpdated.style.color = '';
            lastUpdated.style.background = '';
            lastUpdated.style.borderColor = '';
        }
    }, 10000);
}

// Country Roads — route search "wv"
function showCountryRoadsEgg() {
    const existing = document.getElementById('egg-popup');
    if (existing) existing.remove();
    const popup = document.createElement('div');
    popup.id = 'egg-popup';
    popup.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:99999;background:linear-gradient(135deg,#1a3a5c,#002244);border:1px solid var(--wvdoh-yellow);border-radius:12px;padding:10px;box-shadow:0 8px 40px rgba(0,0,0,0.8);text-align:center;';
    popup.innerHTML =
        '<div style="position:relative;">' +
        '<button onclick="document.getElementById(\'egg-popup\').remove()" style="position:absolute;top:-4px;right:2px;background:none;border:none;color:#fff;font-size:16pt;cursor:pointer;z-index:1;">✕</button>' +
        '<iframe width="480" height="270" src="https://www.youtube.com/embed/1vrEljMfXYo?autoplay=1&start=9" frameborder="0" allow="autoplay;encrypted-media" allowfullscreen></iframe>' +
        '<div style="color:var(--wvdoh-yellow);font-size:14pt;font-weight:600;padding:8px 0;font-style:italic;">Country Roads...Take Me Home</div>' +
        '<div style="color:rgba(255,255,255,0.5);font-size:9pt;">♫ Take Me Home, Country Roads — John Denver ♫</div>' +
        '</div>';
    document.body.appendChild(popup);
    // Auto-close at 00:12 of the song (3s playback + ~3s iframe load buffer)
    setTimeout(function() {
        if (popup.parentNode) popup.remove();
    }, 6000);
}

// ═══════════════════════════════════════════════════════
// MOTHMAN — December 15th Memorial
// ═══════════════════════════════════════════════════════

function checkMothmanDay(force) {
    if (!force) {
        const now = new Date();
        if (now.getMonth() !== 11 || now.getDate() !== 15) return; // Dec = month 11
    }

    // Full-screen black overlay
    const overlay = document.createElement('div');
    overlay.id = 'mothman-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:999999;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;opacity:0;transition:opacity 1.5s ease;';

    // Mothman eyes — two large red glowing circles
    const eyesContainer = document.createElement('div');
    eyesContainer.style.cssText = 'display:flex;gap:60px;margin-bottom:200px;opacity:0;transition:opacity 2s ease 6s;';

    const leftEye = document.createElement('div');
    leftEye.style.cssText = 'width:96px;height:96px;border-radius:50%;background:radial-gradient(circle,#ff0000 30%,#cc0000 60%,#660000 100%);box-shadow:0 0 40px #ff0000,0 0 80px #ff0000,0 0 120px rgba(255,0,0,0.5);animation:mothmanPulse 3s ease-in-out infinite;';

    const rightEye = document.createElement('div');
    rightEye.style.cssText = leftEye.style.cssText;

    eyesContainer.appendChild(leftEye);
    eyesContainer.appendChild(rightEye);
    overlay.appendChild(eyesContainer);

    // History text
    const textBlock = document.createElement('div');
    textBlock.style.cssText = 'max-width:560px;text-align:center;opacity:0;transition:opacity 2s ease 1s;padding:20px;border:1px solid rgba(255,0,0,0.2);border-radius:6px;';
    textBlock.innerHTML =
        '<div style="color:#cc0000;font-size:12pt;font-weight:600;letter-spacing:3px;margin-bottom:20px;text-transform:uppercase;">December 15, 1967</div>' +
        '<div style="color:#ff3333;font-size:11pt;line-height:1.8;margin-bottom:20px;">' +
        'The Silver Bridge connecting Point Pleasant, West Virginia to Gallipolis, Ohio collapsed during rush hour traffic, plunging 31 vehicles into the Ohio River. 46 people lost their lives.' +
        '</div>' +
        '<div style="color:#cc0000;font-size:10pt;line-height:1.8;margin-bottom:30px;font-style:italic;">' +
        'In the thirteen months before the collapse, residents reported sightings of a large, winged creature with glowing red eyes near the bridge. They called it the Mothman.' +
        '</div>' +
        '<div style="color:#ff3333;font-size:10pt;line-height:1.8;margin-bottom:30px;">' +
        'This tragedy prompted the Federal-Aid Highway Act of 1968 and the establishment of the National Bridge Inspection Standards (NBIS) in 1971 — the birth of the federal bridge inspection program that continues to safeguard the nation\u2019s bridges today.' +
        '</div>' +
        '<div style="color:rgba(255,255,255,0.2);font-size:9pt;margin-top:20px;">Click anywhere to continue</div>';
    overlay.appendChild(textBlock);

    // Pulse animation
    const pulseStyle = document.createElement('style');
    pulseStyle.id = 'mothman-pulse-style';
    pulseStyle.textContent = '@keyframes mothmanPulse { 0%,100% { box-shadow: 0 0 40px #ff0000, 0 0 80px #ff0000, 0 0 120px rgba(255,0,0,0.5); } 50% { box-shadow: 0 0 60px #ff0000, 0 0 100px #ff0000, 0 0 160px rgba(255,0,0,0.7); } }';
    document.head.appendChild(pulseStyle);

    document.body.appendChild(overlay);

    // Fade in sequence — double rAF ensures browser registers opacity:0 first
    requestAnimationFrame(function() {
        requestAnimationFrame(function() {
            overlay.style.opacity = '1';
            textBlock.style.opacity = '1';
            eyesContainer.style.opacity = '1';
        });
    });

    // Eyes fade out very slowly after appearing (6s delay + 2s fade-in + 3s visible = 11s)
    setTimeout(function() {
        eyesContainer.style.transition = 'opacity 12s ease';
        eyesContainer.style.opacity = '0';
    }, 11000);

    // Click to dismiss
    overlay.addEventListener('click', function() {
        overlay.style.opacity = '0';
        setTimeout(function() {
            overlay.remove();
            pulseStyle.remove();
        }, 1500);
    });
}

// ═══════════════════════════════════════════════════════
// FLATWOODS MONSTER — September 12, 1952
// ═══════════════════════════════════════════════════════

function checkFlatwoodsDay(force) {
    if (!force) {
        const now = new Date();
        if (now.getMonth() !== 8 || now.getDate() !== 12) return; // Sep = month 8
    }

    const overlay = document.createElement('div');
    overlay.id = 'flatwoods-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:999999;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;opacity:0;transition:opacity 1.5s ease;overflow:hidden;';

    // Green mist layers — edges of screen
    const mist = document.createElement('div');
    mist.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;opacity:0;transition:opacity 3s ease 0.5s;pointer-events:none;' +
        'background:radial-gradient(ellipse at 50% 100%, rgba(0,96,24,0.48) 0%, transparent 60%),' +
        'radial-gradient(ellipse at 0% 50%, rgba(0,72,12,0.36) 0%, transparent 50%),' +
        'radial-gradient(ellipse at 100% 50%, rgba(0,72,12,0.36) 0%, transparent 50%),' +
        'radial-gradient(ellipse at 50% 0%, rgba(0,48,12,0.24) 0%, transparent 40%);';
    overlay.appendChild(mist);

    // Descending orb — the "meteor"
    const orb = document.createElement('div');
    orb.style.cssText = 'position:absolute;top:-60px;left:50%;transform:translateX(-50%);width:24px;height:24px;border-radius:50%;z-index:10;' +
        'background:radial-gradient(circle,#88ff88 20%,#44cc44 50%,#008800 80%,transparent 100%);' +
        'box-shadow:0 0 30px #44ff44,0 0 60px #22cc22,0 0 100px rgba(0,255,0,0.3);' +
        'opacity:0;transition:opacity 1s ease 1.5s;pointer-events:none;';
    overlay.appendChild(orb);

    // Creature silhouette — SVG from FM.kmz vector data
    const creature = document.createElement('div');
    creature.style.cssText = 'position:absolute;bottom:-500px;left:50%;transform:translateX(-50%);opacity:0;transition:opacity 3s ease 6s,bottom 5s ease 6s;z-index:1;';

    creature.innerHTML = `
        <svg viewBox="0 0 400 420" width="420" height="441" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 0 40px rgba(0,80,0,0.4));">
            <defs>
                <radialGradient id="fmEyeGlow" cx="50%" cy="50%" r="50%">
                    <stop offset="30%" stop-color="#cc0000"/>
                    <stop offset="70%" stop-color="#880000"/>
                    <stop offset="100%" stop-color="#440000"/>
                </radialGradient>
                <linearGradient id="fmBodyFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#1a3a1a"/>
                    <stop offset="100%" stop-color="#0d1f0d"/>
                </linearGradient>
            </defs>
            <!-- Filled hood+body shape -->
            <path d="M76.5,413.7 L54.3,396.0 L35.3,374.8 L19.9,350.5 L8.8,323.9 L2.0,295.8 L0.0,266.8 L2.7,238.0 L10.0,210.0 L21.7,183.6 L37.6,159.7 L57.1,138.9 L89.2,113.4 L123.2,90.5 L147.6,73.3 L169.0,52.0 L186.6,27.3 L200.0,0.0 L213.4,27.3 L231.0,52.0 L252.4,73.3 L276.8,90.5 L310.8,113.4 L342.9,138.9 L362.4,159.7 L378.3,183.6 L390.0,210.0 L397.3,238.0 L400.0,266.8 L398.0,295.8 L391.2,323.9 L380.1,350.5 L364.7,374.8 L345.7,396.0 L323.5,413.7 L362.5,416.5 L281.3,411.5 L200.0,409.8 L118.7,411.5 L37.5,416.5 Z" fill="url(#fmBodyFill)" stroke="none" opacity="0.95"/>
            <!-- Bottom baseline -->
            <path d="M37.5,416.5 L118.7,411.5 L200.0,409.8 L281.3,411.5 L362.5,416.5" fill="none" stroke="#1a3a1a" stroke-width="2"/>
            <!-- Head circle -->
            <path d="M305.7,273.0 L303.1,248.7 L295.2,225.5 L282.7,204.7 L265.9,187.4 L245.9,174.4 L223.5,166.3 L200.0,163.5 L176.5,166.3 L154.1,174.4 L134.1,187.4 L117.3,204.7 L104.8,225.5 L96.9,248.7 L94.3,273.0 L96.9,297.4 L104.8,320.6 L117.3,341.3 L134.1,358.7 L154.1,371.7 L176.5,379.8 L200.0,382.6 L223.5,379.8 L245.9,371.7 L265.9,358.7 L282.7,341.3 L295.2,320.6 L303.1,297.4 L305.7,273.0 Z" fill="#0d1f0d" stroke="#1a3a1a" stroke-width="2"/>
            <!-- Left eye -->
            <circle cx="154" cy="273" r="29" fill="url(#fmEyeGlow)" style="filter:drop-shadow(0 0 15px #cc0000) drop-shadow(0 0 30px #880000);animation:flatwoodsGlow 2.5s ease-in-out infinite;"/>
            <!-- Right eye -->
            <circle cx="246" cy="273" r="29" fill="url(#fmEyeGlow)" style="filter:drop-shadow(0 0 15px #cc0000) drop-shadow(0 0 30px #880000);animation:flatwoodsGlow 2.5s ease-in-out infinite;"/>
            <!-- Hood edge highlight -->
            <path d="M76.5,413.7 L54.3,396.0 L35.3,374.8 L19.9,350.5 L8.8,323.9 L2.0,295.8 L0.0,266.8 L2.7,238.0 L10.0,210.0 L21.7,183.6 L37.6,159.7 L57.1,138.9 L89.2,113.4 L123.2,90.5 L147.6,73.3 L169.0,52.0 L186.6,27.3 L200.0,0.0 L213.4,27.3 L231.0,52.0 L252.4,73.3 L276.8,90.5 L310.8,113.4 L342.9,138.9 L362.4,159.7 L378.3,183.6 L390.0,210.0 L397.3,238.0 L400.0,266.8 L398.0,295.8 L391.2,323.9 L380.1,350.5 L364.7,374.8 L345.7,396.0 L323.5,413.7" fill="none" stroke="#00aa00" stroke-width="1" opacity="0.15"/>
        </svg>
    `;
    overlay.appendChild(creature);

    // History text — positioned at top, above the creature
    const textBlock = document.createElement('div');
    textBlock.style.cssText = 'position:absolute;top:30px;left:50%;transform:translateX(-50%);z-index:3;max-width:520px;text-align:center;opacity:0;transition:opacity 2s ease 1s;padding:20px;border:1px solid rgba(0,180,0,0.3);border-radius:6px;background:#000;';
    textBlock.innerHTML =
        '<div style="color:#00cc44;font-size:12pt;font-weight:600;letter-spacing:3px;margin-bottom:20px;text-transform:uppercase;">September 12, 1952</div>' +
        '<div style="color:#44ee66;font-size:11pt;line-height:1.8;margin-bottom:20px;">' +
        'In the hills of Flatwoods, Braxton County, West Virginia, a group of boys saw a bright object streak across the sky and land on a nearby hilltop. They gathered a small party and went to investigate.' +
        '</div>' +
        '<div style="color:#00cc44;font-size:10pt;line-height:1.8;margin-bottom:20px;font-style:italic;">' +
        'At the top of the hill, a pungent metallic mist filled the air. A hissing sound came from the darkness. Then they saw it \u2014 a towering figure, over ten feet tall, with a glowing green face, a spade-shaped hood, and small claw-like hands. It glided toward them.' +
        '</div>' +
        '<div style="color:#44ee66;font-size:10pt;line-height:1.8;margin-bottom:20px;">' +
        'The witnesses fled in terror. Several fell ill afterward, reporting symptoms consistent with chemical exposure. The Flatwoods Monster remains one of West Virginia\u2019s most enduring mysteries.' +
        '</div>' +
        '<div style="color:rgba(255,255,255,0.2);font-size:9pt;margin-top:20px;">Click anywhere to continue</div>';
    overlay.appendChild(textBlock);

    // Glow animation
    const glowStyle = document.createElement('style');
    glowStyle.id = 'flatwoods-glow-style';
    glowStyle.textContent = `
        @keyframes flatwoodsGlow { 0%,100% { box-shadow: 0 0 15px #cc0000, 0 0 30px #880000; } 50% { box-shadow: 0 0 25px #cc0000, 0 0 50px #880000, 0 0 80px rgba(200,0,0,0.5); } }
        @keyframes orbDescend { 0% { top: -60px; } 100% { top: 35%; } }
        @keyframes orbFade { 0% { opacity: 1; } 100% { opacity: 0; transform: translateX(-50%) scale(3); } }
    `;
    document.head.appendChild(glowStyle);

    document.body.appendChild(overlay);

    // Fade in sequence
    requestAnimationFrame(function() {
        requestAnimationFrame(function() {
            overlay.style.opacity = '1';
            mist.style.opacity = '1';
            orb.style.opacity = '1';
            textBlock.style.opacity = '1';
            creature.style.opacity = '1';
            creature.style.bottom = '-60px';
        });
    });

    // Animate the orb descending after it fades in
    setTimeout(function() {
        orb.style.transition = 'top 3s ease-in, opacity 1s ease 2.5s';
        orb.style.top = '35%';
        // Orb bursts and fades after landing
        setTimeout(function() {
            orb.style.transition = 'opacity 1.5s ease, transform 1.5s ease';
            orb.style.opacity = '0';
            orb.style.transform = 'translateX(-50%) scale(4)';
            orb.style.boxShadow = '0 0 60px #88ff88, 0 0 120px #44ff44, 0 0 200px rgba(0,255,0,0.5)';
        }, 3200);
    }, 2500);

    // Creature fades and sinks out of frame
    setTimeout(function() {
        creature.style.transition = 'opacity 5s ease, bottom 12s ease';
        creature.style.opacity = '0';
        creature.style.bottom = '-500px';
    }, 16000);

    // Click to dismiss
    overlay.addEventListener('click', function() {
        overlay.style.opacity = '0';
        setTimeout(function() {
            overlay.remove();
            glowStyle.remove();
        }, 1500);
    });
}

// ===== HUB FILTER SYSTEM =====

const hubFilterState = {
    active: false,
    statuses: [],
    phases: [],
    familyCodes: []
};

let hubFamilyCounts = {};
let hubFamilySortMode = 'count';

function buildHubFilterUI() {
    // Collect unique values and counts across all hub projects
    const statusCounts = {};
    const phaseCounts = {};
    hubFamilyCounts = {};

    Object.values(hubData).forEach(projects => {
        projects.forEach(p => {
            const status = p.project_status || 'Unknown';
            statusCounts[status] = (statusCounts[status] || 0) + 1;

            const phase = p.phase ? p.phase.substring(0, 2) : '';
            if (phase) phaseCounts[phase] = (phaseCounts[phase] || 0) + 1;

            const family = p.family_code || '';
            if (family) hubFamilyCounts[family] = (hubFamilyCounts[family] || 0) + 1;
        });
    });

    // Build status checkboxes
    const statusContainer = document.getElementById('hub-status-checkboxes');
    if (statusContainer) {
        const sorted = Object.keys(statusCounts).sort((a, b) => statusCounts[b] - statusCounts[a]);
        statusContainer.innerHTML = sorted.map(s =>
            '<label class="checkbox-label" style="display: block; padding: 2px 0; font-size: 9pt; white-space: nowrap;">' +
            '<input type="checkbox" class="hub-status-cb" value="' + s + '" style="margin-right: 6px;">' +
            s + ' <span style="color: rgba(255,255,255,0.5);">(' + statusCounts[s] + ')</span></label>'
        ).join('');
        statusContainer.querySelectorAll('.hub-status-cb').forEach(cb => {
            cb.addEventListener('change', function() {
                if (this.checked) hubFilterState.statuses.push(this.value);
                else hubFilterState.statuses = hubFilterState.statuses.filter(v => v !== this.value);
                applyHubFilter();
            });
        });
    }

    // Build phase checkboxes
    const phaseContainer = document.getElementById('hub-phase-checkboxes');
    if (phaseContainer) {
        const phaseLabels = { CN: 'Construction', EN: 'Engineering', RW: 'Right-of-Way', OT: 'Other' };
        const sorted = Object.keys(phaseCounts).sort((a, b) => phaseCounts[b] - phaseCounts[a]);
        phaseContainer.innerHTML = sorted.map(p =>
            '<label class="checkbox-label" style="display: block; padding: 2px 0; font-size: 9pt; white-space: nowrap;">' +
            '<input type="checkbox" class="hub-phase-cb" value="' + p + '" style="margin-right: 6px;">' +
            (phaseLabels[p] || p) + ' <span style="color: rgba(255,255,255,0.5);">(' + phaseCounts[p] + ')</span></label>'
        ).join('');
        phaseContainer.querySelectorAll('.hub-phase-cb').forEach(cb => {
            cb.addEventListener('change', function() {
                if (this.checked) hubFilterState.phases.push(this.value);
                else hubFilterState.phases = hubFilterState.phases.filter(v => v !== this.value);
                applyHubFilter();
            });
        });
    }

    // Build family code checkboxes
    renderHubFamilyCheckboxes();

    // Update match count
    const totalBridges = Object.keys(hubData).length;
    const el = document.getElementById('hub-match-count');
    if (el) el.textContent = totalBridges.toLocaleString() + ' bridges with HUB data';

    console.log('✓ Built HUB filter UI');
}

function renderHubFamilyCheckboxes() {
    const container = document.getElementById('hub-family-checkboxes');
    if (!container) return;

    const codes = Object.keys(hubFamilyCounts);
    if (hubFamilySortMode === 'alpha') codes.sort();
    else codes.sort((a, b) => hubFamilyCounts[b] - hubFamilyCounts[a] || a.localeCompare(b));

    const checked = new Set(hubFilterState.familyCodes);
    container.innerHTML = codes.map(code => {
        const shortLabel = code.split('-')[0];
        return '<label class="checkbox-label" style="display: block; padding: 2px 0; font-size: 9pt; white-space: nowrap;">' +
            '<input type="checkbox" class="hub-family-cb" value="' + code + '"' + (checked.has(code) ? ' checked' : '') + ' style="margin-right: 6px;">' +
            shortLabel + ' <span style="color: rgba(255,255,255,0.5);">(' + hubFamilyCounts[code] + ')</span></label>';
    }).join('');

    container.querySelectorAll('.hub-family-cb').forEach(cb => {
        cb.addEventListener('change', function() {
            if (this.checked) hubFilterState.familyCodes.push(this.value);
            else hubFilterState.familyCodes = hubFilterState.familyCodes.filter(v => v !== this.value);
            applyHubFilter();
        });
    });
}


window.toggleHubFamilySort = function() {
    hubFamilySortMode = hubFamilySortMode === 'alpha' ? 'count' : 'alpha';
    document.getElementById('hub-family-sort-toggle').textContent = hubFamilySortMode === 'alpha' ? '#' : 'A-Z';
    renderHubFamilyCheckboxes();
};

function applyHubFilter() {
    const isActive =
        hubFilterState.statuses.length > 0 ||
        hubFilterState.phases.length > 0 ||
        hubFilterState.familyCodes.length > 0;

    hubFilterState.active = isActive;

    // Update bridge visibility
    updateBridgeSizes();

    // Update match count
    if (isActive) {
        let count = 0;
        Object.keys(hubData).forEach(bars => {
            if (bridgePassesHubFilter(bars)) count++;
        });
        const el = document.getElementById('hub-match-count');
        if (el) el.textContent = count.toLocaleString() + ' / ' + Object.keys(hubData).length.toLocaleString() + ' HUB bridges';
    } else {
        const el = document.getElementById('hub-match-count');
        if (el) el.textContent = Object.keys(hubData).length.toLocaleString() + ' bridges with HUB data';
    }

    if (isActive) {
        autoZoomToFilteredBridges();
    }
}

function bridgePassesHubFilter(bars) {
    if (!hubFilterState.active) return true;

    const projects = hubData[bars];
    if (!projects || projects.length === 0) return false;

    // Bridge passes if ANY of its projects match ALL active filter categories
    return projects.some(p => {
        if (hubFilterState.statuses.length > 0) {
            if (!hubFilterState.statuses.includes(p.project_status)) return false;
        }
        if (hubFilterState.phases.length > 0) {
            const phase = p.phase ? p.phase.substring(0, 2) : '';
            if (!hubFilterState.phases.includes(phase)) return false;
        }

        if (hubFilterState.familyCodes.length > 0) {
            if (!hubFilterState.familyCodes.includes(p.family_code)) return false;
        }
        return true;
    });
}

window.resetHubFilter = function() {
    hubFilterState.statuses = [];
    hubFilterState.phases = [];
    hubFilterState.familyCodes = [];
    hubFilterState.active = false;

    document.querySelectorAll('.hub-status-cb, .hub-phase-cb, .hub-family-cb').forEach(cb => cb.checked = false);

    const el = document.getElementById('hub-match-count');
    if (el) el.textContent = Object.keys(hubData).length.toLocaleString() + ' bridges with HUB data';

    updateBridgeSizes();
};

// HUB panel toggle
window.toggleHubPanel = function() {
    closeReportExplorerIfOpen();
    const hubPanel = document.getElementById('hubPanel');
    const attrPanel = document.getElementById('attributesPanel');
    const condPanel = document.getElementById('evaluationPanel');

    const hubIsOnTop = hubPanel.classList.contains('ontop');
    const hubIsOpen = hubPanel.classList.contains('open');

    if (hubIsOpen && hubIsOnTop) {
        // HUB already showing - close all
        hubPanel.classList.remove('open', 'ontop');
        attrPanel.classList.remove('open', 'ontop');
        condPanel.classList.remove('open', 'behind');
        hubPanelActive = false;
        updateBridgeSizes();
    } else {
        // Open HUB on top, others behind
        hubPanel.classList.add('open', 'ontop');
        attrPanel.classList.add('open');
        attrPanel.classList.remove('ontop');
        condPanel.classList.add('open');
        condPanel.classList.remove('behind');
        // Activate HF theme — show only hubData bridges in green
        hubPanelActive = true;
        updateBridgeSizes();
    }
    updateUrlHash();
    centerStatusBars();
};

// ==================== SHAREABLE LINK SYSTEM ====================

function generateShareableLinkUrl() {
    const state = {};

    // Map view
    const center = map.getCenter();
    state.lat = center.lat.toFixed(5);
    state.lng = center.lng.toFixed(5);
    state.z = map.getZoom();

    // Districts — only encode if some are off (compact: list disabled ones)
    const offDistricts = Object.entries(activeDistricts)
        .filter(([, v]) => !v)
        .map(([k]) => k.replace('District ', ''));
    if (offDistricts.length > 0) state.doff = offDistricts.join(',');

    // Search
    if (currentSearchQuery) state.q = currentSearchQuery;

    // Condition filter sliders
    if (evaluationActive) {
        state.eval = 1;
        const sv = sliderValues;
        if (sv.deck > 0) state.cd = sv.deck;
        if (sv.superstructure > 0) state.cs = sv.superstructure;
        if (sv.substructure > 0) state.cb = sv.substructure;
        if (sv.bearings > 0) state.cr = sv.bearings;
        if (sv.joints > 0) state.cj = sv.joints;
        if (sv.sufficiency < 100) state.sf = sv.sufficiency;
        if (sufficiencyMode !== 'lte') state.sm = sufficiencyMode;
    }

    // Attributes filter
    if (attributesFilterState.active) {
        state.af = 1;
        const a = attributesFilterState;
        if (a.length.value < sliderMaxValues.length) state.al = a.length.value;
        if (a.length.mode !== 'lte') state.alm = a.length.mode;
        if (a.width.value < sliderMaxValues.width) state.aw = a.width.value;
        if (a.width.mode !== 'lte') state.awm = a.width.mode;
        if (a.area.value < sliderMaxValues.area) state.aa = a.area.value;
        if (a.area.mode !== 'lte') state.aam = a.area.mode;
        if (a.age.value < sliderMaxValues.age) state.ag = a.age.value;
        if (a.age.mode !== 'lte') state.agm = a.age.mode;
        if (a.adt.value < sliderMaxValues.adt) state.ad = a.adt.value;
        if (a.adt.mode !== 'lte') state.adm = a.adt.mode;
        if (a.nhs !== 'all') state.nhs = a.nhs;
        if (a.utilities) state.util = 1;
        if (a.onBridge.length > 0) state.ob = a.onBridge.join(',');
        if (a.underBridge.length > 0) state.ub = a.underBridge.join(',');
        if (a.bridgeType.length > 0) state.bt = a.bridgeType.join(',');
        if (a.route) state.rt = a.route;
        if (a.subroute) state.srt = a.subroute;
        if (a.showNA) state.sna = 1;
    }

    // Inspection filters
    if (inspectionFiltersActive) {
        state.insp = 1;
        if (selectedInspectionTypes.length > 0) state.it = selectedInspectionTypes.join(',');
        if (selectedMonths.length > 0) state.im = selectedMonths.join(',');
        if (showOverduePlus) state.odp = 1;
    }

    // HUB data mode
    if (hubDataMode > 0) {
        state.hub = hubDataMode;
        if (hubFilterState.active) {
            state.hf = 1;
            if (hubFilterState.statuses.length > 0) state.hs = hubFilterState.statuses.join(',');
            if (hubFilterState.phases.length > 0) state.hp = hubFilterState.phases.join(',');
            if (hubFilterState.familyCodes.length > 0) state.hfc = hubFilterState.familyCodes.join(',');
        }
    }

    // Count category state — only encode non-defaults
    const ccs = countCategoryState;
    const catParts = [];
    if (!ccs.critical) catParts.push('c0');
    if (!ccs.emergent) catParts.push('e0');
    if (!ccs.satisfactory) catParts.push('s0');
    if (!ccs.completed) catParts.push('p0');
    if (ccs.na) catParts.push('n1');
    // hubdata isolation removed — HUB Data button now cycles hubDataMode (encoded as 'hub' param)
    if (!ccs.total) catParts.push('t0');
    if (catParts.length > 0) state.cat = catParts.join(',');

    // Open category report popup
    const catPopup = document.getElementById('category-table-popup');
    if (catPopup) {
        if (window._maintTableCategory) state.rpt = 'm:' + window._maintTableCategory;
        else if (window._categoryTableCategory) state.rpt = 'i:' + window._categoryTableCategory;
    }

    // Which filter tab is on top
    const attrPanel = document.getElementById('attributesPanel');
    const condPanel = document.getElementById('evaluationPanel');
    if (attrPanel && attrPanel.classList.contains('ontop')) {
        state.tab = 'af';
    } else if (condPanel && condPanel.classList.contains('open') && !condPanel.classList.contains('behind')) {
        state.tab = 'cf';
    }

    // Encode to hash
    const params = new URLSearchParams(state);
    return window.location.origin + window.location.pathname + '#' + params.toString();
}

function generateShareableLink() {
    const url = generateShareableLinkUrl();
    navigator.clipboard.writeText(url).then(() => {
        console.log('Shareable link copied to clipboard');
        showShareLinkToast('Link copied to clipboard!');
    }).catch(() => {
        prompt('Copy this shareable link:', url);
    });
    return url;
}

function updateUrlHash() {
    if (!_urlUpdateEnabled) return;
    clearTimeout(_urlUpdateTimer);
    _urlUpdateTimer = setTimeout(() => {
        const url = generateShareableLinkUrl();
        history.replaceState(null, '', url);
    }, 500);
}

function showShareLinkToast(message) {
    const existing = document.getElementById('share-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'share-toast';
    toast.textContent = message;
    toast.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:#003b5c;color:#FFB81C;padding:10px 24px;border-radius:6px;border:1px solid #FFB81C;font-weight:600;font-size:11pt;z-index:99999;opacity:0;transition:opacity 0.3s;pointer-events:none;';
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.style.opacity = '1');
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

// ==================== SHARE POPOVER SYSTEM ====================

function buildBridgeZoomLink(bridge) {
    const state = { lat: Number(bridge.latitude).toFixed(5), lng: Number(bridge.longitude).toFixed(5), z: 15 };
    const params = new URLSearchParams(state);
    return window.location.origin + window.location.pathname + '#' + params.toString();
}

function buildBridgeDataText(bridge, selectedKeys) {
    const name = cleanBridgeName(bridge.bridge_name);
    const lines = [];
    lines.push(`${name} (${bridge.bars_number})`);
    lines.push(`District ${bridge.district ? bridge.district.replace('District ', '') : 'N/A'}`);
    lines.push('');

    if (selectedKeys.includes('attributes')) {
        lines.push('--- Attributes ---');
        lines.push(`Location: ${bridge.location || 'N/A'}`);
        lines.push(`Route: ${bridge.route || 'N/A'}${bridge.subroute ? ' / ' + bridge.subroute : ''}`);
        lines.push(`Functional Class: ${bridge.functional_class || 'N/A'}`);
        lines.push(`NHS: ${bridge.nhs === 1 || bridge.nhs === '1' || (typeof bridge.nhs === 'string' && bridge.nhs.toLowerCase() === 'yes') ? 'Yes' : 'No'}`);
        lines.push(`On Bridge: ${bridge.on_bridge || 'N/A'}`);
        lines.push(`Under Bridge: ${bridge.under_bridge || 'N/A'}`);
        lines.push(`Bridge Type: ${bridge.bridge_type || 'N/A'}${bridge.bridge_type_code ? ' (' + bridge.bridge_type_code + ')' : ''}`);
        lines.push(`ADT: ${bridge.adt != null ? Number(bridge.adt).toLocaleString() : 'N/A'}${bridge.adt_year ? ' (' + bridge.adt_year + ')' : ''}`);
        lines.push(`Utilities: ${bridge.utilities_on_bridge || 'N/A'}`);
        lines.push('');
    }

    if (selectedKeys.includes('geometry')) {
        lines.push('--- Geometry ---');
        lines.push(`Length: ${bridge.bridge_length || 'N/A'} ft`);
        lines.push(`Total Length: ${bridge.total_bridge_length || 'N/A'} ft`);
        lines.push(`Width (Out-to-Out): ${bridge.width_out_to_out || 'N/A'} ft`);
        lines.push(`Width (Curb-to-Curb): ${bridge.width_curb_to_curb || 'N/A'} ft`);
        lines.push(`Area: ${bridge.bridge_area != null ? Number(bridge.bridge_area).toLocaleString() : 'N/A'} sq ft`);
        lines.push(`Year Built: ${bridge.year_built || 'N/A'}`);
        lines.push(`Age: ${bridge.bridge_age != null ? bridge.bridge_age + ' years' : 'N/A'}`);
        lines.push(`Skew: ${bridge.skew || 'N/A'}`);
        if (bridge.span_lengths) lines.push(`Spans: ${bridge.span_lengths}`);
        lines.push('');
    }

    if (selectedKeys.includes('condition')) {
        lines.push('--- Condition Ratings ---');
        const r = (v) => (v != null && !isNaN(v) && v >= 1 && v <= 9) ? v : 'N/A';
        lines.push(`Deck: ${r(bridge.deck_rating)}`);
        lines.push(`Superstructure: ${r(bridge.superstructure_rating)}`);
        lines.push(`Substructure: ${r(bridge.substructure_rating)}`);
        lines.push(`Bearings: ${r(bridge.bearings_rating)}`);
        lines.push(`Joints: ${r(bridge.joints_rating)}`);
        const bars = bridge.bars_number;
        if (sufficiencyData[bars] != null) {
            lines.push(`Sufficiency: ${sufficiencyData[bars].toFixed(1)}`);
        }
        lines.push('');
    }

    if (selectedKeys.includes('narrative')) {
        lines.push('--- Narratives ---');
        const narFields = [
            ['Paint', 'narrative_paint'], ['Deck', 'narrative_deck'],
            ['Superstructure', 'narrative_superstructure'], ['Substructure', 'narrative_substructure'],
            ['Joints', 'narrative_joints'], ['Railings', 'narrative_railings'],
            ['Summary', 'narrative_summary'], ['Comments', 'narrative_comments']
        ];
        narFields.forEach(([label, field]) => {
            if (bridge[field]) lines.push(`${label}: ${bridge[field]}`);
        });
        lines.push('');
    }

    if (selectedKeys.includes('inspection')) {
        const insps = inspectionsData[bridge.bars_number];
        if (insps && insps.length > 0) {
            lines.push('--- Inspections ---');
            insps.forEach(insp => {
                lines.push(`${insp.type}: Due ${insp.due || 'N/A'} (Interval: ${insp.interval || 'N/A'} mo)`);
            });
            lines.push('');
        }
    }

    if (selectedKeys.includes('hubdata')) {
        const projects = hubData[bridge.bars_number];
        if (projects && projects.length > 0) {
            lines.push('--- HUB Projects ---');
            projects.forEach(p => {
                lines.push(`${p.project || ''} - ${p.name || ''} | Phase: ${p.phase || 'N/A'} | Status: ${p.phase_status || 'N/A'}`);
            });
            lines.push('');
        }
    }

    return {
        subject: `SpanBase — ${name} (${bridge.bars_number})`,
        body: lines.join('\n')
    };
}

function buildCrReportText() {
    // Determine which report type is active
    const isMaint = !!window._maintTableRows;
    const rows = isMaint ? window._maintTableRows : window._categoryTableRows;
    const label = isMaint
        ? (window._maintTableLabel || window._maintTableCategory || 'Report')
        : (window._categoryTableCategory ? getInspectionTableTitle(window._categoryTableCategory) : 'Report');

    if (!rows || rows.length === 0) return { subject: 'SpanBase Report', body: 'No data available.' };

    const lines = [];
    lines.push(`${label} — ${rows.length} Bridge${rows.length !== 1 ? 's' : ''}`);
    lines.push('');

    if (isMaint) {
        const r = (v) => (v != null && !isNaN(v) && v >= 1 && v <= 9) ? v : 'N/A';
        rows.forEach((row, i) => {
            const n = (row.name || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
            lines.push(`${i + 1}. D${row.district.replace('District ', '')} | ${row.bars} | ${n} | Deck:${r(row.deck)} Super:${r(row.superstructure)} Sub:${r(row.substructure)} | Suff:${row.sufficiencyDisplay} | NHS:${row.nhs === 1 || row.nhs === '1' ? 'Yes' : 'No'}`);
        });
    } else {
        rows.forEach((row, i) => {
            const n = (row.name || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
            let d = row.days > 0 ? `${row.days} days past due` : row.days === 0 ? 'Due today' : `in ${Math.abs(row.days)} days`;
            lines.push(`${i + 1}. D${row.district.replace('District ', '')} | ${row.bars} | ${n} | ${row.type} | Due: ${row.dueDateStr} | ${d}`);
        });
    }

    return {
        subject: `SpanBase ${label}`,
        body: lines.join('\n')
    };
}

function showSharePopover(anchorEl, config) {
    // Remove existing popover
    const existing = document.getElementById('share-popover');
    if (existing) existing.remove();

    const popover = document.createElement('div');
    popover.id = 'share-popover';
    popover.style.cssText = 'position:fixed;z-index:100000;background:#003B5C;border:1px solid #FFB81C;border-radius:8px;padding:14px 16px;box-shadow:0 8px 24px rgba(0,0,0,0.5);min-width:220px;max-width:320px;font-family:Aptos,Roboto,sans-serif;';

    let whatHtml = '';
    const popoverId = 'share-popover';

    if (config.whatMode === 'radio') {
        whatHtml = `<div style="margin-bottom:10px;">
            <div style="color:#FFB81C;font-size:9pt;font-weight:600;margin-bottom:6px;">What to Share</div>
            ${config.options.map((opt, i) => `
                <label style="display:flex;align-items:center;gap:6px;color:#fff;font-size:10pt;margin-bottom:4px;cursor:pointer;">
                    <input type="radio" name="share-what" value="${opt.value}" ${i === 0 ? 'checked' : ''} style="accent-color:#FFB81C;">
                    ${opt.label}
                </label>`).join('')}
        </div>`;
    } else if (config.whatMode === 'checkbox') {
        whatHtml = `<div style="margin-bottom:10px;">
            <div style="color:#FFB81C;font-size:9pt;font-weight:600;margin-bottom:6px;">What to Share</div>
            ${config.options.map(opt => `
                <label style="display:flex;align-items:center;gap:6px;color:#fff;font-size:10pt;margin-bottom:4px;cursor:pointer;">
                    <input type="checkbox" class="share-what-cb" value="${opt.value}" ${opt.checked ? 'checked' : ''} style="accent-color:#FFB81C;">
                    ${opt.label}
                </label>`).join('')}
        </div>`;
    }

    const howHtml = `
        <div style="color:#FFB81C;font-size:9pt;font-weight:600;margin-bottom:6px;">How to Share</div>
        <div style="display:flex;gap:6px;">
            <button id="share-btn-link" style="flex:1;padding:6px 0;background:rgba(255,184,28,0.15);border:1px solid #FFB81C;color:#FFB81C;border-radius:4px;cursor:pointer;font-size:10pt;font-weight:600;">&#128279; Link</button>
            <button id="share-btn-email" style="flex:1;padding:6px 0;background:rgba(255,184,28,0.15);border:1px solid #FFB81C;color:#FFB81C;border-radius:4px;cursor:pointer;font-size:10pt;font-weight:600;">&#9993; Email</button>
            <button id="share-btn-qr" style="flex:1;padding:6px 0;background:rgba(255,184,28,0.15);border:1px solid #FFB81C;color:#FFB81C;border-radius:4px;cursor:pointer;font-size:10pt;font-weight:600;">&#9638; QR</button>
        </div>
        <div id="share-qr-container" style="display:none;margin-top:10px;justify-content:center;"></div>
        <div id="share-status" style="display:none;margin-top:8px;text-align:center;color:#FFB81C;font-size:9pt;font-weight:600;"></div>
    `;

    popover.innerHTML = whatHtml + howHtml;
    document.body.appendChild(popover);

    // Position near anchor
    const rect = anchorEl.getBoundingClientRect();
    const popH = popover.offsetHeight;
    const popW = popover.offsetWidth;
    let top = rect.bottom + 6;
    let left = rect.left;
    // If too close to bottom, show above
    if (top + popH > window.innerHeight - 10) top = rect.top - popH - 6;
    // Keep within viewport horizontally
    if (left + popW > window.innerWidth - 10) left = window.innerWidth - popW - 10;
    if (left < 10) left = 10;
    popover.style.top = top + 'px';
    popover.style.left = left + 'px';

    // Helper to read current "what" selection
    function getShareData() {
        if (config.whatMode === 'radio') {
            const checked = popover.querySelector('input[name="share-what"]:checked');
            return checked ? checked.value : config.options[0].value;
        }
        if (config.whatMode === 'checkbox') {
            return Array.from(popover.querySelectorAll('.share-what-cb:checked')).map(cb => cb.value);
        }
        return 'view'; // whatMode: 'none'
    }

    function showStatus(msg) {
        const el = document.getElementById('share-status');
        if (el) { el.textContent = msg; el.style.display = 'block'; }
        setTimeout(() => { if (el) el.style.display = 'none'; }, 2500);
    }

    // Build content based on selection
    function getContent() {
        return config.getContent(getShareData());
    }

    // Link button
    popover.querySelector('#share-btn-link').addEventListener('click', function() {
        const content = getContent();
        const text = content.url || content.body || '';
        navigator.clipboard.writeText(text).then(() => {
            showStatus('Copied to clipboard!');
        }).catch(() => {
            prompt('Copy this:', text);
        });
    });

    // Email button
    popover.querySelector('#share-btn-email').addEventListener('click', function() {
        const content = getContent();
        const subject = encodeURIComponent(content.subject || 'SpanBase');
        const body = encodeURIComponent(content.url ? content.body + '\n\n' + content.url : content.body || '');
        window.open(`mailto:?subject=${subject}&body=${body}`, '_self');
    });

    // QR button
    popover.querySelector('#share-btn-qr').addEventListener('click', function() {
        const container = document.getElementById('share-qr-container');
        if (!container) return;
        if (container.style.display !== 'none') {
            container.style.display = 'none';
            container.innerHTML = '';
            return;
        }
        container.style.display = 'flex';
        container.innerHTML = '';
        const content = getContent();
        const qrUrl = content.url || content.body || '';
        if (qrUrl.length > 2000) {
            container.innerHTML = '<div style="color:#FCA5A5;font-size:9pt;">Content too long for QR code. Use Link or Email instead.</div>';
            return;
        }
        try {
            new QRCode(container, {
                text: qrUrl,
                width: 160,
                height: 160,
                colorDark: '#003B5C',
                colorLight: '#FFFFFF',
                correctLevel: QRCode.CorrectLevel.M
            });
        } catch (e) {
            container.innerHTML = '<div style="color:#FCA5A5;font-size:9pt;">Could not generate QR code.</div>';
        }
    });

    // Close on outside click (delayed to avoid immediate close)
    setTimeout(() => {
        function onOutsideClick(e) {
            if (!popover.contains(e.target) && e.target !== anchorEl && !anchorEl.contains(e.target)) {
                popover.remove();
                document.removeEventListener('mousedown', onOutsideClick);
            }
        }
        document.addEventListener('mousedown', onOutsideClick);
    }, 100);
}

// ==================== SHARE LOCATION WRAPPERS ====================

function openCfShare(btn) {
    showSharePopover(btn, {
        whatMode: 'none',
        getContent: function() {
            const url = generateShareableLinkUrl();
            return { subject: 'SpanBase — Current View', body: 'Check out this SpanBase view:', url: url };
        }
    });
}

function openAfShare(btn) {
    showSharePopover(btn, {
        whatMode: 'none',
        getContent: function() {
            const url = generateShareableLinkUrl();
            return { subject: 'SpanBase — Current View', body: 'Check out this SpanBase view:', url: url };
        }
    });
}

function openCrReportShare(btn) {
    showSharePopover(btn, {
        whatMode: 'radio',
        options: [
            { value: 'view', label: 'Current View (link)' },
            { value: 'data', label: 'Report Data (text)' }
        ],
        getContent: function(selection) {
            if (selection === 'data') {
                const report = buildCrReportText();
                return { subject: report.subject, body: report.body };
            }
            const url = generateShareableLinkUrl();
            return { subject: 'SpanBase — Current View', body: 'Check out this SpanBase view:', url: url };
        }
    });
}

function openRadialShare(btn, bridge) {
    showSharePopover(btn, {
        whatMode: 'checkbox',
        options: [
            { value: 'attributes', label: 'Attributes', checked: false },
            { value: 'geometry', label: 'Geometry', checked: false },
            { value: 'condition', label: 'Condition', checked: false },
            { value: 'narrative', label: 'Narratives', checked: false },
            { value: 'inspection', label: 'Inspections', checked: false },
            { value: 'hubdata', label: 'HUB Data', checked: false },
            { value: 'view', label: 'Current View', checked: true }
        ],
        getContent: function(selectedValues) {
            const dataKeys = selectedValues.filter(v => v !== 'view');
            const includesView = selectedValues.includes('view');
            const url = includesView ? buildBridgeZoomLink(bridge) : null;

            if (dataKeys.length === 0 && includesView) {
                return { subject: 'SpanBase — ' + cleanBridgeName(bridge.bridge_name), body: 'Check out this bridge on SpanBase:', url: url };
            }

            const data = dataKeys.length > 0 ? buildBridgeDataText(bridge, dataKeys) : { subject: 'SpanBase — ' + cleanBridgeName(bridge.bridge_name), body: '' };
            return { subject: data.subject, body: data.body, url: url };
        }
    });
}

// ==================== REPORT MODE ====================

function toggleReportsPanel() {
    const panel = document.getElementById('reportsPanel');
    if (!panel) return;

    if (reportPanelOpen) {
        // Close
        panel.classList.remove('open', 'ontop');
        reportPanelOpen = false;
        removeReportHighlight();
        reportBarsSet = null;
        // Clear condition rating filters
        reportConditionFilters = {};
        reportSufficiencyFilter = null;
        // Restore bridge visibility to normal
        updateBridgeVisibility();
        updateReStatusBar();
    } else {
        // Open
        panel.classList.add('open', 'ontop');
        reportPanelOpen = true;
        // Detect context: if came from inspection mode, default to inspection view
        if (inspectionFiltersActive || currentMode === 'inspection' || bothActiveSection === 'insp') {
            reportViewMode = 'inspection';
        } else {
            reportViewMode = 'maintenance';
        }
        // Reset map mode to Pan+Zoom on fresh open
        reportMapMode = 'panZoom';
        // Build mode bar, category buttons + load default category
        renderReportModeBar();
        buildReportCategoryButtons();
        buildReportBridgeList(reportCategory);
        if (reportBridgeList.length > 0) {
            reportCurrentIndex = 0;
            renderReportDetail(reportBridgeList[0]);
        }
        updateReportNav();
        renderReportBridgeList();
        // Sync CR and apply category filter
        syncCRWithReCategory(reportCategory);
        applyReportCategoryFilter();
        // Autozoom to bounding box of filtered bridges
        setTimeout(autoZoomToFilteredBridges, 100);
        updateReStatusBar();
        // Auto-launch RE tutorial on first open this session
        if (!reTourShownThisSession) {
            reTourShownThisSession = true;
            setTimeout(function() { startReTour(); }, 400);
        }
    }
}

// Open report panel focused on a specific bridge (from radial menu)
function openBridgeReport(bridge) {
    const panel = document.getElementById('reportsPanel');
    if (!panel) return;

    // Close radial menu since we're transitioning to report mode
    closeAllMenus();

    // Open the panel if not already open
    if (!reportPanelOpen) {
        panel.classList.add('open', 'ontop');
        reportPanelOpen = true;
        // Detect context
        if (inspectionFiltersActive || currentMode === 'inspection' || bothActiveSection === 'insp') {
            reportViewMode = 'inspection';
        } else {
            reportViewMode = 'maintenance';
        }
        renderReportModeBar();
        buildReportCategoryButtons();
    }

    // Set category to 'total' to ensure the bridge is in the list
    reportCategory = 'total';
    buildReportBridgeList('total');
    updateReportCategoryButtonStates();

    // Find the bridge in the list
    const idx = reportBridgeList.findIndex(b => b.bars_number === bridge.bars_number);
    if (idx >= 0) {
        reportCurrentIndex = idx;
    } else {
        // Bridge not in filtered list (shouldn't happen with 'total'), add it and go
        reportBridgeList.unshift(bridge);
        reportCurrentIndex = 0;
    }

    renderReportDetail(reportBridgeList[reportCurrentIndex]);
    updateReportNav();
    renderReportBridgeList();
    highlightReportBridge(reportBridgeList[reportCurrentIndex]);
    syncCRWithReCategory(reportCategory);
    applyReportCategoryFilter();
    updateReStatusBar();
}

function buildReportCategoryButtons() {
    const bar = document.getElementById('reportCategoryBar');
    if (!bar) return;

    const isMaint = reportViewMode === 'maintenance';
    const categories = isMaint ? [
        { key: 'total',         label: 'Total',         color: '#FFB81C' },
        { key: 'critical',      label: 'Critical',      color: '#dc2626' },
        { key: 'emergent',      label: 'Emergent',      color: '#F97316' },
        { key: 'satisfactory',  label: 'Satisfactory',  color: '#10B981' },
        { key: 'na',            label: 'N/A',           color: '#6b7280' },
        { key: 'hubdata',       label: 'HUB',           color: '#22c55e' }
    ] : [
        { key: 'total',         label: 'Total',         color: '#FFB81C' },
        { key: 'critical',      label: 'Past Due',      color: '#dc2626' },
        { key: 'emergent',      label: 'Upcoming',      color: '#F97316' },
        { key: 'satisfactory',  label: 'Completed',     color: '#10B981' },
        { key: 'na',            label: 'N/A',           color: '#6b7280' },
        { key: 'hubdata',       label: 'HUB',           color: '#22c55e' }
    ];

    bar.innerHTML = categories.map(c => {
        const active = reportCategory === c.key;
        return `<button class="report-cat-btn" data-cat="${c.key}" onclick="switchReportCategory('${c.key}')"
            style="padding:3px 8px; font-size:8pt; font-weight:600; border-radius:4px; cursor:pointer;
            border:1px solid ${c.color}; color:${active ? '#fff' : '#fff'};
            background:${active ? c.color : c.color + '44'}; transition:all 0.15s;
            ${active ? 'box-shadow:0 0 6px ' + c.color + '80;' : ''}">
            ${c.label}</button>`;
    }).join('');
}

function updateReportCategoryButtonStates() {
    document.querySelectorAll('.report-cat-btn').forEach(btn => {
        const cat = btn.getAttribute('data-cat');
        const colors = { total:'#FFB81C', critical:'#dc2626', emergent:'#F97316', satisfactory:'#10B981', na:'#6b7280', hubdata:'#22c55e' };
        const c = colors[cat] || '#FFB81C';
        const active = reportCategory === cat;
        btn.style.color = '#fff';
        btn.style.background = active ? c : c + '44';
        btn.style.boxShadow = active ? '0 0 6px ' + c + '80' : 'none';
    });
}

function switchReportCategory(category) {
    reportCategory = category;
    // Clear condition locks before rebuilding list so old locks don't carry over
    reportConditionFilters = {};
    reportSufficiencyFilter = null;
    buildReportBridgeList(category);
    reportCurrentIndex = 0;
    updateReportCategoryButtonStates();

    // Sync CR to match RE category
    syncCRWithReCategory(category);

    removeReportHighlight();
    if (reportBridgeList.length > 0) {
        renderReportDetail(reportBridgeList[0]);
    } else {
        document.getElementById('reportDetail').innerHTML = '<div style="color:#999;text-align:center;padding:20px;">No bridges in this category.</div>';
        document.getElementById('reportTitleBox').innerHTML = '';
    }
    updateReportNav();
    renderReportBridgeList();

    // When a category is fully engaged, apply hard filter (only show those bridges)
    applyReportCategoryFilter();
    updateReStatusBar();
}

function getWorstInspectionDays(bridge, today) {
    const inspections = inspectionsData[bridge.bars_number];
    if (!inspections || inspections.length === 0) return -Infinity;
    let worstDays = -Infinity;
    inspections.forEach(insp => {
        const due = parseDateString(insp.due);
        if (!due) return;
        const days = Math.floor((today - due) / 86400000);
        if (days > worstDays) worstDays = days;
    });
    return worstDays;
}

function buildReportBridgeList(category) {
    reportBridgeList = [];

    Object.entries(bridgeLayers).forEach(([bars, layer]) => {
        const bridge = layer.bridgeData;
        if (!bridge) return;

        // Apply all active filters: district
        if (!activeDistricts[bridge.district]) return;

        // Search filter
        if (currentSearchQuery) {
            const q = currentSearchQuery.toLowerCase();
            const name = (bridge.bridge_name || '').toLowerCase();
            const barsLower = bars.toLowerCase();
            const route = (bridge.route || '').toLowerCase();
            if (!name.includes(q) && !barsLower.includes(q) && !route.includes(q)) return;
        }

        // Box exclusion
        if (boxExcludedBars.has(bars)) return;

        // Sufficiency filter
        if (typeof sliderValues !== 'undefined' && sliderValues.sufficiency !== undefined && sliderValues.sufficiency > 0) {
            const suf = sufficiencyData[bars];
            if (suf !== undefined) {
                if (sufficiencyMode === 'lte' && suf >= sliderValues.sufficiency) return;
                if (sufficiencyMode === 'gte' && suf <= sliderValues.sufficiency) return;
            }
        }

        // Category filter — use inspection or maintenance categories based on view mode
        if (category === 'total') {
            // Include all that pass filters
        } else if (category === 'hubdata') {
            if (!projectsData[bars] && !hubData[bars]) return;
        } else if (reportViewMode === 'inspection') {
            if (getInspectionCategoryForBridge(bridge) !== category) return;
        } else {
            if (getBridgeCategory(bridge) !== category) return;
        }

        // Condition lock filters (only in maintenance mode)
        if (reportViewMode === 'maintenance') {
            for (const [field, val] of Object.entries(reportConditionFilters)) {
                if (String(bridge[field]) !== String(val)) return;
            }
            if (reportSufficiencyFilter !== null) {
                const suf = sufficiencyData[bars];
                if (suf === undefined) return;
                if (suf < reportSufficiencyFilter - 10 || suf > reportSufficiencyFilter + 10) return;
            }
        }

        reportBridgeList.push(bridge);
    });

    // Sort to match CR table order: district ascending, then days descending (worst first)
    const today = new Date();
    reportBridgeList.sort((a, b) => {
        // District number comparison
        const dA = parseInt((a.district || '').replace(/\D/g, '')) || 0;
        const dB = parseInt((b.district || '').replace(/\D/g, '')) || 0;
        if (dA !== dB) return dA - dB;
        // In inspection mode, sort by worst days descending; else bridge name
        if (reportViewMode === 'inspection') {
            const daysA = getWorstInspectionDays(a, today);
            const daysB = getWorstInspectionDays(b, today);
            return daysB - daysA;
        }
        return (a.bridge_name || '').localeCompare(b.bridge_name || '');
    });

    // Update BARS lookup set
    reportBarsSet = new Set(reportBridgeList.map(b => b.bars_number));
}

function renderReportModeBar() {
    const bar = document.getElementById('reportModeBar');
    if (!bar) return;
    const isMaint = reportViewMode === 'maintenance';
    const activeBg = '#8B0000';
    const activeColor = '#fff';
    const inactiveBg = 'rgba(30,64,175,0.25)';
    const inactiveColor = 'rgba(255,255,255,0.5)';
    const maintBg = isMaint ? activeBg : inactiveBg;
    const maintColor = isMaint ? activeColor : inactiveColor;
    const inspBg = !isMaint ? activeBg : inactiveBg;
    const inspColor = !isMaint ? activeColor : inactiveColor;
    bar.innerHTML = `
        <div style="display:flex; gap:0; margin-bottom:8px; border-radius:5px; overflow:hidden; border:1px solid rgba(255,255,255,0.4);">
            <div onclick="if(reportViewMode!=='maintenance'){toggleReportViewMode();}"
                style="flex:1; background:${maintBg}; color:${maintColor}; text-align:center; font-size:9pt; font-weight:700; padding:6px 8px; cursor:pointer; letter-spacing:0.5px; transition:all 0.2s; user-select:none;"
                data-tip="Switch to Maintenance mode"
                onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
                Maintenance
            </div>
            <div onclick="if(reportViewMode!=='inspection'){toggleReportViewMode();}"
                style="flex:1; background:${inspBg}; color:${inspColor}; text-align:center; font-size:9pt; font-weight:700; padding:6px 8px; cursor:pointer; letter-spacing:0.5px; transition:all 0.2s; user-select:none; border-left:1px solid rgba(255,255,255,0.4);"
                data-tip="Switch to Inspection mode"
                onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
                Inspection
            </div>
        </div>`;
}

window.toggleReportViewMode = function() {
    reportViewMode = reportViewMode === 'maintenance' ? 'inspection' : 'maintenance';

    // Clear CR category isolation so bridge visibility agrees with the new mode
    if (bothActiveSection || bothActiveCategory) {
        bothActiveSection = null;
        bothActiveCategory = null;
        applyBothCategoryFilter();
        updateBothButtonStyles();
        updateButtonStyles();
    }

    renderReportModeBar();
    buildReportCategoryButtons();
    buildReportBridgeList(reportCategory);
    reportCurrentIndex = 0;
    removeReportHighlight();
    if (reportBridgeList.length > 0) {
        renderReportDetail(reportBridgeList[0]);
    } else {
        document.getElementById('reportDetail').innerHTML = '';
        document.getElementById('reportTitleBox').innerHTML = '';
    }
    updateReportNav();
    renderReportBridgeList();
    syncCRWithReCategory(reportCategory);
    applyReportCategoryFilter();
    updateReStatusBar();
};

function updateReportNav() {
    // Nav is now part of the title box — just re-render the title box
    renderReportTitleBox();
}

function renderReportTitleBox() {
    const box = document.getElementById('reportTitleBox');
    if (!box) return;
    if (reportBridgeList.length === 0) {
        box.innerHTML = '<div style="padding:8px; text-align:center; color:rgba(255,255,255,0.5); font-size:9pt;">No bridges in this category</div>';
        return;
    }
    const bridge = reportBridgeList[reportCurrentIndex];
    const bridgeName = cleanBridgeName(bridge.bridge_name || 'Unknown');
    const titleCase = bridgeName.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    const modeIcons = { panZoom: 'Pan+Zoom', pan: 'Pan', off: 'Off' };
    const modeLabel = modeIcons[reportMapMode];
    const modeTip = 'Click to cycle: Pan+Zoom → Pan → Off';

    box.innerHTML = `
        <div style="margin-bottom:8px; padding:8px; background:rgba(0,59,92,0.5); border:1px solid rgba(255,184,28,0.3); border-radius:6px; text-align:center; display:flex; align-items:center; justify-content:space-between; gap:6px;">
            <button onclick="reportPrevBridge()" style="background:rgba(255,184,28,0.15); border:1px solid #FFB81C; color:#FFB81C; border-radius:4px; cursor:pointer; font-size:12pt; font-weight:700; padding:4px 8px; line-height:1; flex-shrink:0; align-self:center;">&#9650;</button>
            <div style="flex:1; min-width:0;">
                <div style="font-size:10pt; font-weight:700; color:#FFB81C; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${titleCase}</div>
                <div style="font-size:7pt; color:rgba(255,255,255,0.6); margin-top:3px; display:flex; justify-content:center; align-items:center; gap:6px;">
                    <span style="color:#FFB81C;">${reportCurrentIndex + 1}</span>/<span style="color:#FFB81C;">${reportBridgeList.length}</span>
                    <span style="color:rgba(255,255,255,0.25);">|</span>
                    <a href="https://www.google.com/maps?q=${bridge.latitude},${bridge.longitude}" target="_blank" style="color:#FFB81C; text-decoration:none; font-size:7pt;">Google Maps</a>
                    <span style="color:rgba(255,255,255,0.25);">|</span>
                    <a href="${bridge.bars_hyperlink || '#'}" target="_blank" style="color:#FFB81C; text-decoration:none; font-size:7pt;">AssetWise</a>
                    <span style="color:rgba(255,255,255,0.25);">|</span>
                    <span onclick="cycleReportMapMode()" style="cursor:pointer; color:rgba(255,255,255,0.7); font-size:7pt; font-weight:600; background:rgba(255,255,255,0.08); padding:1px 4px; border-radius:3px;" data-tip="${modeTip}">${modeLabel}</span>
                </div>
            </div>
            <button onclick="reportNextBridge()" style="background:rgba(255,184,28,0.15); border:1px solid #FFB81C; color:#FFB81C; border-radius:4px; cursor:pointer; font-size:12pt; font-weight:700; padding:4px 8px; line-height:1; flex-shrink:0; align-self:center;">&#9660;</button>
        </div>`;
}

window.cycleReportMapMode = function() {
    const modes = ['panZoom', 'pan', 'off'];
    const idx = modes.indexOf(reportMapMode);
    reportMapMode = modes[(idx + 1) % modes.length];
    renderReportTitleBox();
};

function renderReportBridgeList() {
    const box = document.getElementById('reportBridgeListBox');
    if (!box) return;
    if (reportBridgeList.length === 0) {
        box.innerHTML = '';
        return;
    }

    const isMaint = reportViewMode === 'maintenance';
    const today = new Date();
    const currentYear = today.getFullYear();
    let rows = '';

    reportBridgeList.forEach((b, i) => {
        const name = cleanBridgeName(b.bridge_name || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
        const dist = b.district ? b.district.replace('District ', 'D') : '';
        const active = i === reportCurrentIndex;
        const bg = active ? 'background:rgba(255,184,28,0.2);' : '';

        if (isMaint) {
            const nhs = b.nhs ? b.nhs : '—';
            const adt = b.adt != null ? b.adt.toLocaleString() : '—';
            const age = b.year_built ? (currentYear - b.year_built) : '—';

            rows += `<div id="bl-row-${i}" onclick="reportGoToBridge(${i})" style="display:flex; align-items:center; gap:4px; padding:3px 4px; cursor:pointer; font-size:8pt; ${bg} border-bottom:1px solid rgba(255,255,255,0.06); transition:background 0.1s;" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='${active ? 'rgba(255,184,28,0.2)' : ''}'">
                <span style="color:rgba(255,255,255,0.4); width:20px; text-align:right; flex-shrink:0;">${i + 1}</span>
                <span style="color:rgba(255,255,255,0.5); width:18px; flex-shrink:0;">${dist}</span>
                <span style="flex:1; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${name}</span>
                <span style="color:rgba(255,255,255,0.5); width:24px; text-align:center; flex-shrink:0;">${nhs}</span>
                <span style="color:rgba(255,255,255,0.5); width:40px; text-align:right; flex-shrink:0;">${adt}</span>
                <span style="color:rgba(255,255,255,0.5); width:24px; text-align:right; flex-shrink:0;">${age}</span>
            </div>`;
        } else {
            // Inspection mode: Type, Interval, Days (no Due column)
            const inspections = inspectionsData[b.bars_number];
            let type = '—', interval = '—', status = '—', statusColor = 'rgba(255,255,255,0.5)';
            if (inspections && inspections.length > 0) {
                // Find worst inspection
                let worstInsp = null, worstDays = -Infinity;
                inspections.forEach(insp => {
                    const due = parseDateString(insp.due);
                    if (!due) return;
                    const days = Math.floor((today - due) / 86400000);
                    if (days > worstDays) { worstDays = days; worstInsp = insp; }
                });
                if (worstInsp) {
                    type = worstInsp.type || '—';
                    interval = (worstInsp.interval || 24) + 'mo';
                    if (worstDays > 0) {
                        status = worstDays + 'd';
                        statusColor = '#FCA5A5';
                    } else if (worstDays > -60) {
                        status = Math.abs(worstDays) + 'd';
                        statusColor = '#FBBF24';
                    } else {
                        status = Math.abs(worstDays) + 'd';
                        statusColor = '#6EE7B7';
                    }
                }
            }

            rows += `<div id="bl-row-${i}" onclick="reportGoToBridge(${i})" style="display:flex; align-items:center; gap:4px; padding:3px 4px; cursor:pointer; font-size:8pt; ${bg} border-bottom:1px solid rgba(255,255,255,0.06); transition:background 0.1s;" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='${active ? 'rgba(255,184,28,0.2)' : ''}'">
                <span style="color:rgba(255,255,255,0.4); width:20px; text-align:right; flex-shrink:0;">${i + 1}</span>
                <span style="color:rgba(255,255,255,0.5); width:18px; flex-shrink:0;">${dist}</span>
                <span style="flex:1; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${name}</span>
                <span style="color:rgba(255,255,255,0.5); width:42px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex-shrink:0;">${type}</span>
                <span style="color:rgba(255,255,255,0.5); width:28px; text-align:right; flex-shrink:0;">${interval}</span>
                <span style="color:${statusColor}; width:42px; text-align:right; flex-shrink:0;">${status}</span>
            </div>`;
        }
    });

    // Column header — mode dependent
    let header;
    if (isMaint) {
        header = `<div style="display:flex; align-items:center; gap:4px; padding:2px 4px; font-size:7pt; color:rgba(255,255,255,0.35); border-bottom:1px solid rgba(255,255,255,0.12); text-transform:uppercase; letter-spacing:0.5px;">
            <span style="width:20px; text-align:right; flex-shrink:0;">#</span>
            <span style="width:18px; flex-shrink:0;">D</span>
            <span style="flex:1;">Name</span>
            <span style="width:24px; text-align:center; flex-shrink:0;">NHS</span>
            <span style="width:40px; text-align:right; flex-shrink:0;">ADT</span>
            <span style="width:24px; text-align:right; flex-shrink:0;">Age</span>
        </div>`;
    } else {
        const daysHeader = reportCategory === 'critical' ? 'Over' : reportCategory === 'emergent' ? 'Until' : reportCategory === 'satisfactory' ? 'Since' : 'Days';
        header = `<div style="display:flex; align-items:center; gap:4px; padding:2px 4px; font-size:7pt; color:rgba(255,255,255,0.35); border-bottom:1px solid rgba(255,255,255,0.12); text-transform:uppercase; letter-spacing:0.5px;">
            <span style="width:20px; text-align:right; flex-shrink:0;">#</span>
            <span style="width:18px; flex-shrink:0;">D</span>
            <span style="flex:1;">Name</span>
            <span style="width:42px; flex-shrink:0;">Type</span>
            <span style="width:28px; text-align:right; flex-shrink:0;">Intv</span>
            <span style="width:42px; text-align:right; flex-shrink:0;">${daysHeader}</span>
        </div>`;
    }

    // Build status-aware section header
    const catLabels = isMaint
        ? { total: 'All', critical: 'Critical', emergent: 'Emergent', satisfactory: 'Satisfactory', na: 'N/A', hubdata: 'HUB' }
        : { total: 'All', critical: 'Past Due', emergent: 'Upcoming', satisfactory: 'Completed', na: 'N/A', hubdata: 'HUB' };
    const catLabel = catLabels[reportCategory] || reportCategory;
    const listType = isMaint ? 'Bridge List' : 'Inspection List';
    const listTitle = `${catLabel} ${listType} (${reportBridgeList.length})`;

    box.innerHTML = `
        <div class="report-section" style="margin-bottom:6px;">
            <div class="report-section-header" onclick="toggleReportSection(this)">
                <span class="report-arrow">▼</span> ${listTitle}
            </div>
            <div class="report-section-body" style="max-height:200px; overflow-y:auto; padding:2px 4px;">
                ${header}
                ${rows}
            </div>
        </div>`;

    // Scroll active row into view
    const activeRow = document.getElementById('bl-row-' + reportCurrentIndex);
    if (activeRow) {
        activeRow.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
}

function reportPrevBridge() {
    if (reportBridgeList.length === 0 || reportCurrentIndex <= 0) return;
    reportCurrentIndex--;
    renderReportDetail(reportBridgeList[reportCurrentIndex]);
    highlightReportBridge(reportBridgeList[reportCurrentIndex]);
    updateReportNav();
    renderReportBridgeList();
    applyReportCategoryFilter();
}

function reportNextBridge() {
    if (reportBridgeList.length === 0 || reportCurrentIndex >= reportBridgeList.length - 1) return;
    reportCurrentIndex++;
    renderReportDetail(reportBridgeList[reportCurrentIndex]);
    highlightReportBridge(reportBridgeList[reportCurrentIndex]);
    updateReportNav();
    renderReportBridgeList();
    applyReportCategoryFilter();
}

window.reportGoToBridge = function(idx) {
    if (idx < 0 || idx >= reportBridgeList.length) return;
    reportCurrentIndex = idx;
    renderReportDetail(reportBridgeList[reportCurrentIndex]);
    // Always autozoom when clicking a bridge in the list
    const bridge = reportBridgeList[reportCurrentIndex];
    removeReportHighlight();
    if (bridge && bridge.latitude && bridge.longitude) {
        const latlng = [parseFloat(bridge.latitude), parseFloat(bridge.longitude)];
        reportZoomFromNav = true;
        map.setView(latlng, 14);
        reportHighlightMarker = L.circleMarker(latlng, {
            radius: getHighlightRingRadius(), color: '#000000', weight: 3,
            fillColor: 'transparent', fillOpacity: 0,
            className: 'report-highlight-ring'
        }).addTo(map);
    }
    updateReportNav();
    renderReportBridgeList();
    applyReportCategoryFilter();
};

// Calculate highlight ring radius: point size + gap so there's always space between point and ring
function getHighlightRingRadius() {
    const pointSize = getPointSize();
    return pointSize + 6; // 6px gap between point edge and ring
}

function highlightReportBridge(bridge) {
    removeReportHighlight();
    if (!bridge || !bridge.latitude || !bridge.longitude) return;
    const latlng = [parseFloat(bridge.latitude), parseFloat(bridge.longitude)];
    // Only move the map if the bridge is NOT already in the current view
    const inView = map.getBounds().contains(latlng);
    if (!inView) {
        if (reportMapMode === 'panZoom') {
            reportZoomFromNav = true;
            map.setView(latlng, 12);
        } else if (reportMapMode === 'pan') {
            map.panTo(latlng);
        }
    }
    // Always place the highlight ring
    reportHighlightMarker = L.circleMarker(latlng, {
        radius: getHighlightRingRadius(),
        color: '#000000',
        weight: 3,
        fillColor: 'transparent',
        fillOpacity: 0,
        className: 'report-highlight-ring'
    }).addTo(map);
}

// Place ring only (no map movement) — used when CR syncs the RE
function placeReportHighlightRing(bridge) {
    removeReportHighlight();
    if (!bridge || !bridge.latitude || !bridge.longitude) return;
    const latlng = [parseFloat(bridge.latitude), parseFloat(bridge.longitude)];
    reportHighlightMarker = L.circleMarker(latlng, {
        radius: getHighlightRingRadius(), color: '#000000', weight: 3,
        fillColor: 'transparent', fillOpacity: 0,
        className: 'report-highlight-ring'
    }).addTo(map);
}

function removeReportHighlight() {
    if (reportHighlightMarker) {
        map.removeLayer(reportHighlightMarker);
        reportHighlightMarker = null;
    }
}

// Sync CR buttons to match RE category selection
function syncCRWithReCategory(category) {
    const section = reportViewMode === 'inspection' ? 'insp' : 'maint';
    if (category === 'total' || category === 'hubdata') {
        // Clear CR isolation
        if (bothActiveSection || bothActiveCategory) {
            bothActiveSection = null;
            bothActiveCategory = null;
            applyBothCategoryFilter();
            updateBothButtonStyles();
            updateButtonStyles();
        }
    } else {
        // Set CR to match
        bothActiveSection = section;
        bothActiveCategory = category;
        applyBothCategoryFilter();
        updateBothButtonStyles();
        updateButtonStyles();
    }
}

// Hard filter: when a category is fully engaged (clicked), only show matching bridges
function applyReportCategoryFilter() {
    if (!reportPanelOpen) return;
    // Build set of BARS in current list for quick lookup
    reportBarsSet = new Set(reportBridgeList.map(b => b.bars_number));

    const isInsp = reportViewMode === 'inspection';
    const hasCondLocks = !isInsp && (Object.keys(reportConditionFilters).length > 0 || reportSufficiencyFilter !== null);

    Object.entries(bridgeLayers).forEach(([bars, marker]) => {
        const bridge = marker.bridgeData;
        if (!bridge) return;
        if (!activeDistricts[bridge.district]) return;

        if (hasCondLocks) {
            // Condition locks active — show ALL points in maintenance colors
            const color = getWorstConditionColor(bridge);
            marker.setStyle({ fillColor: color });
            if (reportBarsSet.has(bars)) {
                // Matches locks — full prominence
                marker.setStyle({ fillOpacity: 1, opacity: 1 });
            } else {
                // Doesn't match — dimmed but visible
                marker.setStyle({ fillOpacity: 0.12, opacity: 0.4 });
            }
        } else if (reportBarsSet.has(bars)) {
            // In list — full opacity, correct color
            marker.setStyle({ fillOpacity: 1, opacity: 1 });
        } else {
            // Not in list — hidden (category is fully engaged)
            marker.setStyle({ fillOpacity: 0, opacity: 0 });
        }
    });
}


function toggleReportSection(headerEl) {
    const body = headerEl.nextElementSibling;
    if (!body) return;
    const arrow = headerEl.querySelector('.report-arrow');
    if (body.classList.contains('collapsed')) {
        body.classList.remove('collapsed');
        if (arrow) arrow.textContent = '▼';
    } else {
        body.classList.add('collapsed');
        if (arrow) arrow.textContent = '▶';
    }
}

// --- Open RE from CF Inspection tab ---

window.openReFromInspectionTab = function() {
    // Close CF/AF/HUB panels
    const condPanel = document.getElementById('evaluationPanel');
    const attrPanel = document.getElementById('attributesPanel');
    const hubPanel = document.getElementById('hubPanel');
    if (condPanel) condPanel.classList.remove('open', 'ontop', 'behind');
    if (attrPanel) attrPanel.classList.remove('open', 'ontop');
    if (hubPanel) { hubPanel.classList.remove('open', 'ontop'); hubPanelActive = false; }
    // Force inspection mode and open RE
    reportViewMode = 'inspection';
    if (!reportPanelOpen) toggleReportsPanel();
};

// --- RE Status Bar ---

function updateReStatusBar() {
    const bar = document.getElementById('re-status-bar');
    if (!bar) return;
    if (!reportPanelOpen) {
        bar.style.display = 'none';
        return;
    }
    bar.style.display = 'flex';
    const isMaint = reportViewMode === 'maintenance';
    bar.style.background = 'rgba(139, 0, 0, 0.95)';
    const modeLabel = isMaint ? 'Maintenance Mode' : 'Inspection Mode';
    const catLabels = isMaint
        ? { total: 'All Bridges', critical: 'Critical', emergent: 'Emergent', satisfactory: 'Satisfactory', na: 'N/A', hubdata: 'HUB Data' }
        : { total: 'All Bridges', critical: 'Past Due', emergent: 'Upcoming', satisfactory: 'Completed', na: 'N/A', hubdata: 'HUB Data' };
    const catLabel = catLabels[reportCategory] || reportCategory;
    const listType = isMaint ? 'Bridge List' : 'Inspection List';
    const textEl = document.getElementById('re-status-text');
    let lockInfo = '';
    if (isMaint) {
        const lockCount = Object.keys(reportConditionFilters).length + (reportSufficiencyFilter !== null ? 1 : 0);
        if (lockCount > 0) lockInfo = '  [' + lockCount + ' lock' + (lockCount > 1 ? 's' : '') + ']';
    }
    if (textEl) textEl.textContent = modeLabel + '  \u2014  ' + catLabel + ' ' + listType + ' (' + reportBridgeList.length + ')' + lockInfo;
    centerStatusBars();
}

// --- RE Share ---

function openReShare(btn) {
    showSharePopover(btn, {
        whatMode: 'none',
        getContent: function() {
            const url = generateShareableLinkUrl();
            return { subject: 'SpanBase — Report Explorer', body: 'Check out this SpanBase view:', url: url };
        }
    });
}

// --- Close RE when other tabs open ---

function closeReportExplorerIfOpen() {
    if (!reportPanelOpen) return;
    const panel = document.getElementById('reportsPanel');
    if (!panel) return;
    panel.classList.remove('open', 'ontop');
    reportPanelOpen = false;
    removeReportHighlight();
    reportBarsSet = null;
    updateBridgeVisibility();
    updateReStatusBar();
}

// --- RE Tutorial ---

let reTourAllowUpDown = false;

const reTourSteps = [
    {
        target: null,
        title: 'Report Explorer',
        text: 'The Report Explorer lets you browse bridge details by category. Navigate through bridges with arrow keys or buttons, view condition ratings, inspections, geometry, and more — all in one scrollable panel.\n\nLet\'s walk through how it works.'
    },
    {
        target: '#reportModeBar',
        title: 'Mode Selector',
        text: 'The Report Explorer has two modes:\n\n\u2022 Maintenance Mode — View bridges by condition rating (Critical, Emergent, Satisfactory)\n\n\u2022 Inspection Mode — View bridges by inspection due status (Past Due, Upcoming, Completed)\n\nClick either button to switch modes. The active mode is shown in red.',
        position: 'bottom'
    },
    {
        target: '#reportCategoryBar',
        title: 'Category Buttons',
        text: 'Use these buttons to filter the bridge list by category. Each button shows only bridges in that group.\n\nYou can also press Left/Right arrow keys to cycle through categories.',
        position: 'bottom'
    },
    {
        target: '#reportTitleBox',
        title: 'Bridge Navigation',
        text: 'The title box shows the current bridge name with navigation arrows.\n\n\u2022 \u25B2 \u25BC arrows — Move to previous/next bridge\n\u2022 Up/Down arrow keys — Same as clicking arrows\n\u2022 Google Maps link — Open bridge location in Google Maps\n\u2022 AssetWise link — Open bridge record in AssetWise\n\u2022 Pan+Zoom toggle — Control map behavior during navigation\n\nLook for the black ring on the map highlighting the current bridge. Try pressing Up or Down to move through the list.',
        position: 'bottom',
        allowUpDown: true,
        onEnter: function() {
            // Highlight current bridge on map
            if (reportBridgeList.length > 0) {
                highlightReportBridge(reportBridgeList[reportCurrentIndex]);
            }
            // Lighten the overlay so the user can see the bridge ring on the map
            const spot = document.getElementById('re-tour-spotlight');
            if (spot) spot.style.boxShadow = '0 0 0 9999px rgba(0,0,0,0.35)';
        },
        onExit: function() {
            removeReportHighlight();
            // Restore full overlay darkness
            const spot = document.getElementById('re-tour-spotlight');
            if (spot) spot.style.boxShadow = '0 0 0 9999px rgba(0,0,0,0.7)';
        }
    },
    {
        target: '#reportBridgeListBox',
        title: 'Bridge List & Details',
        text: 'The bridge list shows all bridges in the selected category. Click any row to jump to that bridge. The active bridge is highlighted in gold.\n\nBelow the list, detailed bridge information is shown in collapsible sections:\n\n\u2022 Condition & Sufficiency \u2014 Component ratings and calculated sufficiency\n\u2022 Inspections \u2014 Schedule and due-date status\n\u2022 Geometry & Attributes \u2014 Physical bridge characteristics\n\u2022 Narratives \u2014 The most recent inspection report as recorded in AssetWise, with a direct link to the bridge\'s AssetWise entry\n\nClick any section header to expand or collapse it.',
        position: 'right',
        getTooltipPosition: function(tRect) {
            const blEl = document.getElementById('reportBridgeListBox');
            if (blEl) {
                const blRect = blEl.getBoundingClientRect();
                return {
                    top: blRect.bottom + 8,
                    left: blRect.left
                };
            }
            return null;
        }
    },
    {
        target: '#reportDetail',
        title: 'Condition Locks',
        text: 'In Maintenance Mode, click any rating block (Deck, Super, Sub, Bearings, Joints) to lock that value as a filter. Locked ratings glow gold and the bridge list narrows to only bridges sharing that exact rating.\n\nYou can lock multiple ratings at once \u2014 they combine as an AND filter. The Sufficiency square works the same way, filtering to bridges within \u00B110 of the clicked value.\n\nClick a locked rating again to unlock it, or use the Clear link to remove all locks.',
        position: 'right'
    },
    {
        target: '#re-status-text',
        title: 'Status Bar',
        text: 'The status bar at the bottom of the screen shows your current mode and category at a glance.\n\nIt also shows which list you\'re viewing, how many bridges match, and whether any condition locks are active.',
        position: 'top'
    },
    {
        target: null,
        title: 'Count Report & Bridge Selection',
        text: 'The Count Report and Report Explorer work together.\n\n\u2022 Maintenance / Inspection — Switch the color theme.\n\u2022 Critical / Emergent / Satisfactory — Isolate a category. The Report Explorer syncs automatically.\n\u2022 Hamburger (\u2630) — Opens a sortable detail table.\n\u2022 HUB Data — Highlights bridges with HUB project data.\n\nClick any row in the bridge list to zoom to that bridge. Use Up/Down arrow keys to move through the list. Try it now.',
        allowUpDown: true,
        getTooltipPosition: function(tRect) {
            // Position tooltip near the Charleston circle cutout
            const coords = window._reTourCharlestonXY;
            if (coords) {
                return {
                    top: coords.cy + 110,  // just below the 100px radius circle
                    left: coords.cx - tRect.width / 2  // centered under the circle
                };
            }
            return null;
        },
        onEnter: function() {
            // Hide the normal spotlight (we use a custom SVG overlay with dual cutouts)
            const spot = document.getElementById('re-tour-spotlight');
            if (spot) spot.style.boxShadow = 'none';

            // Allow clicking through overlay to bridge list
            const overlay = document.getElementById('re-tour-overlay');
            if (overlay) overlay.style.pointerEvents = 'none';

            // Highlight current bridge on map
            if (reportBridgeList.length > 0) {
                highlightReportBridge(reportBridgeList[reportCurrentIndex]);
            }

            // Get Bridge List rect
            const blEl = document.getElementById('reportBridgeListBox');
            const blRect = blEl ? blEl.getBoundingClientRect() : null;

            // Get Charleston, WV screen position (approx 38.35, -81.63)
            const charlestonLatLng = L.latLng(38.35, -81.63);
            const charlestonPt = map.latLngToContainerPoint(charlestonLatLng);
            const mapContainer = map.getContainer().getBoundingClientRect();
            const cx = mapContainer.left + charlestonPt.x;
            const cy = mapContainer.top + charlestonPt.y;

            // Create SVG overlay with two cutouts (lightened for map visibility)
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.id = 're-tour-dual-overlay';
            svg.setAttribute('width', window.innerWidth);
            svg.setAttribute('height', window.innerHeight);
            svg.style.cssText = 'position:fixed; top:0; left:0; z-index:12000; pointer-events:none;';

            const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            const mask = document.createElementNS('http://www.w3.org/2000/svg', 'mask');
            mask.id = 're-tour-dual-mask';

            // White background = visible dark overlay
            const maskBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            maskBg.setAttribute('x', '0'); maskBg.setAttribute('y', '0');
            maskBg.setAttribute('width', '100%'); maskBg.setAttribute('height', '100%');
            maskBg.setAttribute('fill', 'white');
            mask.appendChild(maskBg);

            // Black circle = cutout around Charleston (200px diameter)
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', cx); circle.setAttribute('cy', cy);
            circle.setAttribute('r', '100');
            circle.setAttribute('fill', 'black');
            mask.appendChild(circle);

            // Black rect = cutout over Bridge List
            if (blRect) {
                const pad = 6;
                const blCut = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                blCut.setAttribute('x', blRect.left - pad);
                blCut.setAttribute('y', blRect.top - pad);
                blCut.setAttribute('width', blRect.width + pad * 2);
                blCut.setAttribute('height', blRect.height + pad * 2);
                blCut.setAttribute('rx', '8'); blCut.setAttribute('ry', '8');
                blCut.setAttribute('fill', 'black');
                mask.appendChild(blCut);
            }

            // Black rect = cutout over Count Report (so CR buttons are visible)
            const crEl = document.getElementById('countReport');
            const crRect = crEl ? crEl.getBoundingClientRect() : null;
            if (crRect) {
                const pad = 6;
                const crCut = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                crCut.setAttribute('x', crRect.left - pad);
                crCut.setAttribute('y', crRect.top - pad);
                crCut.setAttribute('width', crRect.width + pad * 2);
                crCut.setAttribute('height', crRect.height + pad * 2);
                crCut.setAttribute('rx', '8'); crCut.setAttribute('ry', '8');
                crCut.setAttribute('fill', 'black');
                mask.appendChild(crCut);
            }

            defs.appendChild(mask);
            svg.appendChild(defs);

            // Overlay darkness — 0.55 to stay consistent with other tutorial slides
            const overlayRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            overlayRect.setAttribute('x', '0'); overlayRect.setAttribute('y', '0');
            overlayRect.setAttribute('width', '100%'); overlayRect.setAttribute('height', '100%');
            overlayRect.setAttribute('fill', 'rgba(0,0,0,0.55)');
            overlayRect.setAttribute('mask', 'url(#re-tour-dual-mask)');
            svg.appendChild(overlayRect);

            document.body.appendChild(svg);

            // Store Charleston screen coords for tooltip positioning
            window._reTourCharlestonXY = { cx: cx, cy: cy };

            // Animate CR buttons cycling through states (including HUB Data)
            const cats = ['critical', 'emergent', 'satisfactory', 'hubdata'];
            let animStep = 0;
            window._reTourCRAnimation = setInterval(function() {
                const cat = cats[animStep % cats.length];
                const section = reportViewMode === 'inspection' ? 'insp' : 'maint';
                const btn = document.getElementById('btn-' + section + '-' + cat) || document.getElementById('btn-' + cat);
                if (btn) {
                    btn.style.transform = 'scale(1.08)';
                    btn.style.boxShadow = '0 0 8px rgba(255,184,28,0.6)';
                    setTimeout(function() {
                        btn.style.transform = '';
                        btn.style.boxShadow = '';
                    }, 600);
                }
                animStep++;
                if (animStep >= cats.length * 2) {
                    clearInterval(window._reTourCRAnimation);
                    window._reTourCRAnimation = null;
                }
            }, 800);
        },
        onExit: function() {
            // Remove dual SVG overlay
            const svgOverlay = document.getElementById('re-tour-dual-overlay');
            if (svgOverlay) svgOverlay.remove();

            // Restore normal spotlight box-shadow
            const spot = document.getElementById('re-tour-spotlight');
            if (spot) spot.style.boxShadow = '0 0 0 9999px rgba(0,0,0,0.7)';

            // Restore overlay pointer events
            const overlay = document.getElementById('re-tour-overlay');
            if (overlay) overlay.style.pointerEvents = 'auto';

            removeReportHighlight();

            if (window._reTourCRAnimation) {
                clearInterval(window._reTourCRAnimation);
                window._reTourCRAnimation = null;
            }
            // Reset any leftover styles
            document.querySelectorAll('#countReportBody button').forEach(function(btn) {
                btn.style.transform = '';
                btn.style.boxShadow = '';
            });
            window._reTourCharlestonXY = null;
        }
    },
    {
        target: '#re-share-bottom',
        title: 'Sharing',
        text: 'Use the Share button at the bottom of the panel to share a link to your current view via clipboard, email, or QR code.\n\nYour recipient will see the same map state, filters, and bridge data.',
        position: 'top'
    },
    {
        target: null,
        title: 'You\'re Ready!',
        text: 'That\'s it! You now know how to use the Report Explorer.\n\nQuick reference:\n\u2022 Up/Down — Navigate bridges\n\u2022 Left/Right — Cycle categories\n\u2022 Click map point — Jump to that bridge\n\u2022 Escape — Close the Report Explorer\n\nHappy exploring!'
    }
];

window.startReTour = function() {
    if (reTourActive) return;
    reTourActive = true;
    reTourStep = 0;

    // Create overlay elements (reuse tour CSS classes)
    const overlay = document.createElement('div');
    overlay.id = 're-tour-overlay';
    overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; z-index:11999; pointer-events:auto;';
    document.body.appendChild(overlay);

    const spotlight = document.createElement('div');
    spotlight.id = 're-tour-spotlight';
    spotlight.style.cssText = 'position:fixed; z-index:12000; border-radius:8px; box-shadow:0 0 0 9999px rgba(0,0,0,0.7); pointer-events:none; transition:all 0.3s ease;';
    document.body.appendChild(spotlight);

    const tooltip = document.createElement('div');
    tooltip.id = 're-tour-tooltip';
    tooltip.style.cssText = 'position:fixed; z-index:12001; background:var(--wvdoh-blue); border:2px solid var(--wvdoh-yellow); border-radius:8px; padding:16px 20px; max-width:340px; color:#fff; box-shadow:0 4px 20px rgba(0,0,0,0.4); transition:opacity 0.25s ease; pointer-events:auto;';
    document.body.appendChild(tooltip);

    showReTourStep(0);
    window.addEventListener('keydown', onReTourKeydown);
    window.addEventListener('resize', onReTourResize);
};

function reTourExitCurrentStep() {
    const step = reTourSteps[reTourStep];
    if (step && step.onExit) step.onExit();
}

function showReTourStep(index) {
    if (index < 0 || index >= reTourSteps.length) return;

    const step = reTourSteps[index];
    const spotlight = document.getElementById('re-tour-spotlight');
    const tooltip = document.getElementById('re-tour-tooltip');
    if (!spotlight || !tooltip) return;

    // Set up/down permission for this step
    reTourAllowUpDown = !!step.allowUpDown;

    // Call onEnter for the new step
    if (step.onEnter) step.onEnter();

    requestAnimationFrame(() => {
        let spotRect = null;
        const pad = 6;

        if (step.getSpotRect) {
            // Custom spotlight rect (e.g. map area)
            spotRect = step.getSpotRect();
            if (spotRect) {
                spotlight.style.top = spotRect.top + 'px';
                spotlight.style.left = spotRect.left + 'px';
                spotlight.style.width = spotRect.width + 'px';
                spotlight.style.height = spotRect.height + 'px';
                spotlight.style.borderRadius = step.spotRadius || '8px';
            } else {
                spotlight.style.top = '50%';
                spotlight.style.left = '50%';
                spotlight.style.width = '0px';
                spotlight.style.height = '0px';
                spotlight.style.borderRadius = '50%';
            }
        } else if (step.target) {
            const el = document.querySelector(step.target);
            if (el) {
                const rect = el.getBoundingClientRect();
                spotRect = {
                    top: rect.top - pad, left: rect.left - pad,
                    right: rect.right + pad, bottom: rect.bottom + pad,
                    width: rect.width + pad * 2, height: rect.height + pad * 2
                };
                spotlight.style.top = spotRect.top + 'px';
                spotlight.style.left = spotRect.left + 'px';
                spotlight.style.width = spotRect.width + 'px';
                spotlight.style.height = spotRect.height + 'px';
                spotlight.style.borderRadius = '8px';
            } else {
                spotRect = null;
                spotlight.style.top = '50%';
                spotlight.style.left = '50%';
                spotlight.style.width = '0px';
                spotlight.style.height = '0px';
                spotlight.style.borderRadius = '50%';
            }
        } else {
            spotlight.style.top = '50%';
            spotlight.style.left = '50%';
            spotlight.style.width = '0px';
            spotlight.style.height = '0px';
            spotlight.style.borderRadius = '50%';
        }

        // Build tooltip
        const total = reTourSteps.length;
        const backBtn = index > 0 ? '<button class="tour-btn" onclick="prevReTourStep()">Back</button>' : '<span></span>';
        const nextLabel = index < total - 1 ? 'Next' : 'Finish';
        const nextBtn = '<button class="tour-btn" onclick="nextReTourStep()">' + nextLabel + '</button>';
        const closeBtn = '<button class="tour-btn" onclick="endReTour()" style="margin-left:8px;border-color:rgba(255,255,255,0.3);color:rgba(255,255,255,0.6);">\u2715</button>';
        const formattedText = step.text.replace(/\n/g, '<br>');

        let pageLinks = '<div class="tour-pages">';
        for (let i = 0; i < total; i++) {
            const active = i === index ? ' tour-page-active' : '';
            pageLinks += '<span class="tour-page' + active + '" onclick="goToReTourStep(' + i + ')">' + (i + 1) + '</span>';
        }
        pageLinks += '</div>';

        tooltip.innerHTML =
            '<h4 style="color:var(--wvdoh-yellow); margin:0 0 8px 0; font-size:12pt;">' + step.title + '</h4>' +
            '<p style="margin:0 0 12px 0; font-size:10pt; line-height:1.5; color:rgba(255,255,255,0.9);">' + formattedText + '</p>' +
            '<div class="tour-nav">' + backBtn + '<div>' + nextBtn + closeBtn + '</div></div>' +
            pageLinks;

        // Position tooltip
        positionReTourTooltip(step, spotRect, tooltip);
    });
}

function positionReTourTooltip(step, spotRect, tooltip) {
    tooltip.style.top = '0px';
    tooltip.style.left = '0px';
    tooltip.style.opacity = '0';

    requestAnimationFrame(() => {
        const tRect = tooltip.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const gap = 8;
        let top, left;

        // Custom tooltip position callback
        if (step.getTooltipPosition) {
            const pos = step.getTooltipPosition(tRect);
            if (pos) { top = pos.top; left = pos.left; }
        } else if (step.tooltipRight) {
            top = (vh - tRect.height) / 2;
            left = vw - tRect.width - 20;
        } else if (step.target === null || !spotRect) {
            top = (vh - tRect.height) / 2;
            left = (vw - tRect.width) / 2;
        } else {
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

        if (left < 10) left = 10;
        if (left + tRect.width > vw - 10) left = vw - tRect.width - 10;
        if (top < 10) top = 10;
        if (top + tRect.height > vh - 10) top = vh - tRect.height - 10;

        tooltip.style.top = top + 'px';
        tooltip.style.left = left + 'px';
        tooltip.style.opacity = '1';
    });
}

window.nextReTourStep = function() {
    if (!reTourActive) return;
    reTourExitCurrentStep();
    reTourStep++;
    if (reTourStep >= reTourSteps.length) {
        endReTour();
    } else {
        showReTourStep(reTourStep);
    }
};

window.prevReTourStep = function() {
    if (!reTourActive || reTourStep <= 0) return;
    reTourExitCurrentStep();
    reTourStep--;
    showReTourStep(reTourStep);
};

window.goToReTourStep = function(index) {
    if (!reTourActive) return;
    if (index < 0 || index >= reTourSteps.length || index === reTourStep) return;
    reTourExitCurrentStep();
    reTourStep = index;
    showReTourStep(reTourStep);
};

window.endReTour = function() {
    if (!reTourActive) return;
    // Call onExit for current step
    const currentStep = reTourSteps[reTourStep];
    if (currentStep && currentStep.onExit) currentStep.onExit();
    const overlay = document.getElementById('re-tour-overlay');
    const spotlight = document.getElementById('re-tour-spotlight');
    const tooltip = document.getElementById('re-tour-tooltip');
    if (overlay) overlay.remove();
    if (spotlight) spotlight.remove();
    if (tooltip) tooltip.remove();
    reTourActive = false;
    reTourStep = 0;
    reTourAllowUpDown = false;
    window.removeEventListener('keydown', onReTourKeydown);
    window.removeEventListener('resize', onReTourResize);
};

function onReTourKeydown(e) {
    if (!reTourActive) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endReTour(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); nextReTourStep(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); prevReTourStep(); }
    // Allow Up/Down only on steps that explicitly permit it
    if (reTourAllowUpDown && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault(); e.stopPropagation();
        if (e.key === 'ArrowUp') reportPrevBridge();
        else reportNextBridge();
        // Re-highlight the current bridge after navigation
        if (reportBridgeList.length > 0) {
            highlightReportBridge(reportBridgeList[reportCurrentIndex]);
        }
    }
}

function onReTourResize() {
    if (!reTourActive) return;
    showReTourStep(reTourStep);
}

// --- Content generators (extracted from show* functions for reuse) ---

function generateGeometryAttributesHTML(bridge) {
    const age = bridge.bridge_age ? `${bridge.bridge_age}y` : '—';
    const gs = 'font-size:7pt; line-height:1.3;';
    const lbl = 'color:rgba(255,255,255,0.5); font-size:6pt;';
    const val = 'color:#fff; font-weight:600; font-size:7pt;';
    const row = (label, value) => `<div style="display:flex; justify-content:space-between; padding:1px 0;"><span style="${lbl}">${label}</span><span style="${val}">${value}</span></div>`;

    return `<div style="${gs}">` +
        row('Length', (bridge.bridge_length || '—') + ' ft') +
        row('Total Length', (bridge.total_bridge_length || '—') + ' ft') +
        row('Width O-O', (bridge.width_out_to_out || '—') + ' ft') +
        row('Width C-C', (bridge.width_curb_to_curb || '—') + ' ft') +
        row('Skew', (bridge.skew || '—') + '\u00B0') +
        row('Max Height', (bridge.max_height || '—') + ' ft') +
        row('Area', (bridge.bridge_area || '—') + ' sqft') +
        row('Min Vert. Clr', (bridge.minvc1f || '—') + ' ft') +
        row('Min Underclr', (bridge.min_underclearance || '—') + ' ft') +
        row('Year Built', bridge.year_built || '—') +
        row('Age', age) +
        row('Type', bridge.bridge_type || '—') +
        (bridge.span_lengths ? row('Spans', bridge.span_lengths) : '') +
        `<div style="margin-top:4px; padding-top:3px; border-top:1px solid rgba(255,255,255,0.1);">` +
        row('Route', bridge.route || '—') +
        row('Subroute', bridge.subroute || '—') +
        row('Func. Class', bridge.functional_class || '—') +
        row('NHS', bridge.nhs || '—') +
        row('ADT', bridge.adt != null ? bridge.adt.toLocaleString() : '—') +
        row('On Bridge', bridge.on_bridge || '—') +
        row('Under Bridge', bridge.under_bridge || '—') +
        row('Location', bridge.location || '—') +
        row('Design #', bridge.bridge_design_number || '—') +
        row('Utilities', bridge.utilities_on_bridge || '—') +
        `</div></div>`;
}

// Keep standalone generators for radial menu popups (unchanged)
function generateGeometryHTML(bridge) {
    const age = bridge.bridge_age ? `${bridge.bridge_age} years` : 'Unknown';
    return `
        <div class="info-grid">
            <div class="info-item"><span class="info-label">Bridge Length</span><span class="info-value">${bridge.bridge_length || 'N/A'} ft</span></div>
            <div class="info-item"><span class="info-label">Total Length</span><span class="info-value">${bridge.total_bridge_length || 'N/A'} ft</span></div>
            <div class="info-item"><span class="info-label">Width (Out-to-Out)</span><span class="info-value">${bridge.width_out_to_out || 'N/A'} ft</span></div>
            <div class="info-item"><span class="info-label">Width (Curb-to-Curb)</span><span class="info-value">${bridge.width_curb_to_curb || 'N/A'} ft</span></div>
            <div class="info-item"><span class="info-label">Left Sidewalk</span><span class="info-value">${bridge.left_sidewalk_width || 'N/A'} ft</span></div>
            <div class="info-item"><span class="info-label">Right Sidewalk</span><span class="info-value">${bridge.right_sidewalk_width || 'N/A'} ft</span></div>
            <div class="info-item"><span class="info-label">Median</span><span class="info-value">${bridge.bridge_median || 'N/A'} ft</span></div>
            <div class="info-item"><span class="info-label">Skew</span><span class="info-value">${bridge.skew || 'N/A'}&deg;</span></div>
            <div class="info-item"><span class="info-label">Max Height</span><span class="info-value">${bridge.max_height || 'N/A'} ft</span></div>
            <div class="info-item"><span class="info-label">Bridge Area</span><span class="info-value">${bridge.bridge_area || 'N/A'} sq ft</span></div>
            <div class="info-item"><span class="info-label">Min Vertical Clearance</span><span class="info-value">${bridge.minvc1f || 'N/A'} ft</span></div>
            <div class="info-item"><span class="info-label">Min Underclearance</span><span class="info-value">${bridge.min_underclearance || 'N/A'} ft</span></div>
            <div class="info-item"><span class="info-label">Year Built</span><span class="info-value">${bridge.year_built || 'N/A'}</span></div>
            <div class="info-item"><span class="info-label">Age</span><span class="info-value">${age}</span></div>
            <div class="info-item" style="grid-column: 1 / -1;"><span class="info-label">Type</span><span class="info-value">${bridge.bridge_type || 'N/A'}</span></div>
        </div>
        ${bridge.span_lengths ? `<div style="margin-top:15px;"><strong>Span Lengths:</strong> ${bridge.span_lengths}</div>` : ''}`;
}

function generateAttributesHTML(bridge) {
    return `
        <div class="info-grid">
            <div class="info-item"><span class="info-label">Latitude</span><span class="info-value">${bridge.latitude || 'N/A'}</span></div>
            <div class="info-item"><span class="info-label">Longitude</span><span class="info-value">${bridge.longitude || 'N/A'}</span></div>
            <div class="info-item full-width"><span class="info-label">Location</span><span class="info-value">${bridge.location || 'N/A'}</span></div>
            <div class="info-item"><span class="info-label">Design Number</span><span class="info-value">${bridge.bridge_design_number || 'N/A'}</span></div>
            <div class="info-item"><span class="info-label">Utilities</span><span class="info-value">${bridge.utilities_on_bridge || 'N/A'}</span></div>
            <div class="info-item"><span class="info-label">NHS</span><span class="info-value">${bridge.nhs || 'N/A'}</span></div>
            <div class="info-item full-width"><span class="info-label">Functional Class</span><span class="info-value">${bridge.functional_class || 'N/A'}</span></div>
            <div class="info-item"><span class="info-label">Route</span><span class="info-value">${bridge.route || 'N/A'}</span></div>
            <div class="info-item"><span class="info-label">Subroute</span><span class="info-value">${bridge.subroute || 'N/A'}</span></div>
            <div class="info-item"><span class="info-label">On Bridge</span><span class="info-value">${bridge.on_bridge || 'N/A'}</span></div>
            <div class="info-item"><span class="info-label">Under Bridge</span><span class="info-value">${bridge.under_bridge || 'N/A'}</span></div>
            <div class="info-item"><span class="info-label">ADT</span><span class="info-value">${bridge.adt != null ? bridge.adt.toLocaleString() : 'N/A'}</span></div>
            <div class="info-item"><span class="info-label">ADT Year</span><span class="info-value">${bridge.adt_year || 'N/A'}</span></div>
        </div>`;
}

function generateConditionHTML(bridge) {
    let calcSufficiency = 'N/A';
    const bars = bridge.bars_number;
    if (sufficiencyData[bars] !== undefined) {
        calcSufficiency = sufficiencyData[bars].toFixed(1);
    }

    const ratings = [
        { label: 'Deck', short: 'DK', value: bridge.deck_rating, field: 'deck_rating' },
        { label: 'Super', short: 'SP', value: bridge.superstructure_rating, field: 'superstructure_rating' },
        { label: 'Sub', short: 'SB', value: bridge.substructure_rating, field: 'substructure_rating' },
        { label: 'Bear', short: 'BR', value: bridge.bearings_rating, field: 'bearings_rating' },
        { label: 'Joints', short: 'JT', value: bridge.joints_rating, field: 'joints_rating' },
    ];

    const lockable = reportPanelOpen && reportViewMode === 'maintenance';
    let html = '<div style="display:flex; gap:12px; justify-content:center; align-items:flex-end;">';
    ratings.forEach(r => {
        const rating = r.value || '-';
        const color = r.value ? conditionColors[r.value] || '#6b7280' : '#6b7280';
        const isActive = lockable && reportConditionFilters[r.field] !== undefined;
        const activeStyle = isActive ? 'outline:2px solid #FFB81C; outline-offset:2px; box-shadow:0 0 8px rgba(255,184,28,0.5);' : '';
        const cursor = (lockable && r.value) ? 'cursor:pointer;' : '';
        const onclick = (lockable && r.value) ? `onclick="toggleReportConditionFilter('${r.field}', '${r.value}')"` : '';
        const title = (lockable && r.value) ? `title="Click to lock: show only bridges with ${r.label} rating ${rating}"` : '';
        html += `<div style="text-align:center;">
            <div ${onclick} ${title} style="width:34px;height:34px;background:${color};border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:11pt;font-weight:700;color:#fff;${cursor}${activeStyle}">${rating}</div>
            <div style="font-size:7pt;color:rgba(255,255,255,0.6);margin-top:3px;font-weight:600;">${r.label}</div>
        </div>`;
    });
    // Sufficiency as the last square
    const sufColor = calcSufficiency !== 'N/A' && parseFloat(calcSufficiency) < 50 ? '#dc2626' : '#FFB81C';
    const sufActive = lockable && reportSufficiencyFilter !== null;
    const sufActiveStyle = sufActive ? 'outline:2px solid #FFB81C; outline-offset:2px; box-shadow:0 0 8px rgba(255,184,28,0.5);' : '';
    const sufClick = (lockable && calcSufficiency !== 'N/A') ? `onclick="toggleReportSufficiencyFilter(${parseFloat(calcSufficiency)})"` : '';
    const sufCursor = (lockable && calcSufficiency !== 'N/A') ? 'cursor:pointer;' : '';
    const sufTitle = (lockable && calcSufficiency !== 'N/A') ? `title="Click to lock: show bridges with sufficiency ${calcSufficiency} ±10"` : '';
    html += `<div style="text-align:center; margin-left:4px;">
        <div ${sufClick} ${sufTitle} style="width:34px;height:34px;background:rgba(255,184,28,0.15);border:2px solid ${sufColor};border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:9pt;font-weight:700;color:${sufColor};${sufCursor}${sufActiveStyle}">${calcSufficiency}</div>
        <div style="font-size:7pt;color:rgba(255,255,255,0.6);margin-top:3px;font-weight:600;">Suf.</div>
    </div>`;
    html += '</div>';

    // Show active lock indicator (maintenance mode only)
    const activeFilters = Object.keys(reportConditionFilters);
    if (lockable && (activeFilters.length > 0 || reportSufficiencyFilter !== null)) {
        html += '<div style="text-align:center; margin-top:8px; font-size:7.5pt; color:var(--wvdoh-yellow); opacity:0.8;">Locked: ';
        const parts = [];
        activeFilters.forEach(f => {
            const name = f.replace('_rating', '').replace('superstructure', 'super').replace('substructure', 'sub');
            parts.push(name.charAt(0).toUpperCase() + name.slice(1) + '=' + reportConditionFilters[f]);
        });
        if (reportSufficiencyFilter !== null) {
            parts.push('Suf. ' + (reportSufficiencyFilter - 10).toFixed(0) + '–' + (reportSufficiencyFilter + 10).toFixed(0));
        }
        html += parts.join(', ');
        html += ' <span onclick="clearReportConditionFilters()" style="cursor:pointer; text-decoration:underline; margin-left:6px;">Clear</span></div>';
    }

    return html;
}

// Rebuild bridge list and UI after condition lock change
function refreshAfterConditionLock(prevBars) {
    buildReportBridgeList(reportCategory);
    // Try to stay on the same bridge; if it's been filtered out, go to 0
    if (prevBars) {
        const newIdx = reportBridgeList.findIndex(b => b.bars_number === prevBars);
        reportCurrentIndex = newIdx >= 0 ? newIdx : 0;
    } else {
        reportCurrentIndex = 0;
    }
    renderReportBridgeList();
    renderReportTitleBox();
    removeReportHighlight();
    if (reportBridgeList.length > 0) {
        renderReportDetail(reportBridgeList[reportCurrentIndex]);
    } else {
        document.getElementById('reportDetail').innerHTML = '<div style="padding:16px; text-align:center; color:rgba(255,255,255,0.5); font-size:9pt;">No bridges match the locked conditions</div>';
    }
    applyReportCategoryFilter();
    updateReStatusBar();
}

// Toggle a condition rating lock — filters bridge list to matching bridges
window.toggleReportConditionFilter = function(field, value) {
    const prevBars = reportBridgeList.length > 0 ? reportBridgeList[reportCurrentIndex].bars_number : null;
    if (reportConditionFilters[field] === value) {
        delete reportConditionFilters[field];
    } else {
        reportConditionFilters[field] = value;
    }
    refreshAfterConditionLock(prevBars);
};

// Toggle sufficiency lock (±10 range)
window.toggleReportSufficiencyFilter = function(value) {
    const prevBars = reportBridgeList.length > 0 ? reportBridgeList[reportCurrentIndex].bars_number : null;
    if (reportSufficiencyFilter === value) {
        reportSufficiencyFilter = null;
    } else {
        reportSufficiencyFilter = value;
    }
    refreshAfterConditionLock(prevBars);
};

// Clear all condition locks
window.clearReportConditionFilters = function() {
    const prevBars = reportBridgeList.length > 0 ? reportBridgeList[reportCurrentIndex].bars_number : null;
    reportConditionFilters = {};
    reportSufficiencyFilter = null;
    refreshAfterConditionLock(prevBars);
};

// Note: condition lock visibility is now handled inside applyReportCategoryFilter()

function generateNarrativesHTML(bridge) {
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

    let html = '';
    let hasContent = false;
    narratives.forEach(n => {
        const text = bridge[n.field];
        if (text && text.trim()) {
            hasContent = true;
            html += `<div class="narrative-section"><h4>${n.label}</h4><p>${text}</p></div>`;
        }
    });

    if (!hasContent) {
        html = '<p style="color:#999;">No narrative data available.</p>';
    }
    return html;
}

function generateInspectionsHTML(bridge) {
    const bars = bridge.bars_number;
    const inspections = inspectionsData[bars];

    if (!inspections || inspections.length === 0) {
        return '<p style="color:#999;">No inspection data available.</p>';
    }

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

    let html = `<table style="width:100%; border-collapse:collapse; font-size:9pt;">
        <thead><tr style="background:rgba(0,40,85,0.3); border-bottom:2px solid #FFB81C;">
            <th style="padding:6px; text-align:left;">Type</th>
            <th style="padding:6px; text-align:left;">Begin</th>
            <th style="padding:6px; text-align:left;">Completion</th>
            <th style="padding:6px; text-align:left;">Due</th>
            <th style="padding:6px; text-align:left;">Status</th>
        </tr></thead><tbody>`;

    sorted.forEach(insp => {
        const dueDate = parseDateString(insp.due);
        const completionDate = parseDateString(insp.completion);
        const now = new Date();
        const intervalMonths = insp.interval || 24;
        let status = '\u2014';
        let rowStyle = '';

        if (dueDate) {
            const previousDueDate = new Date(dueDate);
            previousDueDate.setMonth(previousDueDate.getMonth() - intervalMonths);

            if (completionDate) {
                if (completionDate > previousDueDate) {
                    if (completionDate <= dueDate) {
                        const daysEarly = Math.floor((dueDate - completionDate) / 86400000);
                        status = daysEarly === 0 ? '\u2713 On Time' : `\u2713 On Time (${daysEarly}d early)`;
                        rowStyle = 'background:rgba(16,185,129,0.1); color:#6EE7B7;';
                    } else {
                        const daysLate = Math.floor((completionDate - dueDate) / 86400000);
                        status = `\u26A0 Overdue (${daysLate}d)`;
                        rowStyle = 'background:rgba(245,158,11,0.2); color:#FCD34D;';
                    }
                } else {
                    if (now > dueDate) {
                        const daysPast = Math.floor((now - dueDate) / 86400000);
                        status = `\u26A0 PAST DUE (${daysPast}d)`;
                        rowStyle = 'background:rgba(220,38,38,0.2); color:#FCA5A5;';
                    } else {
                        const daysUntil = Math.floor((dueDate - now) / 86400000);
                        status = daysUntil <= 30 ? `\u26A0 Due Soon (${daysUntil}d)` : `Upcoming (${daysUntil}d)`;
                        if (daysUntil <= 30) rowStyle = 'background:rgba(245,158,11,0.1);';
                    }
                }
            } else {
                if (now > dueDate) {
                    const daysPast = Math.floor((now - dueDate) / 86400000);
                    status = `\u26A0 PAST DUE (${daysPast}d)`;
                    rowStyle = 'background:rgba(220,38,38,0.2); color:#FCA5A5;';
                } else {
                    const daysUntil = Math.floor((dueDate - now) / 86400000);
                    status = daysUntil <= 30 ? `\u26A0 Due Soon (${daysUntil}d)` : `Upcoming (${daysUntil}d)`;
                    if (daysUntil <= 30) rowStyle = 'background:rgba(245,158,11,0.1);';
                }
            }
        }

        html += `<tr style="${rowStyle} border-bottom:1px solid rgba(255,255,255,0.1);">
            <td style="padding:6px;">${insp.type}</td>
            <td style="padding:6px;">${insp.begin || '\u2014'}</td>
            <td style="padding:6px;">${insp.completion || '\u2014'}</td>
            <td style="padding:6px;">${insp.due || '\u2014'}</td>
            <td style="padding:6px;">${status}</td>
        </tr>`;
    });

    html += '</tbody></table>';
    return html;
}

function generateHubDataHTML(bridge) {
    const bars = bridge.bars_number;
    const projects = hubData[bars];

    if (!projects || projects.length === 0) {
        return '<p style="color:#999;">No HUB data for this bridge.</p>';
    }

    function fmtMoney(val) {
        if (val === 0 || val === null || val === undefined) return '$0.00';
        return '$' + Math.abs(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (val < 0 ? ' (CR)' : '');
    }

    let html = '';
    projects.forEach((proj, i) => {
        if (projects.length > 1) {
            html += `<div style="margin-bottom:8px; padding-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.15); font-weight:700; color:#22c55e;">Project ${i + 1} of ${projects.length}</div>`;
        }
        let familyHtml = 'N/A';
        if (proj.family_code) {
            const codes = proj.family_code.split('||').map(c => c.trim()).filter(c => c);
            familyHtml = codes.map(c => (c.split('-')[0] || c)).join(', ');
        }
        html += `
            <div class="info-grid">
                <div class="info-item"><span class="info-label">Project</span><span class="info-value">${proj.project || 'N/A'}</span></div>
                <div class="info-item"><span class="info-label">SPN</span><span class="info-value">${proj.spn || 'N/A'}</span></div>
                <div class="info-item"><span class="info-label">Federal Project</span><span class="info-value">${proj.federal_project || 'N/A'}</span></div>
                <div class="info-item"><span class="info-label">Name</span><span class="info-value">${proj.name || 'N/A'}</span></div>
                <div class="info-item"><span class="info-label">Phase</span><span class="info-value">${proj.phase || 'N/A'}</span></div>
                <div class="info-item"><span class="info-label">Allocation</span><span class="info-value">${proj.allocation || 'N/A'}</span></div>
                <div class="info-item"><span class="info-label">District</span><span class="info-value">${proj.district || 'N/A'}</span></div>
                <div class="info-item"><span class="info-label">Division</span><span class="info-value">${proj.division || 'N/A'}</span></div>
                <div class="info-item"><span class="info-label">Project Status</span><span class="info-value">${proj.project_status || 'N/A'}</span></div>
                <div class="info-item"><span class="info-label">Phase Status</span><span class="info-value">${proj.phase_status || 'N/A'}</span></div>
                <div class="info-item"><span class="info-label">Family Code</span><span class="info-value">${familyHtml}</span></div>
                <div class="info-item"><span class="info-label">Amount</span><span class="info-value">${fmtMoney(proj.amount)}</span></div>
                <div class="info-item"><span class="info-label">Expenditure</span><span class="info-value">${fmtMoney(proj.expenditure)}</span></div>
                <div class="info-item"><span class="info-label">Balance</span><span class="info-value">${fmtMoney(proj.balance)}</span></div>
                <div class="info-item"><span class="info-label">Start Date</span><span class="info-value">${proj.start_date || 'N/A'}</span></div>
                <div class="info-item"><span class="info-label">Days to Expiration</span><span class="info-value">${proj.days_expiration || 'N/A'}</span></div>
                <div class="info-item"><span class="info-label">End Date</span><span class="info-value">${proj.end_date || 'N/A'}</span></div>
            </div>`;
        if (i < projects.length - 1) {
            html += '<div style="margin:12px 0; border-top:2px solid rgba(34,197,94,0.3);"></div>';
        }
    });
    return html;
}

function renderReportDetail(bridge) {
    const container = document.getElementById('reportDetail');
    if (!container || !bridge) return;

    // Title box and bridge list are rendered separately
    renderReportTitleBox();

    // Section order depends on reportViewMode
    // Both modes: Condition → Inspections, both expanded
    // Maintenance: Condition(expanded) → Inspections(expanded) → rest
    // Inspection:  Condition(expanded) → Inspections(expanded) → rest
    let sections;
    sections = [
        { title: 'Condition', html: generateConditionHTML(bridge), open: true },
        { title: 'Inspections', html: generateInspectionsHTML(bridge), open: true },
        { title: 'Geometry & Attributes', html: generateGeometryAttributesHTML(bridge), open: false },
        { title: 'Narratives', html: generateNarrativesHTML(bridge), open: false }
    ];

    let html = '';
    sections.forEach(s => {
        const arrow = s.open ? '▼' : '▶';
        const collapsedClass = s.open ? '' : ' collapsed';
        html += `
            <div class="report-section">
                <div class="report-section-header" onclick="toggleReportSection(this)">
                    <span class="report-arrow">${arrow}</span> ${s.title}
                </div>
                <div class="report-section-body${collapsedClass}">
                    ${s.html}
                </div>
            </div>`;
    });

    container.innerHTML = html;
}

function restoreFromUrl() {
    const hash = window.location.hash.slice(1);
    if (!hash) return false;

    try {
        const p = new URLSearchParams(hash);

        // Map view
        if (p.has('lat') && p.has('lng') && p.has('z')) {
            map.setView([parseFloat(p.get('lat')), parseFloat(p.get('lng'))], parseInt(p.get('z')));
        }

        // Districts
        if (p.has('doff')) {
            p.get('doff').split(',').forEach(d => {
                const key = 'District ' + d;
                if (activeDistricts.hasOwnProperty(key)) {
                    activeDistricts[key] = false;
                    // Sync drawer item
                    const item = document.querySelector(`.cr-district-item[data-district="${key}"]`);
                    if (item) item.classList.add('inactive');
                }
            });
            syncToggleAllButton();
        }

        // Search
        if (p.has('q')) {
            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                searchInput.value = p.get('q');
                searchInput.dispatchEvent(new Event('input'));
            }
        }

        // Condition filter
        if (p.get('eval') === '1') {
            if (p.has('cd')) sliderValues.deck = parseInt(p.get('cd'));
            if (p.has('cs')) sliderValues.superstructure = parseInt(p.get('cs'));
            if (p.has('cb')) sliderValues.substructure = parseInt(p.get('cb'));
            if (p.has('cr')) sliderValues.bearings = parseInt(p.get('cr'));
            if (p.has('cj')) sliderValues.joints = parseInt(p.get('cj'));
            if (p.has('sf')) sliderValues.sufficiency = parseInt(p.get('sf'));
            if (p.has('sm')) sufficiencyMode = p.get('sm');

            // Update slider UI elements
            ['deck', 'superstructure', 'substructure', 'bearings', 'joints'].forEach(key => {
                const slider = document.getElementById(key + '-slider');
                if (slider) slider.value = sliderValues[key];
                const label = document.getElementById(key + '-value');
                if (label) label.textContent = sliderValues[key] + '%';
            });
            const suffSlider = document.getElementById('sufficiency-slider');
            if (suffSlider) suffSlider.value = sliderValues.sufficiency;
            const suffLabel = document.getElementById('sufficiency-value');
            if (suffLabel) suffLabel.textContent = sliderValues.sufficiency + '%';

            evaluationActive = true;
        }

        // Attributes filter
        if (p.get('af') === '1') {
            const a = attributesFilterState;
            a.active = true;
            if (p.has('al')) a.length = { value: parseInt(p.get('al')), mode: p.get('alm') || 'lte' };
            if (p.has('aw')) a.width = { value: parseInt(p.get('aw')), mode: p.get('awm') || 'lte' };
            if (p.has('aa')) a.area = { value: parseInt(p.get('aa')), mode: p.get('aam') || 'lte' };
            if (p.has('ag')) a.age = { value: parseInt(p.get('ag')), mode: p.get('agm') || 'lte' };
            if (p.has('ad')) a.adt = { value: parseInt(p.get('ad')), mode: p.get('adm') || 'lte' };
            if (p.has('nhs')) a.nhs = p.get('nhs');
            if (p.get('util') === '1') a.utilities = true;
            if (p.has('ob')) a.onBridge = p.get('ob').split(',');
            if (p.has('ub')) a.underBridge = p.get('ub').split(',');
            if (p.has('bt')) a.bridgeType = p.get('bt').split(',');
            if (p.has('rt')) a.route = p.get('rt');
            if (p.has('srt')) a.subroute = p.get('srt');
            if (p.get('sna') === '1') a.showNA = true;
        }

        // Inspection filters
        if (p.get('insp') === '1') {
            inspectionFiltersActive = true;
            if (p.has('it')) selectedInspectionTypes = p.get('it').split(',');
            if (p.has('im')) selectedMonths = p.get('im').split(',').map(Number);
            if (p.get('odp') === '1') showOverduePlus = true;
        }

        // HUB data mode
        if (p.has('hub')) {
            hubDataMode = parseInt(p.get('hub'));
            projectRingsVisible = hubDataMode === 1;
            if (hubDataMode === 1) {
                // Rings mode: show rings after data loads
                setTimeout(() => { updateProjectRings(); styleCRHubButton(); }, 500);
            } else if (hubDataMode === 2) {
                // Theme mode: update bridge sizes after data loads
                setTimeout(() => { updateBridgeSizes(); applyCountCategoryFilter(); styleCRHubButton(); }, 500);
            }
            // Update standalone button if visible (tour)
            const hubBtn = document.getElementById('projectToggle');
            if (hubBtn) {
                hubBtn.classList.remove('active', 'theme');
                if (hubDataMode === 1) hubBtn.classList.add('active');
                else if (hubDataMode === 2) hubBtn.classList.add('theme');
            }
            if (p.get('hf') === '1') {
                hubFilterState.active = true;
                if (p.has('hs')) hubFilterState.statuses = p.get('hs').split(',');
                if (p.has('hp')) hubFilterState.phases = p.get('hp').split(',');
                if (p.has('hfc')) hubFilterState.familyCodes = p.get('hfc').split(',');
            }
        }

        // Count category state
        if (p.has('cat')) {
            p.get('cat').split(',').forEach(tok => {
                if (tok === 'c0') countCategoryState.critical = false;
                if (tok === 'e0') countCategoryState.emergent = false;
                if (tok === 's0') countCategoryState.satisfactory = false;
                if (tok === 'p0') countCategoryState.completed = false;
                if (tok === 'n1') countCategoryState.na = true;
                // h1 (hubdata isolation) removed — HUB Data now uses hub= param for mode cycling
                if (tok === 't0') countCategoryState.total = false;
            });
        }

        // Open category report popup after filters are applied
        if (p.has('rpt')) {
            const rpt = p.get('rpt');
            const [mode, cat] = rpt.split(':');
            // Delay to let filters settle first
            setTimeout(() => {
                if (mode === 'm') showMaintenanceCategoryTable(cat);
                else if (mode === 'i') showCategoryTable(cat);
            }, 500);
        }

        // Open the correct filter tab
        if (p.has('tab')) {
            const tab = p.get('tab');
            const condPanel = document.getElementById('evaluationPanel');
            const attrPanel = document.getElementById('attributesPanel');
            const hubPanel = document.getElementById('hubPanel');
            if (tab === 'af' && attrPanel && condPanel) {
                attrPanel.classList.add('open', 'ontop');
                condPanel.classList.add('open');
                condPanel.classList.remove('behind');
                if (hubPanel) { hubPanel.classList.add('open'); hubPanel.classList.remove('ontop'); }
            } else if (tab === 'cf' && condPanel) {
                condPanel.classList.add('open');
                condPanel.classList.remove('behind');
                if (attrPanel) { attrPanel.classList.add('open'); attrPanel.classList.remove('ontop'); }
                if (hubPanel) { hubPanel.classList.add('open'); hubPanel.classList.remove('ontop'); }
            }
        }

        console.log('✓ Restored view from shared link');
        return true;
    } catch (e) {
        console.warn('Failed to restore from URL:', e);
        return false;
    }
}

// Expose globally for button/shortcut use
window.generateShareableLink = generateShareableLink;

// ==================== UI TOOLTIP SYSTEM ====================
let uiTooltipsEnabled = true; // On by default
let activeUITooltip = null;
let tooltipHoverTimer = null;

// Set the button active on page load
document.addEventListener('DOMContentLoaded', function() {
    const btn = document.getElementById('tooltip-toggle-btn');
    if (btn) btn.classList.add('active');
});

window.toggleUITooltips = function() {
    uiTooltipsEnabled = !uiTooltipsEnabled;
    const btn = document.getElementById('tooltip-toggle-btn');
    if (btn) {
        btn.classList.toggle('active', uiTooltipsEnabled);
    }
    if (!uiTooltipsEnabled) {
        removeUITooltip();
    }
};

function removeUITooltip() {
    if (activeUITooltip) {
        activeUITooltip.remove();
        activeUITooltip = null;
    }
    if (tooltipHoverTimer) {
        clearTimeout(tooltipHoverTimer);
        tooltipHoverTimer = null;
    }
}

function showUITooltip(el) {
    if (!uiTooltipsEnabled) return;
    const text = el.getAttribute('data-tip');
    if (!text) return;

    removeUITooltip();

    const tip = document.createElement('div');
    tip.className = 'ui-tooltip';
    tip.textContent = text;
    document.body.appendChild(tip);
    activeUITooltip = tip;

    // Position the tooltip relative to the element
    const rect = el.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 10;
    const pad = 8; // viewport edge padding

    let left, top;
    let placed = false;

    // Explicit position override via data-tip-pos attribute
    const posHint = el.getAttribute('data-tip-pos');
    if (posHint === 'right') {
        left = rect.right + gap;
        top = rect.top + rect.height / 2 - tipRect.height / 2;
        tip.classList.add('arrow-left');
        placed = true;
    } else if (posHint === 'left') {
        left = rect.left - tipRect.width - gap;
        top = rect.top + rect.height / 2 - tipRect.height / 2;
        tip.classList.add('arrow-right');
        placed = true;
    }

    // For elements on the left edge (folder tabs), position to the right
    if (!placed && rect.left < 80) {
        left = rect.right + gap;
        top = rect.top + rect.height / 2 - tipRect.height / 2;
        tip.classList.add('arrow-left');
        placed = true;
    }
    // For elements on the right edge (legend, header, CR buttons), position to the left
    if (!placed && rect.right > vw - 80) {
        left = rect.left - tipRect.width - gap;
        top = rect.top + rect.height / 2 - tipRect.height / 2;
        tip.classList.add('arrow-right');
        placed = true;
    }

    if (!placed) {
        // Default: above the element, centered horizontally
        left = rect.left + rect.width / 2 - tipRect.width / 2;
        top = rect.top - tipRect.height - gap;

        if (top < pad) {
            // Not enough room above — place below with extra gap to clear the cursor
            top = rect.bottom + gap + 6;
            tip.classList.add('arrow-top');
        }
    }

    // Final viewport clamping — keep tooltip fully on screen
    if (left < pad) left = pad;
    if (left + tipRect.width > vw - pad) left = vw - tipRect.width - pad;
    if (top < pad) top = pad;
    if (top + tipRect.height > vh - pad) top = vh - tipRect.height - pad;

    tip.style.left = left + 'px';
    tip.style.top = top + 'px';

    // Fade in
    requestAnimationFrame(() => tip.classList.add('visible'));
}

// Attach tooltip listeners using event delegation on document
document.addEventListener('mouseover', function(e) {
    if (!uiTooltipsEnabled) return;
    const target = e.target.closest('[data-tip]');
    if (!target) return;

    if (tooltipHoverTimer) clearTimeout(tooltipHoverTimer);
    tooltipHoverTimer = setTimeout(() => showUITooltip(target), 400);
});

document.addEventListener('mouseout', function(e) {
    if (!uiTooltipsEnabled) return;
    const target = e.target.closest('[data-tip]');
    if (!target) return;

    // Check if we're moving to a child of the same data-tip element
    const related = e.relatedTarget;
    if (related && target.contains(related)) return;

    removeUITooltip();
});

// Also remove tooltip on scroll or click
document.addEventListener('scroll', removeUITooltip, true);
document.addEventListener('click', function() {
    if (activeUITooltip) removeUITooltip();
});

