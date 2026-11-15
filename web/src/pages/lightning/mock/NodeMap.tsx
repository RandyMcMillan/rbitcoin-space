// Mockup: a node's open channels as a treemap on canvas. Area is capacity; colour is chosen by a
// switch (age, fee out, fee in, state). The largest 500 (150 on a phone, so every cell can be
// tapped) fill the map; one line under it says what is drawn and links to the rest in the list.
import { useNavigate, useSearchParams } from "@solidjs/router";
import { createEffect, createMemo, createSignal, For, onSettled, Show } from "solid-js";
import { Link } from "../../../components/Link";
import { SectionHeader } from "../../../components/SectionHeader";
import { groupDigits } from "../../../lib/format";
import { onNetwork } from "../../../lib/network";
import { useNetwork } from "../../../lib/page";
import { cleanAlias, cut } from "../lightning";
import { days, mockPaths, sats, STATE_LABEL, StateTag, usePhone } from "./parts";
import { MOCK_NOW, type OpState, type OpenChannel, type SampleNode } from "./sample";
import {
  AGE_BANDS,
  AGE_MIX,
  ageBand,
  mix,
  PPM_LABELS,
  ppmBand,
  type Rect,
  squarify,
} from "./treemap";

/** Channels drawn on a wide screen and on a phone. */
export const MAP_CAP = 500;
export const MAP_CAP_PHONE = 150;

const COLOURINGS = [
  { id: "age", label: "Age" },
  { id: "out", label: "Fee out" },
  { id: "in", label: "Fee in" },
  { id: "state", label: "State" },
] as const;
type Colouring = (typeof COLOURINGS)[number]["id"];

interface Cell {
  channel: OpenChannel;
  rect: Rect;
}

// Enabled is the ordinary case and stays neutral; colour goes to the exceptions only.
const STATE_TOKEN: Record<OpState, string> = {
  active: "",
  here: "--lnm-caution",
  peer: "--lnm-caution",
  inactive: "--color-text-muted",
};
const STATES: OpState[] = ["active", "here", "peer", "inactive"];

export default function NodeMap(props: { node: SampleNode }) {
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const network = useNetwork();
  const phone = usePhone();
  const cap = () => (phone() ? MAP_CAP_PHONE : MAP_CAP);
  const colouring = (): Colouring => {
    const c = search["colour"];
    return COLOURINGS.find((x) => x.id === c)?.id ?? "age";
  };
  const [width, setWidth] = createSignal(0);
  const [at, setAt] = createSignal<number | null>(null);
  // Bumped when the theme changes, so the canvas reads the tokens again.
  const [theme, setTheme] = createSignal(0);
  let canvas: HTMLCanvasElement | undefined;
  let frame: HTMLDivElement | undefined;

  const full = () => Math.min(560, Math.max(300, width() * 0.56));
  // A handful of channels needs no full-height map: half, so the cells stay wide, not tall.
  const height = () => Math.round(drawn().length < 12 ? full() / 2 : full());
  const total = () => props.node.channels.reduce((s, c) => s + c.capacity, 0);
  // Already largest first.
  const drawn = createMemo(() => props.node.channels.slice(0, cap()));
  const drawnShare = () =>
    Math.round((drawn().reduce((s, c) => s + c.capacity, 0) / Math.max(1, total())) * 100);
  const cells = createMemo((): Cell[] => {
    const list = drawn();
    const rects = squarify(
      list.map((c) => c.capacity),
      width(),
      height(),
    );
    return list.map((channel, i) => ({
      channel,
      rect: rects[i] ?? { x: 0, y: 0, w: 0, h: 0 },
    }));
  });

  const token = (name: string) =>
    canvas ? getComputedStyle(canvas).getPropertyValue(name).trim() : "";
  const colourOf = (ch: OpenChannel): string => {
    const by = colouring();
    if (by === "state") {
      const t = STATE_TOKEN[ch.state];
      return t === "" ? mix(token("--color-text"), token("--color-surface"), 0.16) : token(t);
    }
    if (by === "age") {
      const band = ageBand((MOCK_NOW - ch.opened) / 86_400);
      return mix(token("--lnm-age"), token("--color-surface"), AGE_MIX[band] ?? 1);
    }
    const p = by === "out" ? ch.out : ch.in;
    return p ? token(`--lnm-ppm-${ppmBand(p.fee_rate) + 1}`) : token("--color-line");
  };

  const draw = () => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = width();
    const h = height();
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const panel = token("--color-surface");
    const textColour = token("--color-text");
    const muted = token("--color-text-muted");
    const seam = token("--color-line-strong");
    const font = token("--font-sans") || "system-ui";
    const fit = (text: string, room: number) => {
      let t = text;
      while (t.length > 1 && ctx.measureText(t).width > room) t = `${t.slice(0, -2)}…`;
      return t;
    };
    for (const c of cells()) {
      const r = c.rect;
      if (r.w < 0.5 || r.h < 0.5) continue;
      // A seam of --color-line-strong (3:1 on every panel) bounds every cell, so the palest age
      // step is still a cell.
      ctx.fillStyle = seam;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = colourOf(c.channel);
      ctx.fillRect(r.x + 1, r.y + 1, Math.max(0, r.w - 2), Math.max(0, r.h - 2));
      // Disabled by the peer: hatched, so the two "off" states differ in shape, not colour alone.
      if (colouring() === "state" && c.channel.state === "peer") hatch(ctx, r, panel);
      // A cell with room names its peer over its capacity, on a panel-coloured tab.
      const lines = [
        cleanAlias(c.channel.peer.alias) ?? "No name",
        groupDigits(c.channel.capacity),
      ];
      const shown = r.h >= 40 ? lines : r.h >= 24 ? lines.slice(0, 1) : [];
      if (r.w >= 52 && shown.length > 0) {
        ctx.font = `12px ${font}`;
        // A name may be cut; a figure that does not fit whole is left out, never cut.
        const texts = shown
          .map((t, k) => (k === 0 ? fit(cut(t, 24).text, r.w - 14) : t))
          .filter((t, k) => k === 0 || ctx.measureText(t).width <= r.w - 14);
        const tw = Math.max(...texts.map((t) => ctx.measureText(t).width));
        ctx.fillStyle = panel;
        ctx.fillRect(r.x + 3, r.y + 3, tw + 8, texts.length * 15 + 4);
        ctx.textBaseline = "middle";
        texts.forEach((t, k) => {
          ctx.fillStyle = k === 0 ? textColour : muted;
          ctx.fillText(t, r.x + 7, r.y + 11 + k * 15);
        });
      }
    }
    const i = at();
    const hit = i === null ? undefined : cells()[i];
    if (hit) {
      ctx.strokeStyle = textColour;
      ctx.lineWidth = 2;
      ctx.strokeRect(
        hit.rect.x + 1,
        hit.rect.y + 1,
        Math.max(0, hit.rect.w - 2),
        Math.max(0, hit.rect.h - 2),
      );
    }
  };

  createEffect(
    () => [cells(), colouring(), at(), theme()] as const,
    () => {
      draw();
    },
  );

  onSettled(() => {
    const observer = new ResizeObserver(() => setWidth(Math.floor(frame?.clientWidth ?? 0)));
    if (frame) {
      observer.observe(frame);
      setWidth(Math.floor(frame.clientWidth));
    }
    const themeWatch = new MutationObserver(() => setTheme((n) => n + 1));
    themeWatch.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onMedia = () => setTheme((n) => n + 1);
    media.addEventListener("change", onMedia);
    return () => {
      observer.disconnect();
      themeWatch.disconnect();
      media.removeEventListener("change", onMedia);
    };
  });

  const hitAt = (e: MouseEvent): number | null => {
    if (!canvas) return null;
    const box = canvas.getBoundingClientRect();
    const x = e.clientX - box.left;
    const y = e.clientY - box.top;
    const k = cells().findIndex(
      (c) => x >= c.rect.x && x < c.rect.x + c.rect.w && y >= c.rect.y && y < c.rect.y + c.rect.h,
    );
    return k === -1 ? null : k;
  };
  let pinned = false;
  let pointer = "mouse";
  const open = (i: number) => {
    const c = cells()[i];
    if (c) navigate(onNetwork(network(), mockPaths.channel(c.channel.id)));
  };
  const describe = (c: Cell | undefined): string => {
    if (!c) return "Nothing chosen";
    const ch = c.channel;
    return `${cleanAlias(ch.peer.alias) ?? "No name"}, ${sats(ch.capacity)}, ${groupDigits(days(MOCK_NOW - ch.opened))} days old, fee out ${ch.out ? `${groupDigits(ch.out.fee_rate)} ppm` : "none"}, fee in ${ch.in ? `${groupDigits(ch.in.fee_rate)} ppm` : "none"}, ${STATE_LABEL[ch.state].word}`;
  };
  const rest = () => props.node.channels.length - drawn().length;
  const restNotEnabled = () =>
    props.node.channels.slice(cap()).filter((c) => c.state !== "active").length;

  return (
    <section aria-labelledby="lnm-map-title">
      <SectionHeader title="Channel map" id="lnm-map-title">
        Area is capacity
      </SectionHeader>
      <div class="lnm-map-controls">
        <nav class="ln-picker" aria-label="Colour by">
          <ul>
            <For each={COLOURINGS}>
              {(c) => (
                <li>
                  <button
                    type="button"
                    class="ln-picker__item"
                    aria-pressed={colouring() === c.id ? "true" : "false"}
                    onClick={() =>
                      setSearch({ colour: c.id === "age" ? undefined : c.id }, { replace: true })
                    }
                  >
                    {c.label}
                  </button>
                </li>
              )}
            </For>
          </ul>
        </nav>
        <Key colouring={colouring()} />
      </div>
      <p class="lnm-mapnote">
        <Show
          when={rest() > 0}
          fallback={<>All {groupDigits(props.node.channels.length)} channels.</>}
        >
          <span class="num">
            {groupDigits(drawn().length)} largest of {groupDigits(props.node.channels.length)}{" "}
            channels, {drawnShare()}% of capacity.
          </span>{" "}
          <Link
            class="tap num"
            href={`${mockPaths.node(props.node.id)}?view=channels&smaller=${cap()}`}
          >
            List the other {groupDigits(rest())}
          </Link>
          <Show when={colouring() === "state" && restNotEnabled() > 0}>
            <span class="num"> ({groupDigits(restNotEnabled())} of them not enabled)</span>
          </Show>
          .
        </Show>
      </p>
      {/* The chosen channel, or the largest until one is chosen. */}
      <div class="lnm-readout" aria-hidden="true">
        <Readout channel={cells()[at() ?? 0]?.channel} />
      </div>
      {/* A list of channels, largest first, with the chosen one active; the canvas only draws it. */}
      <div
        class="lnm-map"
        ref={frame}
        tabindex="0"
        role="listbox"
        aria-label="Channels on the map, largest first"
        aria-describedby="lnm-map-keys"
        aria-activedescendant={at() === null ? undefined : "lnm-map-active"}
        onKeyDown={(e) => {
          const n = cells().length;
          const cur = at();
          let next: number | null = cur;
          if (e.key === "ArrowRight" || e.key === "ArrowDown")
            next = cur === null ? 0 : Math.min(n - 1, cur + 1);
          else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
            next = cur === null ? 0 : Math.max(0, cur - 1);
          else if (e.key === "PageDown") next = Math.min(n - 1, (cur ?? 0) + 10);
          else if (e.key === "PageUp") next = Math.max(0, (cur ?? 0) - 10);
          else if (e.key === "Home") next = 0;
          else if (e.key === "End") next = n - 1;
          else if (e.key === "Enter" && cur !== null) {
            open(cur);
            return;
          } else if (e.key === "Escape") next = null;
          else return;
          e.preventDefault();
          pinned = next !== null;
          setAt(next);
        }}
      >
        <span id="lnm-map-keys" class="visually-hidden">
          Arrow keys move between channels; Enter opens the one chosen.
        </span>
        <Show when={at() !== null}>
          <div
            id="lnm-map-active"
            class="visually-hidden"
            role="option"
            aria-selected="true"
            aria-setsize={cells().length}
            aria-posinset={(at() ?? 0) + 1}
          >
            {describe(cells()[at() ?? 0])}
          </div>
        </Show>
        <canvas
          ref={canvas}
          class="lnm-map__canvas"
          aria-hidden="true"
          style={{ "--map-h": `${height()}px` }}
          onPointerDown={(e) => {
            pointer = e.pointerType;
          }}
          onPointerMove={(e) => {
            if (e.pointerType === "mouse" && !pinned) setAt(hitAt(e));
          }}
          onPointerLeave={() => {
            if (!pinned) setAt(null);
          }}
          onClick={(e) => {
            const k = hitAt(e);
            if (k === null) return;
            // A mouse click opens what the readout shows; a finger's first tap reads, its second opens.
            if (pointer === "mouse" || (at() === k && pinned)) {
              open(k);
              return;
            }
            pinned = true;
            setAt(k);
          }}
        />
      </div>
    </section>
  );
}

/** Diagonal lines over a cell, in `colour`. */
function hatch(ctx: CanvasRenderingContext2D, r: Rect, colour: string) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  ctx.strokeStyle = colour;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  for (let d = -r.h; d < r.w; d += 6) {
    ctx.moveTo(r.x + d, r.y + r.h);
    ctx.lineTo(r.x + d + r.h, r.y);
  }
  ctx.stroke();
  ctx.restore();
}

function Readout(props: { channel: OpenChannel | undefined }) {
  return (
    <Show when={props.channel}>
      {(ch) => (
        <span class="lnm-readout__line">
          <strong>
            <bdi>{cut(cleanAlias(ch().peer.alias) ?? "No name", 32).text}</bdi>
          </strong>
          <span class="num">{sats(ch().capacity)}</span>
          <span class="num">{groupDigits(days(MOCK_NOW - ch().opened))} days</span>
          <span>
            Out{" "}
            <span class="num">
              {ch().out ? `${groupDigits(ch().out?.fee_rate ?? 0)} ppm` : "–"}
            </span>
          </span>
          <span>
            In{" "}
            <span class="num">{ch().in ? `${groupDigits(ch().in?.fee_rate ?? 0)} ppm` : "–"}</span>
          </span>
          <StateTag state={ch().state} />
        </span>
      )}
    </Show>
  );
}

/** The key for the current colouring: words beside every colour. */
function Key(props: { colouring: Colouring }) {
  return (
    <ul class="lnm-key" aria-label="Key">
      <Show when={props.colouring === "age"}>
        <For each={AGE_BANDS}>
          {(b, i) => (
            <li>
              <span class={`lnm-key__swatch lnm-age-${i() + 1}`} aria-hidden="true" />
              {b.label}
            </li>
          )}
        </For>
      </Show>
      <Show when={props.colouring === "out" || props.colouring === "in"}>
        <For each={PPM_LABELS}>
          {(label, i) => (
            <li>
              <span class={`lnm-key__swatch lnm-ppm-${i() + 1}`} aria-hidden="true" />
              <span class="num">{label}</span>
            </li>
          )}
        </For>
        <li class="lnm-key__unit">ppm</li>
        <li>
          <span class="lnm-key__swatch lnm-key__swatch--none" aria-hidden="true" />
          No policy
        </li>
      </Show>
      <Show when={props.colouring === "state"}>
        <For each={STATES}>
          {(s) => (
            <li>
              <span class={`lnm-key__swatch lnm-state-${s}`} aria-hidden="true" />
              <StateTag state={s} />
            </li>
          )}
        </For>
      </Show>
    </ul>
  );
}
