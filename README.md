# 🌍 Tectonic–Seismic–Volcanic Monitoring Dashboard

## 1. Project Overview
[cite_start]This project is an interactive Web GIS dashboard designed to monitor tectonic, seismic, and volcanic activity using open geoscience data [cite: 867-869]. [cite_start]The dashboard integrates real-time earthquake events, tectonic plate boundaries, and volcanic locations to visualize Earth system interactions in a single interactive map environment [cite: 870-872].

## 2. Dashboard Preview
![Dashboard Screenshot](dashboard-preview.png)

## 3. Objectives
The objectives of this project are:
* [cite_start]Visualize global earthquake activity in real-time[cite: 875].
* [cite_start]Provide tectonic context using global plate boundary data[cite: 876].
* [cite_start]Explore spatial relationships between earthquakes and volcanoes automatically[cite: 877].
* [cite_start]Demonstrate the integration of geoscience datasets in a Web GIS environment[cite: 878].

## 4. Data Sources
* [cite_start]**Earthquake Data:** USGS Earthquake API (Real-time GeoJSON) [cite: 880-881].
* [cite_start]**Tectonic Plate Boundaries:** Global Plate Boundary Dataset [cite: 882-883].
* [cite_start]**Volcano Data:** Global Volcanism Program - Holocene Volcanoes (Smithsonian Institution) [cite: 884-885].

## 5. Methodology & Features
[cite_start]The dashboard was developed primarily using Vanilla JavaScript and the Leaflet.js library[cite: 891]. 
Key features implemented include:
1. [cite_start]Dynamic styling of earthquake markers based on Magnitude rules [cite: 893-895].
2. [cite_start]**Smart Dashboard Engine:** UI indicators (Total Quakes, Max Mag, Avg Mag) automatically update based on the map's current bounding box (viewport) [cite: 897-904].
3. [cite_start]**Geological Storytelling Popup:** An automated interpretation engine that analyzes earthquake depth, magnitude, and spatial distance (< 50km) to the nearest active volcano to provide on-the-fly geoscience insights[cite: 900].

## 6. Earth System Insights
[cite_start]Analysis of the integrated datasets within this dashboard reveals several key geological patterns [cite: 908-909]:
* [cite_start]**Tectonic Alignment:** Earthquake clusters align closely with major tectonic plate boundaries (e.g., Ring of Fire)[cite: 910].
* [cite_start]**Volcanic Arcs:** Volcano distribution strongly follows subduction-related volcanic arcs[cite: 911].
* [cite_start]**Tectonic-Volcanic Interaction:** The system successfully flags moderate-to-strong earthquakes occurring near volcanic regions (< 50km), suggesting possible magmatic interactions [cite: 912-913].
* [cite_start]**Subduction Dynamics:** Intermediate and deep-focus earthquakes are accurately identified along subduction zones, reflecting descending slab processes [cite: 914-915].

## 7. Technologies Used
* [cite_start]HTML5 / CSS3 (CSS Grid & Flexbox) [cite: 921]
* [cite_start]JavaScript (ES6, Array Processing, Fetch API) [cite: 920]
* [cite_start]Leaflet.js (Web Mapping Library) [cite: 919]
* [cite_start]GeoJSON Data Handling [cite: 922]

## 8. Project Significance
[cite_start]This project demonstrates the integration of geospatial data, earth science interpretation, and interactive Web GIS development [cite: 932-934]. [cite_start]It highlights how multiple Earth system datasets can be combined to support geological monitoring and spatial analysis, bridging the gap between Data Engineering and Geoscience [cite: 935-936].