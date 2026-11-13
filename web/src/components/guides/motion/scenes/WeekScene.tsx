"use client";

import { useRef } from "react";
import type { WeekScene as Data } from "../sceneData";
import { SceneCar, SceneFrame, sceneMoney, useScene, useTimeline, type SceneProps } from "../sceneKit";
import { easeDrive } from "../sceneMath";

const MS = 3400;

/**
 * A week of renting, a day at a time: the car rolls along the road, each day
 * lights as it passes, and the figure is what that many days really cost
 * (the booking form's own pricing), ending on the week.
 */
export default function WeekScene({ scene: data, currency, locale }: SceneProps<Data>) {
  const scene = useScene();
  const root = useRef<HTMLDivElement>(null);
  const fmt = sceneMoney(currency, locale);
  const week = data.days[6];

  useTimeline(scene.run, MS, (t) => {
    const el = root.current;
    if (!el) return;
    const p = easeDrive(t);
    // A day is lit once the car is over it; all seven at the end.
    const lit = t >= 1 ? 7 : Math.min(7, Math.floor(p * 7 + 0.42));
    el.querySelectorAll<HTMLElement>(".sc-day").forEach((d, i) => d.toggleAttribute("data-on", i < lit));
    const cost = lit > 0 ? data.days[lit - 1] : 0;
    const figure = el.querySelector<HTMLElement>(".sc-week-figure");
    const span = el.querySelector<HTMLElement>(".sc-week-span");
    if (figure && cost != null) figure.textContent = fmt(cost);
    if (span) span.textContent = `${Math.max(1, lit)} ${lit <= 1 ? "day" : "days"}`;
    const track = el.querySelector<HTMLElement>(".sc-track");
    if (track) track.style.transform = `translateX(calc((100% - var(--sc-car-w)) * ${p.toFixed(4)}))`;
    // The body leans back as it pulls away and forward as it brakes.
    const car = el.querySelector<HTMLElement>(".sc-car");
    if (car) car.style.transform = `rotate(${(-1.5 * Math.sin(2 * Math.PI * t)).toFixed(2)}deg)`;
    const marks = el.querySelector<HTMLElement>(".sc-road-marks");
    if (marks) marks.style.transform = `translateX(${(-48 * p).toFixed(1)}px)`;
  });

  return (
    <SceneFrame kind="week" scene={scene} caption={data.caption}>
      <div className="sc-week" ref={root}>
        <div className="sc-days">
          {data.days.map((_, i) => (
            <span className="sc-day" data-on="" key={i}>
              <small>Day</small>
              {i + 1}
            </span>
          ))}
        </div>
        <p className="sc-week-read">
          <strong className="sc-week-figure sc-money">{week != null ? fmt(week) : ""}</strong>
          <span className="sc-week-span">7 days</span>
        </p>
        <div className="sc-road">
          <span className="sc-road-marks" style={{ transform: "translateX(-48px)" }} />
        </div>
        <div className="sc-track" style={{ transform: "translateX(calc(100% - var(--sc-car-w)))" }}>
          <SceneCar image={data.car.image} />
          <span className="sc-beam" />
        </div>
      </div>
    </SceneFrame>
  );
}
