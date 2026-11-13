"use client";

import { useEffect } from "react";
import { motionOK } from "./sceneKit";
import { nearestToCenter, tilt } from "./sceneMath";

/**
 * How the guides' cards move on the index.
 *
 * With a mouse: a card leans a few degrees toward the pointer, and its
 * preview (a small moving sketch of the guide's scene, drawn by GuideCards)
 * plays while the pointer or the keyboard is on it. That part is plain CSS.
 *
 * On a touch screen there is no hover, so the card nearest the middle of the
 * screen plays its preview, one card at a time. A preview runs twice and
 * stops; it never loops on.
 *
 * Draws nothing: it listens on the lists the server drew. With reduced
 * motion it does nothing at all.
 */
export function CardMotion() {
  useEffect(() => {
    if (!motionOK()) return;
    const lists = [...document.querySelectorAll<HTMLElement>(".gd-page .gd-cards")];
    if (lists.length === 0) return;
    const undo: (() => void)[] = [];

    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      let raf = 0;
      let last: { card: HTMLElement; x: number; y: number } | null = null;
      const lean = () => {
        raf = 0;
        if (!last) return;
        const box = last.card.getBoundingClientRect();
        const { rx, ry } = tilt(last.x - box.left, last.y - box.top, box.width, box.height);
        last.card.style.setProperty("--rx", String(rx));
        last.card.style.setProperty("--ry", String(ry));
      };
      const move = (e: PointerEvent) => {
        const card = e.target instanceof Element ? e.target.closest<HTMLElement>(".gd-card") : null;
        if (!card) return;
        last = { card, x: e.clientX, y: e.clientY };
        if (!raf) raf = requestAnimationFrame(lean);
      };
      const leave = (e: PointerEvent) => {
        const card = e.target instanceof Element ? e.target.closest<HTMLElement>(".gd-card") : null;
        if (!card || (e.relatedTarget instanceof Node && card.contains(e.relatedTarget))) return;
        if (last?.card === card) last = null;
        card.style.removeProperty("--rx");
        card.style.removeProperty("--ry");
      };
      for (const list of lists) {
        list.addEventListener("pointermove", move);
        list.addEventListener("pointerout", leave);
        undo.push(() => {
          list.removeEventListener("pointermove", move);
          list.removeEventListener("pointerout", leave);
        });
      }
      undo.push(() => cancelAnimationFrame(raf));
    } else {
      const cards = lists.flatMap((l) => [...l.querySelectorAll<HTMLElement>(".gd-card")]);
      let raf = 0;
      let live: HTMLElement | null = null;
      const choose = () => {
        raf = 0;
        const i = nearestToCenter(
          cards.map((c) => c.getBoundingClientRect()),
          window.innerHeight,
        );
        const next = i >= 0 ? cards[i] : null;
        if (next === live) return;
        live?.removeAttribute("data-live");
        next?.setAttribute("data-live", "");
        live = next;
      };
      const ask = () => {
        if (!raf) raf = requestAnimationFrame(choose);
      };
      choose();
      window.addEventListener("scroll", ask, { passive: true });
      window.addEventListener("resize", ask, { passive: true });
      undo.push(() => {
        cancelAnimationFrame(raf);
        window.removeEventListener("scroll", ask);
        window.removeEventListener("resize", ask);
        live?.removeAttribute("data-live");
      });
    }

    return () => undo.forEach((f) => f());
  }, []);

  return null;
}
