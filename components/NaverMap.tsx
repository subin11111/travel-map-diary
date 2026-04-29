"use client";

import { useEffect, useRef } from "react";

export default function NaverMap() {
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const naver = (window as any).naver;
    if (!naver || !mapRef.current) return;

    const map = new naver.maps.Map(mapRef.current, {
      center: new naver.maps.LatLng(37.5665, 126.9780),
      zoom: 12,
    });

    // 🔥 GeoJSON 불러오기
    fetch("/geo/seoul.json")
      .then((res) => res.json())
      .then((geojson) => {
        geojson.features.forEach((feature: any) => {
          const coords = feature.geometry.coordinates[0].map(
            ([lng, lat]: number[]) => new naver.maps.LatLng(lat, lng)
          );

          const polygon = new naver.maps.Polygon({
            map,
            paths: coords,
            fillColor: "#00FF00",
            fillOpacity: 0.4,
            strokeColor: "#00FF00",
            strokeWeight: 2,
          });

          naver.maps.Event.addListener(polygon, "click", () => {
            alert(feature.properties.name);
          });
        });
      });
  }, []);

  return <div ref={mapRef} style={{ width: "100%", height: "100vh" }} />;
}