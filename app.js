// SpanBase - Complete Build with All Features
let map;
let bridgesData = [];
let bridgeLayers = {};
let currentMode = 'default';
let currentZoom = 8;
let hoveredBridge = null;
let radialMenu = null;
let nameTooltip = null;
let currentSearchQuery = ''; // Track search state

// District colors
const districtColors = {
    'District 1': '#e63946',
    'District 2': '#f77f00',
    'District 3': '#fcbf49',
    'District 4': '#06d6a0',
    'District 5': '#118ab2',
    'District 6': '#073b4c',
    'District 7': '#8338ec',
    'District 8': '#ff006e',
    'District 9': '#3a86ff',
    'District 10': '#fb5607'
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
    joints: 0
};

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
        
        map = L.map('map').setView([38.5976, -80.4549], 8);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap',
            maxZoom: 19
        }).addTo(map);
        
        addBridges();
        setupSearch();
        updateStats();
        createDebugPanel();
        createEvaluationPanel();
        
        map.on('zoomend', function() {
            currentZoom = map.getZoom();
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
    bridgesData.forEach(bridge => {
        if (!bridge.latitude || !bridge.longitude) return;
        
        const color = getBridgeColor(bridge);
        const size = getPointSize();
        
        // Calculate z-index based on worst rating - worse bridges appear on top
        const ratings = [
            bridge.deck_rating,
            bridge.superstructure_rating,
            bridge.substructure_rating,
            bridge.bearings_rating,
            bridge.joints_rating
        ].filter(r => r != null && r !== undefined);
        
        let zIndex = 100; // Default for N/A
        if (ratings.length > 0) {
            const worst = Math.min(...ratings);
            // Rating 0 (FAILED) = z-index 1000 (always on top)
            // Rating 1 = 900, Rating 9 = 100
            zIndex = worst === 0 ? 1000 : (1000 - (worst * 100));
        }
        
        const marker = L.circleMarker([bridge.latitude, bridge.longitude], {
            radius: size,
            fillColor: color,
            color: '#fff',
            weight: 2,
            fillOpacity: 0.85,
            zIndexOffset: zIndex
        });
        
        marker.bridgeData = bridge;
        
        marker.on('mouseover', function(e) {
            if (currentZoom > 13) {
                showNameTooltip(e, bridge);
            }
        });
        
        marker.on('mouseout', function() {
            removeNameTooltip();
        });
        
        marker.on('click', function(e) {
            L.DomEvent.stopPropagation(e);
            removeNameTooltip();
            showRadialMenu(e.latlng, bridge);
        });
        
        marker.addTo(map);
        bridgeLayers[bridge.bars_number] = marker;
    });
}

function showNameTooltip(e, bridge) {
    removeNameTooltip();
    
    const point = map.latLngToContainerPoint(e.latlng);
    const tooltip = L.DomUtil.create('div', 'name-tooltip');
    tooltip.style.left = point.x + 'px';
    tooltip.style.top = (point.y - 35) + 'px';
    tooltip.innerHTML = bridge.bridge_name || 'Unknown Bridge';
    
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
    title.style.top = (point.y - 225) + 'px';
    
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
    
    // 4 nodes at NE, SE, SW, NW (45°, 135°, 225°, 315°)
    const nodes = [
        { angle: 315, label: 'Condition', action: () => showCondition(bridge) },      // NW (top-left)
        { angle: 45, label: 'Geometry', action: () => showGeometry(bridge) },         // NE (top-right)
        { angle: 135, label: 'Attributes', action: () => showAttributes(bridge) },    // SE (bottom-right)
        { angle: 225, label: 'Narratives', action: () => showNarratives(bridge) }     // SW (bottom-left)
    ];
    
    nodes.forEach(node => {
        const rad = node.angle * Math.PI / 180;
        const distance = 100; // Increased for 110px circles
        
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
    
    // Click outside to close
    setTimeout(() => {
        const closeListener = function(e) {
            if (!menu.contains(e.target) && !e.target.closest('.info-panel')) {
                closeAllMenus();
                document.removeEventListener('click', closeListener);
            }
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
    html += '<div style="margin-top:15px;font-size:12px;color:#999;">Rating scale: 1 (Poor) to 9 (Excellent)</div>';
    
    createInfoPanel('Condition Ratings', html, bridge);
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
}

function getBridgeColor(bridge) {
    if (currentMode === 'evaluation') {
        return getEvaluationColor(bridge);
    }
    return districtColors[bridge.district] || '#00d9ff';
}

function getEvaluationColor(bridge) {
    const activeSliders = Object.entries(sliderValues).filter(([k, v]) => v > 0);
    
    // If no sliders active, use worst condition color
    if (activeSliders.length === 0) {
        return getWorstConditionColor(bridge);
    }
    
    // Calculate weighted average from active sliders
    let totalWeight = 0;
    let weightedSum = 0;
    
    const ratingMap = {
        deck: bridge.deck_rating,
        superstructure: bridge.superstructure_rating,
        substructure: bridge.substructure_rating,
        bearings: bridge.bearings_rating,
        joints: bridge.joints_rating
    };
    
    activeSliders.forEach(([key, weight]) => {
        const rating = ratingMap[key];
        if (rating != null && rating !== undefined) {
            weightedSum += rating * weight;
            totalWeight += weight;
        }
    });
    
    // If no valid ratings, return gray
    if (totalWeight === 0) return '#6b7280';
    
    const weightedAvg = Math.round(weightedSum / totalWeight);
    return conditionColors[weightedAvg] || '#6b7280';
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
    
    let totalWeight = 0;
    let weightedSum = 0;
    
    const ratingMap = {
        deck: bridge.deck_rating,
        superstructure: bridge.superstructure_rating,
        substructure: bridge.substructure_rating,
        bearings: bridge.bearings_rating,
        joints: bridge.joints_rating
    };
    
    activeSliders.forEach(([key, weight]) => {
        const rating = ratingMap[key];
        // Exclude 0 from calculations - treat as N/A
        if (rating != null && rating > 0) {
            weightedSum += rating * weight;
            totalWeight += weight;
        }
    });
    
    if (totalWeight === 0) return baseSize;
    
    const weightedAvg = weightedSum / totalWeight;
    const sizeFactor = (10 - weightedAvg) / 9;
    // Increased intensity by 5%: was baseSize * 2, now baseSize * 2.1
    return baseSize + (baseSize * 2.1 * sizeFactor);
}

function getEvaluationOpacity(bridge) {
    const ratings = [
        bridge.deck_rating,
        bridge.superstructure_rating,
        bridge.substructure_rating,
        bridge.bearings_rating,
        bridge.joints_rating
    ];
    
    // Check if ALL ratings are null/undefined or 0 (treat 0 as N/A for filtering)
    const hasValidRating = ratings.some(r => r != null && r !== undefined && r > 0);
    
    const activeSliders = Object.entries(sliderValues).filter(([k, v]) => v > 0);
    
    // If no sliders active, show all bridges
    if (activeSliders.length === 0) {
        if (!hasValidRating) return 0.85; // Show failed/N/A bridges at full opacity when no filtering
        const validRatings = ratings.filter(r => r != null && r !== undefined && r > 0);
        const worst = Math.min(...validRatings);
        // Best (9) = 20% opacity, Worst (1) = 85% opacity
        return 0.2 + (0.65 * (9 - worst) / 8);
    }
    
    // Sliders ARE active - hide bridges with ALL N/A or 0
    if (!hasValidRating) return 0;
    
    // Calculate weighted average - ONLY from ratings > 0
    let totalWeight = 0;
    let weightedSum = 0;
    
    const ratingMap = {
        deck: bridge.deck_rating,
        superstructure: bridge.superstructure_rating,
        substructure: bridge.substructure_rating,
        bearings: bridge.bearings_rating,
        joints: bridge.joints_rating
    };
    
    activeSliders.forEach(([key, weight]) => {
        const rating = ratingMap[key];
        // Exclude 0 from calculations - treat as N/A
        if (rating != null && rating !== undefined && rating > 0) {
            weightedSum += rating * weight;
            totalWeight += weight;
        }
    });
    
    // If no valid ratings for active sliders, hide the bridge
    if (totalWeight === 0) return 0;
    
    const weightedAvg = weightedSum / totalWeight;
    // Best (9) = 20% opacity, Worst (1) = 85% opacity
    return 0.2 + (0.65 * (9 - weightedAvg) / 8);
}

function updateBridgeSizes() {
    const baseSize = getPointSize();
    Object.values(bridgeLayers).forEach(marker => {
        const bridge = marker.bridgeData;
        const size = evaluationActive ? getEvaluationSize(bridge, baseSize) : baseSize;
        let opacity = evaluationActive ? getEvaluationOpacity(bridge) : 0.85;
        let outlineOpacity = 1;
        const color = getBridgeColor(bridge);
        
        // Apply search filter if active
        if (currentSearchQuery.length > 0) {
            const bars = (bridge.bars_number || '').toUpperCase();
            if (!bars.startsWith(currentSearchQuery)) {
                opacity = 0; // Hide fill
                outlineOpacity = 0; // Hide outline
            }
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
    const criteria = ['deck', 'superstructure', 'substructure', 'bearings', 'joints'];
    
    criteria.forEach(key => {
        const slider = document.getElementById(`slider-${key}`);
        if (slider) {
            slider.addEventListener('input', function() {
                sliderValues[key] = parseInt(this.value);
                document.getElementById(`value-${key}`).textContent = this.value;
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
        document.getElementById(`value-${key}`).textContent = '0';
    });
    applyEvaluation();
};

window.applyEvaluation = function() {
    updateBridgeSizes();
};

function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    
    searchInput.addEventListener('input', (e) => {
        currentSearchQuery = e.target.value.toUpperCase().trim();
        applySearch();
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
    
    // Incremental search on BARS number - fade out non-matching bridges
    Object.values(bridgeLayers).forEach(marker => {
        const bridge = marker.bridgeData;
        const bars = (bridge.bars_number || '').toUpperCase();
        
        if (bars.startsWith(currentSearchQuery)) {
            // Match - show bridge normally
            marker.setStyle({ 
                fillOpacity: evaluationActive ? getEvaluationOpacity(bridge) : 0.85,
                opacity: 1 // Outline visible
            });
        } else {
            // No match - hide both fill and outline
            marker.setStyle({ 
                fillOpacity: 0,
                opacity: 0 // Outline hidden too
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
