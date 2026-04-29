"use client";

import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";

type VisitStyle = {
  fillColor: string;
  fillOpacity: number;
  strokeColor: string;
  strokeOpacity: number;
  strokeWeight: number;
};

function getVisitStyle(count: number): VisitStyle {
  if (count <= 0) {
    return {
      fillColor: "#FBE4D6",
      fillOpacity: 0.08,
      strokeColor: "#261FB3",
      strokeOpacity: 0.12,
      strokeWeight: 1,
    };
  }

  const maxCountForColor = 10;
  const t = Math.min(count / maxCountForColor, 1);

  const start = { r: 38, g: 31, b: 179 }; // #261FB3
  const end = { r: 12, g: 9, b: 80 }; // #0C0950

  const r = Math.round(start.r + (end.r - start.r) * t);
  const g = Math.round(start.g + (end.g - start.g) * t);
  const b = Math.round(start.b + (end.b - start.b) * t);

  const color = `rgb(${r}, ${g}, ${b})`;

  return {
    fillColor: color,
    fillOpacity: 0.2 + t * 0.45,
    strokeColor: color,
    strokeOpacity: 0.25 + t * 0.45,
    strokeWeight: 1,
  };
}

export default function NaverMap() {
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const naver = (window as any).naver;
    if (!naver || !mapRef.current) return;

    const map = new naver.maps.Map(mapRef.current, {
      center: new naver.maps.LatLng(37.5665, 126.978),
      zoom: 11,
      disableDoubleClickZoom: true,
    });

    async function loadMap() {
      const visitCountMap = new Map<string, number>();

      const { data: visitedPlaces, error } = await supabase
        .from("visited_places")
        .select("dong_code, visit_count");

      if (error) {
        console.error("Failed to load visited places:", error);
      } else {
        visitedPlaces?.forEach((place) => {
          visitCountMap.set(place.dong_code, place.visit_count ?? 1);
        });
      }

      const res = await fetch("/geo/seoul-dong.json");
      const geojson = await res.json();

      geojson.features.forEach((feature: any) => {
        const dongCode = feature.properties.EMD_CD;
        const dongName = feature.properties.EMD_NM;
        const visitCount = visitCountMap.get(dongCode) ?? 0;
        const geometry = feature.geometry;

        if (geometry.type === "Polygon") {
          drawPolygon(geometry.coordinates, dongCode, dongName, visitCount);
        }

        if (geometry.type === "MultiPolygon") {
          geometry.coordinates.forEach((polygonCoords: any) => {
            drawPolygon(polygonCoords, dongCode, dongName, visitCount);
          });
        }
      });
    }

    function drawPolygon(
      coords: any,
      dongCode: string,
      dongName: string,
      initialVisitCount: number
    ) {
      let currentVisitCount = initialVisitCount;

      const paths = coords[0].map(
        ([lng, lat]: number[]) => new naver.maps.LatLng(lat, lng)
      );

      const polygon = new naver.maps.Polygon({
        map,
        paths,
        clickable: true,
        zIndex: currentVisitCount > 0 ? 100 : 10,
        ...getVisitStyle(currentVisitCount),
      });

      naver.maps.Event.addListener(polygon, "click", async () => {
        const nextVisitCount = currentVisitCount + 1;

        const { error } = await supabase.from("visited_places").upsert(
          {
            dong_code: dongCode,
            dong_name: dongName,
            visit_count: nextVisitCount,
          },
          {
            onConflict: "dong_code",
          }
        );

        if (error) {
          console.error("Save failed:", error);
          alert("저장 실패: 콘솔을 확인하세요.");
          return;
        }

        currentVisitCount = nextVisitCount;

        polygon.setOptions({
          ...getVisitStyle(currentVisitCount),
          zIndex: 100,
        });

        alert(`${dongName} 방문 ${currentVisitCount}회 저장 완료`);
      });
    }

    loadMap();
  }, []);

  return <div ref={mapRef} style={{ width: "100%", height: "100vh" }} />;
}