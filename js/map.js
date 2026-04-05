// ==========================================================================
// 1. INISIALISASI PETA (INIT MAP) & PETA DASAR (BASEMAP)
// ==========================================================================

// --- SENSOR RESPONSIVITAS LAYAR ---
// Mendeteksi apakah pengunjung menggunakan layar HP (lebar <= 900px)
const ifMobile = window.innerWidth <= 900;

// Logika Ternary: Jika di HP (true) gunakan zoom level 4, jika di Laptop gunakan zoom 5
const initialZoom = ifMobile ? 4 : 5; 

// --- PEMBUATAN KANVAS PETA ---
// L.map("map") mencari <div id="map"> di HTML untuk dijadikan tempat peta
// setView([Latitude, Longitude], Zoom Level) mengatur titik tengah awal saat web dibuka
// [-2.5, 118] adalah titik koordinat tengah kepulauan Indonesia
const map = L.map("map").setView([-2.5, 118], initialZoom);

// --- PEMANGGILAN LAYER PETA DASAR (BASEMAP) ---
// Mengambil potongan gambar peta (tiles) dari server gratis OpenStreetMap
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    // Attribution adalah WAJIB (syarat lisensi) untuk menghargai penyedia data peta
    attribution: "© OpenStreetMap contributors"
}).addTo(map); // Menempelkan gambar peta dasar ini ke dalam kanvas 'map'

// ==========================================================================
// 2. GLOBAL VARIABLES & LAYER GROUPS (MEMORI & WADAH SPASIAL)
// ==========================================================================

// --- WADAH LAYER PETA (Mika Transparan) ---
// Membuat layer terpisah agar pengguna nanti bisa menyalakan/mematikan data tertentu di legenda
const plateLayer = L.layerGroup(); 
const volcanoLayer = L.layerGroup();
const earthquakeLayer = L.layerGroup();

// --- MEMORI STATE (Penyimpan Data Sementara di Browser) ---
let allEarthquakeData = []; // Menyimpan semua data gempa murni dari API
let allVolcanoData = [];    // Menyimpan semua atribut gunung api untuk analisis spasial

// Set() digunakan karena jauh lebih cepat daripada Array biasa untuk mencari data
// Ini mencegah 1 gempa digambar 2 kali di peta saat sistem melakukan auto-refresh
let processedQuakeIds = new Set(); 

let magChart = null;              // Wadah kosong untuk grafik Chart.js nanti
let volcanoMarkerRegistry = {};   // Buku alamat untuk menyimpan ID tiap marker gunung api
let activeSwarms = [];            // Keranjang untuk menyimpan nama gunung api yang sedang berstatus bahaya

// ==========================================================================
// 3. STYLE & INTERPRETATION FUNCTIONS (LOGIKA VISUAL & GEOLOGI)
// ==========================================================================

// --- FUNGSI WARNA GEMPA ---
function getColorByMagnitude(mag) {
    if (mag >= 5) return "#D0021B"; // >= 5 SR: Merah kuat (Alarm/Bahaya)
    else if (mag >= 4) return "#F5A623"; // 4 - 4.9 SR: Oranye terang (Waspada)
    else return "#4A90E2"; // < 4 SR: Biru cerah (Aktivitas Latar/Normal)
}

// --- FUNGSI UKURAN TITIK GEMPA ---
// Semakin besar magnitudo, semakin besar radius lingkarannya. Batas terkecil adalah 4 pixel.
function getRadiusByMagnitude(mag) {
    return Math.max(4, mag * 2.5); 
}

// --- MESIN INTERPRETASI GEOLOGI OTOMATIS (Geological Storytelling) ---
// Fungsi ini merakit paragraf penjelasan berdasarkan angka mentah dari API
function interpretEarthquake(mag, depth, eqLat, eqLon) {
    let interpretation = "";

    // 1. Analisis Kedalaman (Klasifikasi Hiposenter)
    if (depth > 300) {
        interpretation += "Gempa dalam (Deep-focus) di slab subduksi. ";
    } else if (depth > 70) {
        interpretation += "Gempa menengah (Intermediate-depth) terkait proses subduksi. ";
    } else {
        interpretation += "Gempa kerak dangkal (Shallow crustal), kemungkinan aktivitas sesar lokal. ";
    }

    // 2. Analisis Energi (Dampak Permukaan)
    if (mag >= 5) {
        interpretation += "Pelepasan energi KUAT, berpotensi menimbulkan kerusakan lokal.";
    } else if (mag >= 4) {
        interpretation += "Pelepasan stres tektonik menengah, umumnya dapat dirasakan.";
    }

    // 3. Deteksi Interaksi Tektonik-Vulkanik Otomatis
    let isNearVolcano = false;
    let nearestVolcanoName = "";

    // Lakukan pencarian hanya jika data gunung api sudah berhasil dimuat
    if (allVolcanoData.length > 0) {
        for (let v of allVolcanoData) {
            if (v.geometry === null) continue; // Abaikan gunung api yang tidak punya koordinat

            const vLon = v.geometry.coordinates[0];
            const vLat = v.geometry.coordinates[1];
            
            // L.latLng().distanceTo menghitung jarak lengkung bumi yang presisi dalam satuan METER
            const distance = L.latLng(eqLat, eqLon).distanceTo(L.latLng(vLat, vLon));
            
            // Jarak Toleransi: 50.000 meter = 50 kilometer
            if (distance < 50000) {
                isNearVolcano = true;
                nearestVolcanoName = v.properties["Volcano Name"];
                break; // Jika sudah nemu 1 yang terdekat, hentikan pencarian agar browser tidak lemot
            }
        }
    }

    // Jika gempa berada di radius < 50km dari gunung api, suntikkan peringatan ekstra ke dalam teks
    if (isNearVolcano) {
        interpretation += `<br><br><span style="color:#d35400; font-weight:bold;">⚠️ Konteks Vulkanik:</span> Sangat dekat (< 50km) dengan <b>G. ${nearestVolcanoName}</b>. Waspadai aktivitas magmatik / Volcanic Arc.`;
    }
    
    return interpretation;
}

// ==========================================================================
// 4. GEOSCIENCE ANALYTICS & TIME UTILS (UTILITAS WAKTU & ANALISIS GEOSAIN)
// ==========================================================================

// --- MENGHITUNG UMUR GEMPA ---
function getEarthquakeAgeInHours(eqTime) {
    const currentTime = Date.now(); // Ambil waktu komputer saat ini
    const diffInMilliseconds = currentTime - eqTime; // Hitung selisih waktu
    return diffInMilliseconds / (1000 * 60 * 60); // Konversi dari milidetik ke Jam
}

// --- FORMAT TEKS WAKTU RELATIF UNTUK POPUP ---
function getRelativeTimeText(ageInHours) {
    if (ageInHours < 1) {
        const mins = Math.round(ageInHours * 60);
        return `🚨 Baru saja terjadi (${mins} menit yang lalu)`;
    } else {
        return `⏱️ Terjadi ${ageInHours.toFixed(1)} jam yang lalu`;
    }
}

// --- BUFFER SPASIAL: MENCARI GUNUNG API DALAM RADIUS TERTENTU ---
function findNearbyVolcanoes(eqLat, eqLon, radiusKm) {
    let nearbyVolcanoes = [];

    // Pastikan data gunung api sudah dimuat sebelum melakukan pencarian
    if (!allVolcanoData || allVolcanoData.length === 0) {
        return nearbyVolcanoes;
    }

    // Looping untuk mengecek jarak gempa ini ke SETIAP gunung api di dunia
    allVolcanoData.forEach(v => {
        if (v.geometry === null) return; 

        const vLon = v.geometry.coordinates[0];
        const vLat = v.geometry.coordinates[1];
        const volName = v.properties["Volcano Name"] || "Gunung Api Anonim";

        // Leaflet menghitung jarak bumi nyata (Haversine Formula) dalam satuan meter
        const distanceMeters = L.latLng(eqLat, eqLon).distanceTo(L.latLng(vLat, vLon));
        const distanceKm = distanceMeters / 1000;

        // Jika jaraknya masuk ke dalam radius yang ditentukan, masukkan ke daftar
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

// --- ALGORITMA EARLY WARNING: DETEKSI VOLCANIC SWARM ---
function checkVolcanoSwarms() {
    let swarmingVolcanoes = [];

    if (!allVolcanoData || allVolcanoData.length === 0 || !allEarthquakeData || allEarthquakeData.length === 0) {
        return swarmingVolcanoes;
    }

    // Periksa setiap gunung api satu per satu
    allVolcanoData.forEach(v => {
        if (v.geometry === null) return; 

        const vLon = v.geometry.coordinates[0];
        const vLat = v.geometry.coordinates[1];
        const volName = v.properties["Volcano Name"] || "Gunung Api Anonim";

        let swarmQuakeCount = 0; 

        // Hitung berapa banyak gempa yang memenuhi syarat SWARM di sekitar gunung ini
        allEarthquakeData.forEach(eq => {
            const eqLon = eq.geometry.coordinates[0];
            const eqLat = eq.geometry.coordinates[1];
            const eqTime = eq.properties.time;

            const ageInHours = getEarthquakeAgeInHours(eqTime);
            
            // SYARAT 1: Gempa harus baru terjadi (umur <= 6 jam)
            if (ageInHours <= 6) {
                const distanceMeters = L.latLng(eqLat, eqLon).distanceTo(L.latLng(vLat, vLon));
                
                // SYARAT 2: Gempa harus berada di radius <= 30 km dari pusat gunung api
                if ((distanceMeters / 1000) <= 30) {
                    swarmQuakeCount++; 
                }
            }
        });

        // SYARAT 3: Jika ada 5 atau lebih gempa yang memenuhi kriteria di atas = STATUS SWARM AKTIF
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

    return swarmingVolcanoes; // Kembalikan daftar gunung yang berbahaya
}

// ==========================================================================
// 5. CORE DATA FETCHING (TARIK DATA GEMPA REAL-TIME DARI USGS)
// ==========================================================================

function loadEarthquakeData() {
    // Memanggil API publik USGS untuk data gempa global 24 jam terakhir
    fetch("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson")
    .then(res => res.json())
    .then(data => {
        // FILTER: Hanya ambil gempa dengan Magnitudo >= 3 (Abaikan gempa mikro)
        const filteredFeatures = data.features.filter(eq => eq.properties.mag >= 3);

        // DATA DIFFING (Optimasi RAM): 
        // Jangan gambar ulang gempa yang sudah ada di peta, cukup ambil gempa yang benar-benar BARU
        const newEarthquakes = filteredFeatures.filter(eq => !processedQuakeIds.has(eq.id));

        if (newEarthquakes.length === 0) {
            console.log("✅ Update Real-Time: Tidak ada gempa baru. Peta aman.");
            allEarthquakeData = filteredFeatures; 
            return; // Hentikan fungsi di sini jika tidak ada data baru
        }

        console.log(`🚨 Update Real-Time: Menyuntikkan ${newEarthquakes.length} gempa baru ke peta!`);

        // Mulai menggambar gempa baru ke atas peta
        newEarthquakes.forEach(eq => {
            const eqId = eq.id;
            processedQuakeIds.add(eqId); // Catat ID gempa ini agar tidak digambar dobel nanti

            const [lon, lat, depth] = eq.geometry.coordinates;
            const { mag, place, time } = eq.properties;

            const ageInHours = getEarthquakeAgeInHours(time);

            let marker; 

            // --- LOGIKA VISUALISASI UI ---
            // Jika gempa berumur kurang dari 1 jam, gunakan ikon radar merah berkedip
            if (ageInHours < 1) {
                const pulseIcon = L.divIcon({
                    className: 'pulse-alert', 
                    iconSize: [16, 16],       
                    iconAnchor: [8, 8]        
                });
                marker = L.marker([lat, lon], { icon: pulseIcon });
            } 
            // Jika gempa lama, gunakan lingkaran transparan standar
            else {
                let currentOpacity = 0.8; 
                // Efek memudar (fading) untuk gempa yang sudah berumur lebih dari 12 jam
                if (ageInHours > 12) {
                    currentOpacity = 0.4; 
                }

                marker = L.circleMarker([lat, lon], {
                    radius: getRadiusByMagnitude(mag),
                    fillColor: getColorByMagnitude(mag),
                    color: "#333", // Garis batas (border) titik
                    weight: 1, 
                    opacity: currentOpacity,      
                    fillOpacity: currentOpacity   
                });
            }

            // --- GEOLOGICAL STORYTELLING (Popup saat titik diklik) ---
            marker.bindPopup(function() {
                // Memanggil mesin penerjemah geologi yang kita buat sebelumnya
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

        // Perbarui database lokal memori browser dengan data terbaru
        allEarthquakeData = filteredFeatures;

        // --- SINKRONISASI UI (User Interface) ---
        if (newEarthquakes.length > 0) {
            console.log("📊 Sinkronisasi Real-Time: Mengupdate angka KPI dan List Gempa...");
            
            // Perbarui Widget KPI dan Grafik
            updateSmartDashboard();

            // Jalankan pemeriksaan SWARM ulang dengan data gempa yang baru masuk
            const currentSwarms = checkVolcanoSwarms(); 
            activeSwarms = currentSwarms; 
            updateVolcanoUI(currentSwarms); // Nyalakan sirine di Sidebar jika perlu
        }
    })
    .catch(err => console.error("Gagal mengambil data seismik:", err));
}


//// ==========================================================================
// 6. LOAD TECTONIC PLATES (PETA GARIS LEMPENG)
// ==========================================
// Fetch berfungsi mengambil file JSON lokal dari folder 'data'
fetch('data/tectonic_plates.json')
    .then(response => response.json()) // Menerjemahkan file mentah menjadi format JSON
    .then(data => {
        // L.geoJSON membaca koordinat patahan lempeng dan menggambarnya di peta
        const tectonicLines = L.geoJSON(data, {
            style: function() {
                return {
                    color: "red", 
                    weight: 2,        // Ketebalan garis lempeng
                    dashArray: "4",   // Mengubah garis solid menjadi putus-putus
                    opacity: 0.8      // Transparansi garis agar tidak terlalu mencolok
                };
            }
        });
        
        // Memasukkan hasil gambar garis lempeng ke dalam mika transparan (plateLayer)
        plateLayer.addLayer(tectonicLines);
    })
    .catch(err => console.error("Gagal memuat data lempeng tektonik:", err));


// ==========================================================================
// 7. LOAD VOLCANOES & UI REGISTRY (PETA GUNUNG API & FILTERING)
// ==========================================================================
fetch('data/volcanoes.geojson')
    .then(response => response.json())
    .then(data => {
        // Simpan salinan semua data gunung api ke dalam memori global untuk dianalisis nanti
        allVolcanoData = data.features;  

        // Membuat kustom ikon gambar untuk penanda (marker) gunung api
        const volcanoIcon = L.icon({
            iconUrl: 'volcano.png', 
            iconSize: [12, 12] 
        });

        const volcanoes = L.geoJSON(data, {
            // ==========================================
            // 1. BLOK FILTER (Otomasi Data Cleaning)
            // ==========================================
            // Fungsi ini mencegah browser memuat gunung api purba yang tidak relevan
            filter: function(feature) {
                const statusErupsi = feature.properties["Last Known Eruption"];
                
                // Jika data erupsi kosong, "Unknown", atau "Undefined", BUANG!
                if (!statusErupsi || statusErupsi === "Unknown" || statusErupsi === "Undefined") {
                    return false; // Jangan tampilkan di peta (menghemat RAM browser)
                }
                return true; // Tampilkan sisanya di peta
            },

            // ==========================================
            // 2. RENDER MARKER & DAFTARKAN KE REGISTRY
            // ==========================================
            pointToLayer: function(feature, latlng) {
                // Buat titik koordinat menggunakan ikon custom
                const marker = L.marker(latlng, { icon: volcanoIcon });
                
                const volName = feature.properties["Volcano Name"];
                
                // Jika gunung api punya nama, simpan penanda ini ke dalam "buku catatan"
                // Ini penting agar nanti sistem bisa langsung mencari marker ini untuk dianimasikan saat terjadi Swarm
                if (volName) {
                    volcanoMarkerRegistry[volName] = marker;
                }
                
                return marker;
            },
            
            // ==========================================
            // 3. RENDER POPUP DINAMIS (Muncul saat marker diklik)
            // ==========================================
            onEachFeature: function(feature, layer) {
                if (!feature.properties["Volcano Name"]) return;

                // bindPopup adalah kotak dialog interaktif dari Leaflet
                layer.bindPopup(function() {
                    const volName = feature.properties["Volcano Name"];
                    
                    // Cek di memori keranjang (activeSwarms) apakah gunung ini sedang berbahaya?
                    const swarmData = activeSwarms.find(v => v.name === volName);

                    // Jika YA (ada di keranjang activeSwarms), tambahkan HTML peringatan kotak merah
                    let warningHTML = "";
                    if (swarmData) {
                        warningHTML = `
                            <div style="background-color: #ffeaea; padding: 10px; border-left: 4px solid #FF0000; margin-bottom: 10px; border-radius: 4px;">
                                <strong style="color: #FF0000; font-size: 13px;">⚠️ POTENSI SWARM VULKANIK</strong><br>
                                <span style="font-size: 12px; color: #333;">Terdeteksi <b>${swarmData.totalQuakes} gempa dangkal</b> dalam 6 jam terakhir. Indikasi pergerakan magma / stress tektonik.</span>
                            </div>
                        `;
                    }

                    // Kembalikan susunan informasi lengkap (Nama, Negara, Tipe Erupsi, dll)
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

        // Masukkan semua marker gunung api yang lolos saringan ke mika khusus gunung api (volcanoLayer)
        volcanoLayer.addLayer(volcanoes);
    })
    .catch(err => console.error("Gagal memuat data gunung api:", err));

// ==========================================================================
// 8. DASHBOARD LOGIC (SMART ENGINE: SIDEBAR, KPI, & CHART)
// ==========================================================================

// --- FUNGSI UPDATE DAFTAR GEMPA (SIDEBAR KANAN) ---
// Fungsi ini merakit elemen <li> HTML baru untuk setiap gempa yang terlihat di layar
function updateList(features) {
    const listContainer = document.getElementById('quake-list');
    if (!listContainer) return; 

    // Bersihkan daftar lama sebelum memasukkan yang baru
    listContainer.innerHTML = ''; 

    // GUARD: Jika pengguna nge-zoom ke area yang tidak ada gempanya
    if (features.length === 0) {
        listContainer.innerHTML = `
            <li style="text-align: center; padding: 30px 10px; color: #7f8c8d;">
                <span style="font-size: 24px; display: block; margin-bottom: 10px;">✅</span>
                <i>Tidak ada gempa signifikan (M ≥ 3) di wilayah layar saat ini. Kondisi relatif aman.</i>
            </li>
        `;
        return; 
    }

    // Batasi list hanya menampilkan 15 gempa terbaru agar browser tidak berat saat di-scroll
    const recentQuakes = features.slice(0, 15);

    recentQuakes.forEach(feature => {
        const props = feature.properties;
        const coords = feature.geometry.coordinates;

        // Hitung umur gempa untuk narasi waktu di Sidebar
        const age = getEarthquakeAgeInHours(props.time);
        const timeStorySidebar = getRelativeTimeText(age);

        // Buat elemen list (<li>) baru di memori browser
        const li = document.createElement('li');
        li.style.cursor = "pointer"; // Ubah kursor jadi ikon tangan (bisa diklik)
        li.style.padding = "10px";
        li.style.borderBottom = "1px solid #eee";

        // Suntikkan struktur HTML ke dalam <li>
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

        // INTERAKSI KLIK: Jika list ini diklik, suruh peta terbang ke lokasi gempa tersebut
        li.onclick = function() {
            map.flyTo([coords[1], coords[0]], 10, { animate: true, duration: 1.5 });
        };

        // Tempelkan <li> yang sudah jadi ke dalam <ul> di halaman HTML
        listContainer.appendChild(li);
    });
}

// --- FUNGSI UPDATE ANGKA KPI (KOTAK ATAS) ---
// Fungsi ini menghitung ulang total, rata-rata, dan max magnitudo berdasarkan gempa di layar
function updateKPI(features) {
    const elTotal = document.getElementById('total-gempa');
    const elSig = document.getElementById('sig-gempa');
    const elMax = document.getElementById('max-gempa'); 
    const elAvg = document.getElementById('avg-gempa'); 

    if (elTotal) elTotal.innerText = features.length;

    if (elSig) {
        // Filter array untuk mencari gempa >= 5 SR
        const significant = features.filter(f => f.properties.mag >= 5.0).length;
        elSig.innerText = significant;
    }

    // Jika tidak ada gempa, reset angka menjadi strip (-)
    if (features.length === 0) {
        if (elMax) elMax.innerText = "-";
        if (elAvg) elAvg.innerText = "-";
        return;
    }

    if (elMax) {
        // Math.max mencari angka terbesar dari kumpulan data magnitudo
        const max = Math.max(...features.map(f => f.properties.mag));
        elMax.innerText = max.toFixed(2) + " SR";
    }

    if (elAvg) {
        // reduce() menjumlahkan seluruh magnitudo, lalu dibagi dengan total jumlah gempa
        const sumMag = features.reduce((total, f) => total + f.properties.mag, 0);
        const avgMag = sumMag / features.length;
        elAvg.innerText = avgMag.toFixed(2) + " SR";
    }
}

// --- FUNGSI UPDATE GRAFIK CHART.JS (Akan dibahas di Hari 7) ---
function updateChart(features) {
    const ctx = document.getElementById('magChart');
    if (!ctx) return; 

    let countKuat = 0;     // M >= 5.0 
    let countMenengah = 0; // M 4.0 - 4.9 
    let countLemah = 0;    // M < 4.0 

    features.forEach(f => {
        const mag = f.properties.mag;
        if (mag >= 5.0) countKuat++;
        else if (mag >= 4.0) countMenengah++;
        else countLemah++;
    });

    if (magChart !== null) {
        magChart.destroy();
    }

    magChart = new Chart(ctx, {
        type: 'bar', 
        data: {
            labels: ['Kuat (≥ 5.0)', 'Menengah (4.0-4.9)', 'Lemah (< 4.0)'],
            datasets: [{
                label: 'Jumlah Gempa',
                data: [countKuat, countMenengah, countLemah],
                backgroundColor: ['#D0021B', '#F5A623', '#4A90E2'],
                borderRadius: 4, 
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
            plugins: { legend: { display: false } },
            animation: { duration: 500 }
        }
    });
}

// --- FUNGSI OTAK UTAMA: SMART DASHBOARD ENGINE ---
function updateSmartDashboard() {
    // 1. Ambil batas koordinat kotak layar saat ini (Lensa Kamera)
    const bounds = map.getBounds();
    
    // 2. Saring seluruh data gempa, HANYA simpan gempa yang posisinya ada di dalam layar
    const visibleFeatures = allEarthquakeData.filter(eq => {
        const [lon, lat] = eq.geometry.coordinates;
        return bounds.contains([lat, lon]);
    });
  
    // 3. Kirim data yang sudah disaring ke KPI, List, dan Grafik untuk digambar ulang
    updateKPI(visibleFeatures);
    updateList(visibleFeatures);
    updateChart(visibleFeatures);
}

// --- SPATIAL REGION SELECTOR (Fitur Dropdown FlyTo - Akan dibahas Hari 7) ---
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
            const isMobile = window.innerWidth <= 900;
            let targetZoom = coords[2];
            
            if (isMobile) {
                targetZoom = (selectedRegion === 'global') ? 1 : targetZoom - 1; 
            }

            map.flyTo([coords[0], coords[1]], targetZoom, { animate: true, duration: 1.5 });
        }
    });
}

// ==========================================================================
// 9. MAP CONTROLS & EVENT LISTENERS (SAKELAR & KONTROL PETA)
// ==========================================================================

// Menyalakan ketiga mika transparan (Gempa, Gunung Api, Lempeng) ke atas peta secara default
plateLayer.addTo(map);
volcanoLayer.addTo(map);
earthquakeLayer.addTo(map);

// Membuat Legenda/Kotak Kontrol di pojok kanan atas agar user bisa mematikan/menyalakan layer
const overlayMaps = {
  "Gempa Magnitudo ≥ 3 (Realtime)": earthquakeLayer, 
  "Gunung Api Aktif": volcanoLayer,
  "Batas Lempeng Tektonik": plateLayer 
};

// Jika dibuka di HP, legenda otomatis terlipat (collapsed) agar tidak menutupi layar
let isMobileMode = window.innerWidth <= 900;
L.control.layers(null, overlayMaps, { collapsed: isMobileMode }).addTo(map);

// TRIGGER UTAMA: Jalankan fungsi Smart Dashboard setiap kali user Selesai Menggeser ('moveend') peta
map.on('moveend', updateSmartDashboard);

// ==========================================
// 10. APP INITIALIZATION & REAL-TIME ENGINE
// ==========================================

// Tarikan data pertama saat dashboard dimuat
loadEarthquakeData();

// Background Polling: Fetch otomatis setiap 60 detik
setInterval(function() {
    console.log("🔄 Background Polling: Mengambil data gempa terbaru dari USGS...");
    loadEarthquakeData();
}, 60000);

// ==========================================================================
// 11. FLOATING MAP LEGEND (LEGENDA PETA)
// ==========================================================================

// Membuat elemen kontrol Leaflet dan memposisikannya di pojok kanan bawah peta
const legend = L.control({ position: "bottomright" });

// Fungsi ini akan dijalankan saat legenda ditambahkan ke dalam peta
legend.onAdd = function (map) {
    // Membuat elemen <div> baru dengan class "info legend" (Terkoneksi ke file style.css)
    const div = L.DomUtil.create("div", "info legend");
    
    // --- STYLING KONTAINER LEGENDA (Inline CSS) ---
    div.style.backgroundColor = "white";
    div.style.padding = "10px 15px";
    div.style.borderRadius = "8px";
    div.style.boxShadow = "0 2px 5px rgba(0,0,0,0.15)";
    div.style.fontFamily = "sans-serif";
    div.style.color = "#333";

    // --- STRUKTUR HTML LEGENDA ---
    // Memasukkan teks dan palet warna ke dalam kotak legenda
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
                <span style="font-size: 12px;">Gunung Api Aktif</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="color: #e74c3c; font-weight: bold; letter-spacing: 2px;">----</span>
                <span style="font-size: 12px;">Batas Lempeng</span>
            </div>
        </div>
    `;
    return div;
};

// Eksekusi: Pasang legenda yang sudah dirakit ke atas peta
legend.addTo(map);

// ==========================================
// 12. UI UPDATERS (Volcano Swarm & Global Alarm)
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
// 13. STRESS TEST MODULE (Sakurajima Simulation)
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

