"use client";

import { useRef, useState } from "react";
import type { MapScene as Data } from "../sceneData";
import { SceneCar, SceneFrame, useScene, useSceneSignal, useTimeline, type SceneProps } from "../sceneKit";
import { easeDrive, route, routeDots, routePoint, tripMs } from "../sceneMath";

/**
 * The trips as a map: every destination where it lies from Greensboro (north
 * up), the route to the chosen one drawn dot by dot, and a car (a real one
 * from the rental fleet) driving it while the miles count to the road
 * distance. A longer trip takes longer to watch.
 *
 * The line is a drawing of the direction, not the road itself; the miles are
 * the routed road miles the tool shows.
 */
export default function MapScene({ scene: data, locale }: SceneProps<Data>) {
  const scene = useScene();
  const [picked, setPicked] = useState<{ id: string; n: number }>({ id: data.start, n: 0 });
  useSceneSignal("road-trip", (s) => {
    const id = s.place;
    if (id) setPicked((p) => (p.id === id ? p : { id, n: p.n + 1 }));
  });
  const root = useRef<HTMLDivElement>(null);
  const num = (n: number) => new Intl.NumberFormat(locale).format(n);

  const place = data.places.find((p) => p.id === picked.id) ?? data.places[0];
  const line = route(data.home, place.at);
  const dots = routeDots(line, place.miles);

  useTimeline(scene.run ? scene.run * 100 + picked.n : 0, tripMs(place.miles), (t) => {
    const el = root.current;
    if (!el) return;
    const p = easeDrive(t);
    const lit = Math.round(p * (dots.length - 1));
    el.querySelectorAll<HTMLElement>(".sc-map-dot").forEach((d, i) => d.toggleAttribute("data-on", i <= lit));
    const at = routePoint(line, p);
    const mark = el.querySelector<HTMLElement>(".sc-map-mark");
    if (mark) mark.style.transform = `translate(${at.x.toFixed(2)}%, ${at.y.toFixed(2)}%)`;
    // The readout sits beside the map, in the same stage.
    const miles = el.parentElement?.querySelector<HTMLElement>(".sc-map-miles");
    if (miles) miles.textContent = num(t >= 1 ? place.miles : Math.round(place.miles * p));
  });

  return (
    <SceneFrame kind="map" scene={scene} caption={data.caption}>
      <div className="sc-map" ref={root}>
        <span className="sc-map-north">N</span>
        {data.places.map((p) => (
          <span
            className="sc-map-place"
            key={p.id}
            data-on={p.id === place.id || undefined}
            style={{ left: `${p.at.x}%`, top: `${p.at.y}%` }}
          />
        ))}
        {dots.map((d, i) => (
          <span className="sc-map-dot" data-on="" key={`${place.id}-${i}`} style={{ left: `${d.x}%`, top: `${d.y}%` }} />
        ))}
        <span className="sc-map-home" style={{ left: `${data.home.x}%`, top: `${data.home.y}%` }}>
          <em>Greensboro</em>
        </span>
        <span className="sc-map-mark" key={place.id} style={{ transform: `translate(${place.at.x}%, ${place.at.y}%)` }}>
          {data.car ? <SceneCar image={data.car.image} sizes="96px" /> : <span className="sc-map-pin" />}
        </span>
      </div>
      <p className="sc-map-read">
        <span>{place.name}</span>
        <strong>
          about <span className="sc-map-miles">{num(place.miles)}</span> mi
        </strong>
      </p>
    </SceneFrame>
  );
}
