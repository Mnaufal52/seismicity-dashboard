// ==========================================
// 1. INIT MAP & BASEMAP
// ==========================================
const ifMobile = window.innerWidth <= 900;
const initialZoom = ifMobile ? 4 : 5; // Zoom 4 untuk HP, Zoom 5 untuk Laptop

const map = L.map("map").setView([-2.5, 118], initialZoom);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors"
}).addTo(map);

// ==========================================
// 2. GLOBAL VARIABLES & LAYER GROUPS
// ==========================================
// Layer penampung objek spasial
const plateLayer = L.layerGroup(); 
const volcanoLayer = L.layerGroup();
const earthquakeLayer = L.layerGroup();

// Variabel penyimpan data dan state memori
let allEarthquakeData = [];
let allVolcanoData = [];
let processedQuakeIds = new Set();   // Set untuk melacak ID gempa yang sudah dirender (mencegah duplikasi)
let magChart = null;                 // Instansiasi Chart.js
let volcanoMarkerRegistry = {};      // Menyimpan referensi marker gunung api untuk update UI dinamis
let activeSwarms = [];               // Menyimpan daftar gunung api yang sedang berstatus SWARM

// ==========================================
// 3. STYLE & INTERPRETATION FUNCTIONS
// ==========================================

function getColorByMagnitude(mag) {
    if (mag >= 5) return "#D0021B"; // Merah kuat (Alarm)
    else if (mag >= 4) return "#F5A623"; // Oranye terang (Warning)
    else return "#4A90E2"; // Biru cerah (Normal)
}

function getRadiusByMagnitude(mag) {
    return Math.max(4, mag * 2.5); 
}

function interpretEarthquake(mag, depth, eqLat, eqLon) {
    let interpretation = "";

    // 1. Analisis Kedalaman
    if (depth > 300) {
        interpretation += "Gempa dalam (Deep-focus) di slab subduksi. ";
    } else if (depth > 70) {
        interpretation += "Gempa menengah (Intermediate-depth) terkait proses subduksi. ";
    } else {
        interpretation += "Gempa kerak dangkal (Shallow crustal), kemungkinan aktivitas sesar lokal. ";
    }

    // 2. Analisis Energi
    if (mag >= 5) {
        interpretation += "Pelepasan energi KUAT, berpotensi menimbulkan kerusakan lokal.";
    } else if (mag >= 4) {
        interpretation += "Pelepasan stres tektonik menengah, umumnya dapat dirasakan.";
    }

    // 3. Auto Tectonic Context (Deteksi Gunung Api Radius 50km)
    let isNearVolcano = false;
    let nearestVolcanoName = "";

    if (allVolcanoData.length > 0) {
        for (let v of allVolcanoData) {
            if (v.geometry === null) continue; // Filter geometri invalid

            const vLon = v.geometry.coordinates[0];
            const vLat = v.geometry.coordinates[1];
            
            const distance = L.latLng(eqLat, eqLon).distanceTo(L.latLng(vLat, vLon));
            
            if (distance < 50000) {
                isNearVolcano = true;
                nearestVolcanoName = v.properties["Volcano Name"];
                break; 
            }
        }
    }

    if (isNearVolcano) {
        interpretation += `<br><br><span style="color:#d35400; font-weight:bold;">⚠️ Konteks Vulkanik:</span> Sangat dekat (< 50km) dengan <b>G. ${nearestVolcanoName}</b>. Waspadai aktivitas magmatik / Volcanic Arc.`;
    }
    return interpretation;
}

// ==========================================
// 4. GEOSCIENCE ANALYTICS & TIME UTILS
// ==========================================

function getEarthquakeAgeInHours(eqTime) {
    const currentTime = Date.now(); 
    const diffInMilliseconds = currentTime - eqTime; 
    return diffInMilliseconds / (1000 * 60 * 60); 
}

function getRelativeTimeText(ageInHours) {
    if (ageInHours < 1) {
        const mins = Math.round(ageInHours * 60);
        return `🚨 Baru saja terjadi (${mins} menit yang lalu)`;
    } else {
        return `⏱️ Terjadi ${ageInHours.toFixed(1)} jam yang lalu`;
    }
}

function findNearbyVolcanoes(eqLat, eqLon, radiusKm) {
    let nearbyVolcanoes = [];

    if (!allVolcanoData || allVolcanoData.length === 0) {
        return nearbyVolcanoes;
    }

    allVolcanoData.forEach(v => {
        if (v.geometry === null) return; 

        const vLon = v.geometry.coordinates[0];
        const vLat = v.geometry.coordinates[1];
        const volName = v.properties["Volcano Name"] || "Gunung Api Anonim";

        const distanceMeters = L.latLng(eqLat, eqLon).distanceTo(L.latLng(vLat, vLon));
        const distanceKm = distanceMeters / 1000;

        if (distanceKm <= radiusKm) {
            nearbyVolcanoes.push({
                name: volName,
                distance: distanceKm.toFixed(2),
                lat: vLat,
                lon: vLon
            });
        }
    });

    return nearbyVolcanoes; 
}

function checkVolcanoSwarms() {
    let swarmingVolcanoes = [];

    if (!allVolcanoData || allVolcanoData.length === 0 || !allEarthquakeData || allEarthquakeData.length === 0) {
        return swarmingVolcanoes;
    }

    allVolcanoData.forEach(v => {
        if (v.geometry === null) return; 

        const vLon = v.geometry.coordinates[0];
        const vLat = v.geometry.coordinates[1];
        const volName = v.properties["Volcano Name"] || "Gunung Api Anonim";

        let swarmQuakeCount = 0; 

        allEarthquakeData.forEach(eq => {
            const eqLon = eq.geometry.coordinates[0];
            const eqLat = eq.geometry.coordinates[1];
            const eqTime = eq.properties.time;

            const ageInHours = getEarthquakeAgeInHours(eqTime);
            if (ageInHours <= 6) {
                const distanceMeters = L.latLng(eqLat, eqLon).distanceTo(L.latLng(vLat, vLon));
                if ((distanceMeters / 1000) <= 30) {
                    swarmQuakeCount++; 
                }
            }
        });

        if (swarmQuakeCount >= 5) {
            swarmingVolcanoes.push({
                name: volName,
                lat: vLat,
                lon: vLon,
                totalQuakes: swarmQuakeCount
            });
            console.warn(`🌋 PERINGATAN DINI: Potensi SWARM di ${volName}! (${swarmQuakeCount} gempa dangkal dalam 6 jam terakhir)`);
        }
    });

    return swarmingVolcanoes;
}

// ==========================================
// 5. CORE DATA FETCHING (EARTHQUAKES)
// ==========================================

function loadEarthquakeData() {
    fetch("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson")
    .then(res => res.json())
    .then(data => {
        const filteredFeatures = data.features.filter(eq => eq.properties.mag >= 3);

        // Data Diffing: Hanya proses gempa yang belum dirender sebelumnya
        const newEarthquakes = filteredFeatures.filter(eq => !processedQuakeIds.has(eq.id));

        if (newEarthquakes.length === 0) {
            console.log("✅ Update Real-Time: Tidak ada gempa baru. Peta aman.");
            allEarthquakeData = filteredFeatures; 
            return; 
        }

        console.log(`🚨 Update Real-Time: Menyuntikkan ${newEarthquakes.length} gempa baru ke peta!`);

        newEarthquakes.forEach(eq => {
            const eqId = eq.id;
            processedQuakeIds.add(eqId);

            const [lon, lat, depth] = eq.geometry.coordinates;
            const { mag, place, time } = eq.properties;

            const ageInHours = getEarthquakeAgeInHours(time);

            let marker; 

            // Logika Radar Kedip vs Standar (Visual UI)
            if (ageInHours < 1) {
                const pulseIcon = L.divIcon({
                    className: 'pulse-alert', 
                    iconSize: [16, 16],       
                    iconAnchor: [8, 8]        
                });
                marker = L.marker([lat, lon], { icon: pulseIcon });
            } else {
                let currentOpacity = 0.8; 
                if (ageInHours > 12) {
                    currentOpacity = 0.4; // Fading effect untuk gempa lama
                }

                marker = L.circleMarker([lat, lon], {
                    radius: getRadiusByMagnitude(mag),
                    fillColor: getColorByMagnitude(mag),
                    color: "#333",
                    weight: 1, 
                    opacity: currentOpacity,      
                    fillOpacity: currentOpacity   
                });
            }

            // Geological Storytelling Popup
            marker.bindPopup(function() {
                const liveInsight = interpretEarthquake(mag, depth, lat, lon);
                const timeStory = getRelativeTimeText(ageInHours);

                return `
                    <div style="font-size:14px; font-family: sans-serif; min-width: 220px;">
                        <strong style="font-size:16px; color:#2c3e50;">Laporan Seismik</strong>
                        <hr style="margin: 5px 0; border:1px solid #ccc;">

                        <div style="color:#d35400; font-weight:bold; font-size:12px; margin-bottom:4px;">
                            ${timeStory}
                        </div>

                        <b>Waktu:</b> ${new Date(time).toUTCString()}<br>
                        <b>Lokasi:</b> ${place}<br>
                        
                        <div style="display:flex; justify-content:space-between; background-color:#f4f4f4; padding:8px; border-radius:4px; margin: 8px 0; border-left: 4px solid ${getColorByMagnitude(mag)};">
                            <div><b>Mag:</b> <span style="font-size:16px; color:${getColorByMagnitude(mag)}">${mag}</span></div>
                            <div><b>Depth:</b> ${depth} km</div>
                        </div>
                        
                        <div style="background-color:#e8f4f8; padding:8px; border-radius:4px; border-left: 4px solid #3498db;">
                            <b style="color:#2980b9;">Interpretasi Geologi:</b><br>
                            <span style="font-style: italic; font-size:13px; color:#333;">
                                "${liveInsight}"
                            </span>
                        </div>
                    </div>
                `;
            });

            earthquakeLayer.addLayer(marker);
        });

        allEarthquakeData = filteredFeatures;

        // Sinkronisasi KPI dan status vulkanik
        if (newEarthquakes.length > 0) {
            console.log("📊 Sinkronisasi Real-Time: Mengupdate angka KPI dan List Gempa...");
            updateSmartDashboard();

            const currentSwarms = checkVolcanoSwarms(); 
            activeSwarms = currentSwarms; 
            updateVolcanoUI(currentSwarms);
        }
    })
    .catch(err => console.error("Gagal mengambil data seismik:", err));
}


// ==========================================
// 6. LOAD TECTONIC PLATES
// ==========================================
fetch('data/tectonic_plates.json')
    .then(response => response.json())
    .then(data => {
        const tectonicLines = L.geoJSON(data, {
            style: function() {
                return {
                    color: "red", 
                    weight: 2,        // Ketebalan garis
                    dashArray: "4",   // Efek garis putus-putus
                    opacity: 0.8      // Transparansi garis
                };
            }
        });
        
        plateLayer.addLayer(tectonicLines);
    })
    .catch(err => console.error("Gagal memuat data lempeng tektonik:", err));

// ==========================================
// 7. LOAD VOLCANOES & UI REGISTRY
// ==========================================
fetch('data/volcanoes.geojson')
    .then(response => response.json())
    .then(data => {
        allVolcanoData = data.features;  

        const volcanoIcon = L.icon({
            iconUrl: 'volcano.png', 
            iconSize: [12, 12] 
        });

        const volcanoes = L.geoJSON(data, {
            // ==========================================
            // 1. BLOK FILTER BARU (Pembersihan Data)
            // ==========================================
            filter: function(feature) {
                const statusErupsi = feature.properties["Last Known Eruption"];
                
                // Buang data jika nilainya kosong, "Unknown", atau "Undefined"
                if (!statusErupsi || statusErupsi === "Unknown" || statusErupsi === "Undefined") {
                    return false; // Jangan tampilkan di peta
                }
                return true; // Tampilkan sisanya di peta
            },

            // ==========================================
            // 2. Render marker & daftarkan ke Swarm Tracker
            // ==========================================
            pointToLayer: function(feature, latlng) {
                const marker = L.marker(latlng, { icon: volcanoIcon });
                
                const volName = feature.properties["Volcano Name"];
                if (volName) {
                    volcanoMarkerRegistry[volName] = marker;
                }
                
                return marker;
            },
            
            // ==========================================
            // 3. Render Popup Dinamis
            // ==========================================
            onEachFeature: function(feature, layer) {
                if (!feature.properties["Volcano Name"]) return;

                layer.bindPopup(function() {
                    const volName = feature.properties["Volcano Name"];
                    const swarmData = activeSwarms.find(v => v.name === volName);

                    let warningHTML = "";
                    if (swarmData) {
                        warningHTML = `
                            <div style="background-color: #ffeaea; padding: 10px; border-left: 4px solid #FF0000; margin-bottom: 10px; border-radius: 4px;">
                                <strong style="color: #FF0000; font-size: 13px;">⚠️ POTENSI SWARM VULKANIK</strong><br>
                                <span style="font-size: 12px; color: #333;">Terdeteksi <b>${swarmData.totalQuakes} gempa dangkal</b> dalam 6 jam terakhir. Indikasi pergerakan magma / stress tektonik.</span>
                            </div>
                        `;
                    }

                    return `
                        <div style="font-family: sans-serif; min-width: 200px;">
                            ${warningHTML}
                            <strong style="font-size:15px; color:#d35400;">🌋 ${volName}</strong><br/>
                            <small style="color:#7f8c8d;">📍 ${feature.properties["Country"]} | ${feature.properties["Primary Volcano Type"]}</small>
                            <hr style="margin: 5px 0; border:1px solid #ccc;">
                            <b>Erupsi Terakhir:</b> <span style="color:red;">${feature.properties["Last Known Eruption"] || "Unknown"}</span><br/>
                            <b>Elevasi:</b> ${feature.properties["Elevation (m)"] ? feature.properties["Elevation (m)"] + " mdpl" : "Unknown"}<br/>
                            <b>Tipe Batuan:</b> ${feature.properties["Dominant Rock Type"] || "-"}
                        </div>
                    `;
                });
            }
        });

        volcanoLayer.addLayer(volcanoes);
    })
    .catch(err => console.error("Gagal memuat data gunung api:", err));
    
// ==========================================
// 8. DASHBOARD LOGIC (Sidebar, KPI, Chart)
// ==========================================

// --- FUNGSI UPDATE LIST (SIDEBAR) ---
function updateList(features) {
    const listContainer = document.getElementById('quake-list');
    if (!listContainer) return; 

    listContainer.innerHTML = ''; 

    // Guard: Jika tidak ada data gempa di layar
    if (features.length === 0) {
        listContainer.innerHTML = `
            <li style="text-align: center; padding: 30px 10px; color: #7f8c8d;">
                <span style="font-size: 24px; display: block; margin-bottom: 10px;">✅</span>
                <i>Tidak ada gempa signifikan (M ≥ 3) di wilayah layar saat ini. Kondisi relatif aman.</i>
            </li>
        `;
        return; 
    }

    const recentQuakes = features.slice(0, 15);

    recentQuakes.forEach(feature => {
        const props = feature.properties;
        const coords = feature.geometry.coordinates;

        // Hitung umur gempa untuk narasi waktu di Sidebar
        const age = getEarthquakeAgeInHours(props.time);
        const timeStorySidebar = getRelativeTimeText(age);

        const li = document.createElement('li');
        li.style.cursor = "pointer";
        li.style.padding = "10px";
        li.style.borderBottom = "1px solid #eee";

        li.innerHTML = `
            <div style="color: #c0392b; font-size: 11px; font-weight: bold; margin-bottom: 3px;">
                ${timeStorySidebar}
            </div>
            <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 14px;" title="${props.place}">
                <strong style="color: ${getColorByMagnitude(props.mag)}">M ${props.mag.toFixed(1)}</strong> 
                - ${props.place}
            </div>
            <div style="color: #666; font-size: 12px; margin-top: 4px;">
                ${new Date(props.time).toLocaleTimeString()} | Kedalaman: ${coords[2].toFixed(1)} km
            </div>
        `;

        // Interaksi klik untuk terbang ke lokasi gempa
        li.onclick = function() {
            map.flyTo([coords[1], coords[0]], 10, { animate: true, duration: 1.5 });
        };

        listContainer.appendChild(li);
    });
}

// --- FUNGSI UPDATE KPI (KARTU ATAS) ---
function updateKPI(features) {
    const elTotal = document.getElementById('total-gempa');
    const elSig = document.getElementById('sig-gempa');
    const elMax = document.getElementById('max-gempa'); 
    const elAvg = document.getElementById('avg-gempa'); 

    if (elTotal) elTotal.innerText = features.length;

    if (elSig) {
        const significant = features.filter(f => f.properties.mag >= 5.0).length;
        elSig.innerText = significant;
    }

    // Reset nilai jika tidak ada gempa
    if (features.length === 0) {
        if (elMax) elMax.innerText = "-";
        if (elAvg) elAvg.innerText = "-";
        return;
    }

    if (elMax) {
        const max = Math.max(...features.map(f => f.properties.mag));
        elMax.innerText = max.toFixed(2) + " SR";
    }

    if (elAvg) {
        const sumMag = features.reduce((total, f) => total + f.properties.mag, 0);
        const avgMag = sumMag / features.length;
        elAvg.innerText = avgMag.toFixed(2) + " SR";
    }
}

// --- FUNGSI UPDATE GRAFIK CHART.JS ---
function updateChart(features) {
    const ctx = document.getElementById('magChart');
    if (!ctx) return; 

    // Hitung distribusi magnitudo
    let countKuat = 0;     // M >= 5.0 
    let countMenengah = 0; // M 4.0 - 4.9 
    let countLemah = 0;    // M < 4.0 

    features.forEach(f => {
        const mag = f.properties.mag;
        if (mag >= 5.0) countKuat++;
        else if (mag >= 4.0) countMenengah++;
        else countLemah++;
    });

    // Reset grafik lama agar tidak tumpang tindih
    if (magChart !== null) {
        magChart.destroy();
    }

    // Render grafik baru
    magChart = new Chart(ctx, {
        type: 'bar', 
        data: {
            labels: ['Kuat (≥ 5.0)', 'Menengah (4.0-4.9)', 'Lemah (< 4.0)'],
            datasets: [{
                label: 'Jumlah Gempa',
                data: [countKuat, countMenengah, countLemah],
                backgroundColor: [
                    '#D0021B', // Merah
                    '#F5A623', // Oranye
                    '#4A90E2'  // Biru
                ],
                borderRadius: 4, 
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1 } // Pastikan sumbu Y selalu angka bulat
                }
            },
            plugins: {
                legend: { display: false } 
            },
            animation: {
                duration: 500 
            }
        }
    });
}

// --- FUNGSI SMART DASHBOARD ENGINE ---
function updateSmartDashboard() {
    const bounds = map.getBounds();
    const visibleFeatures = allEarthquakeData.filter(eq => {
        const [lon, lat] = eq.geometry.coordinates;
        return bounds.contains([lat, lon]);
    });
  
    updateKPI(visibleFeatures);
    updateList(visibleFeatures);
    updateChart(visibleFeatures);
}

// --- SPATIAL REGION SELECTOR ---
const regionSelector = document.getElementById('region-selector');

const regionCoordinates = {
    "global": [20, 0, 2],
    "indo": [-2.5, 118, 5],
    "sumatera": [0, 102, 6],
    "jawa": [-7.5, 110, 6],
    "sulawesi": [-2, 121, 6],
    "papua": [-4, 136, 6]
};

if (regionSelector) {
    regionSelector.addEventListener('change', function(event) {
        const selectedRegion = event.target.value;
        const coords = regionCoordinates[selectedRegion];

        if (coords) {
            // Cek apakah layar sedang dibuka di HP
            const isMobile = window.innerWidth <= 900;
            
            // Ambil zoom default dari dictionary (coords[2])
            let targetZoom = coords[2];
            
            // Jika di HP, kurangi zoom 1 level agar area terlihat lebih luas
            if (isMobile) {
                // Khusus untuk global, pastikan zoom tidak kurang dari 1
                targetZoom = (selectedRegion === 'global') ? 1 : targetZoom - 1; 
            }

            // Terbang ke koordinat dengan zoom yang sudah disesuaikan
            map.flyTo([coords[0], coords[1]], targetZoom, {
                animate: true,
                duration: 1.5
            });
        }
    });
}


// =======================
// 9. MAP CONTROLS & EVENT LISTENERS
// =======================

// Tambahkan layer grup utama ke peta secara default
plateLayer.addTo(map);
volcanoLayer.addTo(map);
earthquakeLayer.addTo(map);

// Konfigurasi Layer Control (Toggles)
const overlayMaps = {
  "Gempa Magnitudo ≥ 3 (Realtime)": earthquakeLayer, 
  "Gunung Api Aktif": volcanoLayer,
  "Batas Lempeng Tektonik": plateLayer 
};

let isMobile = window.innerWidth <= 900;
L.control.layers(null, overlayMaps, { collapsed: isMobile }).addTo(map);

// Trigger update dashboard secara dinamis saat pengguna menggeser/zoom peta
map.on('moveend', updateSmartDashboard);


// =======================
// 10. FLOATING MAP LEGEND
// =======================

const legend = L.control({ position: "bottomright" });

legend.onAdd = function (map) {
    const div = L.DomUtil.create("div", "info legend");
    
    // Styling kontainer legenda
    div.style.backgroundColor = "white";
    div.style.padding = "10px 15px";
    div.style.borderRadius = "8px";
    div.style.boxShadow = "0 2px 5px rgba(0,0,0,0.15)";
    div.style.fontFamily = "sans-serif";
    div.style.color = "#333";

    // Struktur HTML Legenda
    div.innerHTML = `
        <h4 style="margin: 0 0 10px 0; font-size: 14px; color: #2c3e50; border-bottom: 2px solid #eee; padding-bottom: 5px;">
            📊 Legenda
        </h4>
        <div style="display: flex; flex-direction: column; gap: 6px;">
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="display: inline-block; width: 12px; height: 12px; background-color: #D0021B; border-radius: 50%; border: 1px solid #333;"></span>
                <span style="font-size: 12px;">Gempa Kuat (M ≥ 5.0)</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="display: inline-block; width: 12px; height: 12px; background-color: #F5A623; border-radius: 50%; border: 1px solid #333;"></span>
                <span style="font-size: 12px;">Gempa Menengah (M 4.0 - 4.9)</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="display: inline-block; width: 12px; height: 12px; background-color: #4A90E2; border-radius: 50%; border: 1px solid #333;"></span>
                <span style="font-size: 12px;">Gempa Lemah (M < 4.0)</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 14px;">🌋</span>
                <span style="font-size: 12px;">Gunung Api Holocene</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="color: #e74c3c; font-weight: bold; letter-spacing: 2px;">----</span>
                <span style="font-size: 12px;">Batas Lempeng</span>
            </div>
        </div>
    `;
    return div;
};

// Pasang legenda ke atas peta
legend.addTo(map);

// ==========================================
// 11. UI UPDATERS (Volcano Swarm & Global Alarm)
// ==========================================

function updateVolcanoUI(swarmingVolcanoes) {
    const defaultIcon = L.icon({ iconUrl: 'volcano.png', iconSize: [12, 12] });
    const swarmIcon = L.divIcon({
        className: 'swarm-alert',
        iconSize: [24, 24],
        iconAnchor: [12, 24] 
    });

    // Reset ikon ke status normal
    for (let name in volcanoMarkerRegistry) {
        volcanoMarkerRegistry[name].setIcon(defaultIcon);
    }

    // Terapkan ikon darurat untuk gunung bersatus SWARM
    swarmingVolcanoes.forEach(v => {
        const marker = volcanoMarkerRegistry[v.name];
        if (marker) {
            marker.setIcon(swarmIcon);
        }
    });

    // Sinkronisasi dengan Global Alarm Panel di Sidebar
    const globalAlarmBox = document.getElementById('global-swarm-alarm');
    const swarmCountText = document.getElementById('swarm-count');

    if (globalAlarmBox && swarmCountText) {
        if (swarmingVolcanoes.length > 0) {
            globalAlarmBox.style.display = 'block';
            swarmCountText.innerText = swarmingVolcanoes.length;
        } else {
            globalAlarmBox.style.display = 'none';
        }
    }
}

// ==========================================
// 12. STRESS TEST MODULE (Sakurajima Simulation)
// ==========================================

function triggerSakurajimaSwarm() {
    console.warn("🌋 MEMULAI SAKURAJIMA STRESS TEST...");

    // Pusat simulasi koordinat
    const sakuLat = 31.593;
    const sakuLon = 130.657;
    const now = Date.now(); 

    // Injeksi 6 gempa buatan secara sekuensial
    for (let i = 0; i < 6; i++) {
        const randomLat = sakuLat + (Math.random() * 0.1 - 0.05);
        const randomLon = sakuLon + (Math.random() * 0.1 - 0.05);

        const mockEq = {
            id: "mock_saku_" + i,
            geometry: { coordinates: [randomLon, randomLat, 10] }, 
            properties: {
                mag: 3.5 + Math.random(), 
                place: "Mock Swarm - Sakurajima Region",
                time: now - (i * 1000 * 60 * 15) 
            }
        };

        allEarthquakeData.push(mockEq);
        processedQuakeIds.add(mockEq.id);

        const pulseIcon = L.divIcon({ className: 'pulse-alert', iconSize: [16, 16], iconAnchor: [8, 8] });
        const marker = L.marker([randomLat, randomLon], { icon: pulseIcon });
        
        marker.bindPopup(`<b>🧪 TEST GEMPA SAKURAJIMA</b><br>Mag: ${mockEq.properties.mag.toFixed(1)}`);
        earthquakeLayer.addLayer(marker);
    }

    // Eksekusi engine analitik
    const currentSwarms = checkVolcanoSwarms();
    activeSwarms = currentSwarms;
    updateVolcanoUI(currentSwarms);

    // Auto-focus kamera ke area krisis
    map.flyTo([sakuLat, sakuLon], 9, {
        animate: true,
        duration: 2.5
    });

    console.log("✅ STRESS TEST SELESAI! Cek alarm dan peta!");
}

// ==========================================
// 13. APP INITIALIZATION & REAL-TIME ENGINE
// ==========================================

// Tarikan data pertama saat dashboard dimuat
loadEarthquakeData();

// Background Polling: Fetch otomatis setiap 60 detik
setInterval(function() {
    console.log("🔄 Background Polling: Mengambil data gempa terbaru dari USGS...");
    loadEarthquakeData();
}, 60000);