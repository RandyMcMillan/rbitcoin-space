// Mockup: a node's open channels as a treemap on canvas. Area is capacity; colour is chosen by a
// switch (age, fee out, fee in, state). The 500 largest are drawn one by one and the rest as one
// cell, so the drawing stays bounded whatever the node. One readout above the map says what is under
// the pointer, finger or keyboard; the channel list is the same data in accessible form.
import { useNavigate, useSearchParams } from "@solidjs/router";
import { createEffect, createMemo, createSignal, For, onSettled, Show } from "solid-js";
import { Amount } from "../../../components/Amount";
import { Link } from "../../../components/Link";
import { SectionHeader } from "../../../components/SectionHeader";
import { formatBtc, groupDigits } from "../../../lib/format";
import { onNetwork } from "../../../lib/network";
import { useNetwork } from "../../../lib/page";
import { cleanAlias, cut } from "../lightning";
import { duration, mockPaths, STATE_LABEL, StateTag } from "./parts";
import { MOCK_NOW, type OpState, type OpenChannel, type SampleNode } from "./sample";
import {
  AGE_BANDS,
  AGE_MIX,
  ageBand,
  mix,
  PPM_BANDS,
  ppmBand,
  type Rect,
  squarify,
} from "./treemap";

/** Cells drawn one by one; the rest are one. */
export const MAP_CAP = 500;

const COLOURINGS = [
  { id: "age", label: "Age" },
  { id: "out", label: "Fee out" },
  { id: "in", label: "Fee in" },
  { id: "state", label: "State" },
] as const;
type Colouring = (typeof COLOURINGS)[number]["id"];

interface Cell {
  channel: OpenChannel | null;
  /** For the grouped cell: how many channels, and their capacity. */
  rest: { count: number; capacity: number } | null;
  value: number;
  rect: Rect;
}

const STATE_TOKEN: Record<OpState, string> = {
  active: "--color-positive",
  here: "--color-caution",
  peer: "--color-caution",
  inactive: "--color-line-strong",
};

export default function NodeMap(props: { node: SampleNode }) {
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const network = useNetwork();
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

  const height = () => Math.round(Math.min(560, Math.max(280, width() * 0.56)));
  const items = createMemo(() => {
    const sorted = props.node.channels; // already largest first
    const shown = sorted.slice(0, MAP_CAP);
    const rest = sorted.slice(MAP_CAP);
    const list: Omit<Cell, "rect">[] = shown.map((c) => ({
      channel: c,
      rest: null,
      value: c.capacity,
    }));
    if (rest.length > 0) {
      const capacity = rest.reduce((s, c) => s + c.capacity, 0);
      list.push({ channel: null, rest: { count: rest.length, capacity }, value: capacity });
      list.sort((a, b) => b.value - a.value);
    }
    return list;
  });
  const cells = createMemo((): Cell[] => {
    const list = items();
    const rects = squarify(
      list.map((c) => c.value),
      width(),
      height(),
    );
    return list.map((c, i) => ({
      channel: c.channel,
      rest: c.rest,
      value: c.value,
      rect: rects[i] ?? { x: 0, y: 0, w: 0, h: 0 },
    }));
  });

  const token = (name: string) =>
    canvas ? getComputedStyle(canvas).getPropertyValue(name).trim() : "";
  const colourOf = (c: Cell): string => {
    if (!c.channel) return token("--color-surface-sunken");
    const ch = c.channel;
    const by = colouring();
    if (by === "state") return token(STATE_TOKEN[ch.state]);
    if (by === "age") {
      const band = ageBand((MOCK_NOW - ch.opened) / 86_400);
      return mix(token("--color-text"), token("--series-2"), AGE_MIX[band] ?? 0);
    }
    const p = by === "out" ? ch.out : ch.in;
    return p ? token(`--fee-${ppmBand(p.fee_rate) + 1}`) : token("--color-line");
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
    const font = token("--font-sans") || "system-ui";
    for (const c of cells()) {
      const r = c.rect;
      if (r.w < 0.5 || r.h < 0.5) continue;
      ctx.fillStyle = colourOf(c);
      ctx.fillRect(r.x, r.y, r.w, r.h);
      // Disabled by the peer: the caution colour, hatched, so the two "off" states differ in shape.
      if (c.channel && colouring() === "state" && c.channel.state === "peer") hatch(ctx, r, panel);
      if (!c.channel) hatch(ctx, r, token("--color-line-strong"));
      // The seam of the panel between cells.
      ctx.strokeStyle = panel;
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, Math.max(0, r.w - 1), Math.max(0, r.h - 1));
      // A big cell names its peer on a panel-coloured tab, so the name reads on any fill.
      if (r.w > 96 && r.h > 34) {
        const label = c.channel
          ? cut(cleanAlias(c.channel.peer.alias) ?? "No name", 18).text
          : `${groupDigits(c.rest?.count ?? 0)} smaller channels`;
        ctx.font = `12px ${font}`;
        // Cut to fit with an ellipsis, never squeezed.
        let text = label;
        const room = r.w - 16;
        while (text.length > 1 && ctx.measureText(text).width > room)
          text = `${text.slice(0, -2)}…`;
        const tw = ctx.measureText(text).width;
        ctx.fillStyle = panel;
        ctx.fillRect(r.x + 4, r.y + 4, tw + 8, 18);
        ctx.fillStyle = textColour;
        ctx.textBaseline = "middle";
        ctx.fillText(text, r.x + 8, r.y + 13);
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
  const open = (i: number) => {
    const c = cells()[i];
    if (c?.channel) navigate(onNetwork(network(), mockPaths.channel(c.channel.id)));
  };
  const describe = (c: Cell | undefined): string => {
    if (!c) return "No channel chosen";
    if (!c.channel)
      return `${groupDigits(c.rest?.count ?? 0)} smaller channels together, ${formatBtc(c.rest?.capacity ?? 0)} BTC`;
    const ch = c.channel;
    return `${cleanAlias(ch.peer.alias) ?? "No name"}, ${formatBtc(ch.capacity)} BTC, ${duration(MOCK_NOW - ch.opened)} old, fee out ${ch.out ? `${groupDigits(ch.out.fee_rate)} ppm` : "none"}, fee in ${ch.in ? `${groupDigits(ch.in.fee_rate)} ppm` : "none"}, ${STATE_LABEL[ch.state].word}`;
  };

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
      <div class="lnm-readout" aria-hidden="true">
        <Readout cell={at() === null ? undefined : cells()[at() ?? 0]} node={props.node} />
      </div>
      <div class="lnm-map" ref={frame}>
        <canvas
          ref={canvas}
          class="lnm-map__canvas"
          tabindex="0"
          role="slider"
          aria-label="Channel map: arrow keys move from the largest channel to the smallest, Enter opens it"
          aria-valuemin={1}
          aria-valuemax={cells().length}
          aria-valuenow={(at() ?? 0) + 1}
          aria-valuetext={describe(at() === null ? undefined : cells()[at() ?? 0])}
          style={{ "--map-h": `${height()}px` }}
          onPointerMove={(e) => {
            if (e.pointerType === "mouse" && !pinned) setAt(hitAt(e));
          }}
          onPointerLeave={() => {
            if (!pinned) setAt(null);
          }}
          onClick={(e) => {
            const k = hitAt(e);
            if (k === null) return;
            // A second press on the same cell opens it; the first only reads it.
            if (at() === k && pinned) open(k);
            pinned = true;
            setAt(k);
          }}
          onKeyDown={(e) => {
            const n = cells().length;
            const cur = at();
            let next: number | null = cur;
            if (e.key === "ArrowRight" || e.key === "ArrowDown")
              next = cur === null ? 0 : Math.min(n - 1, cur + 1);
            else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
              next = cur === null ? 0 : Math.max(0, cur - 1);
            else if (e.key === "Home") next = 0;
            else if (e.key === "End") next = n - 1;
            else if (e.key === "PageDown") next = Math.min(n - 1, (cur ?? 0) + 10);
            else if (e.key === "PageUp") next = Math.max(0, (cur ?? 0) - 10);
            else if (e.key === "Enter" && cur !== null) {
              open(cur);
              return;
            } else if (e.key === "Escape") next = null;
            else return;
            e.preventDefault();
            pinned = next !== null;
            setAt(next);
          }}
        />
      </div>
      <p class="ln-aside">
        <Show when={props.node.channels.length > MAP_CAP} fallback="Every open channel is drawn.">
          The {groupDigits(MAP_CAP)} largest channels are drawn one by one; the other{" "}
          {groupDigits(props.node.channels.length - MAP_CAP)} share the hatched cell.
        </Show>{" "}
        The <Link href={`${mockPaths.node(props.node.id)}?view=channels`}>channel list</Link> holds
        the same figures in a form every reader and screen reader can use.
      </p>
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

function Readout(props: { cell: Cell | undefined; node: SampleNode }) {
  return (
    <Show
      when={props.cell}
      fallback={
        <span class="muted">
          Point at a channel, tap it, or focus the map and use the arrow keys. A second tap or Enter
          opens it.
        </span>
      }
    >
      {(c) => (
        <Show
          when={c().channel}
          fallback={
            <span>
              <strong class="num">{groupDigits(c().rest?.count ?? 0)}</strong> smaller channels
              together, <Amount sats={c().rest?.capacity ?? 0} short />. They are in the channel
              list.
            </span>
          }
        >
          {(ch) => (
            <span class="lnm-readout__line">
              <strong>
                <bdi>{cut(cleanAlias(ch().peer.alias) ?? "No name", 32).text}</bdi>
              </strong>
              <span class="num">{ch().id}</span>
              <Amount sats={ch().capacity} short />
              <span>{duration(MOCK_NOW - ch().opened)} old</span>
              <span>
                Out{" "}
                <span class="num">
                  {ch().out ? `${groupDigits(ch().out?.fee_rate ?? 0)} ppm` : "–"}
                </span>
              </span>
              <span>
                In{" "}
                <span class="num">
                  {ch().in ? `${groupDigits(ch().in?.fee_rate ?? 0)} ppm` : "–"}
                </span>
              </span>
              <StateTag state={ch().state} />
            </span>
          )}
        </Show>
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
        <For each={PPM_BANDS}>
          {(b, i) => (
            <li>
              <span class={`lnm-key__swatch lnm-fee-${i() + 1}`} aria-hidden="true" />
              <span class="num">
                {groupDigits(b)}
                {i() === PPM_BANDS.length - 1 ? "+" : ""}
              </span>
            </li>
          )}
        </For>
        <li class="lnm-key__unit">ppm and up</li>
        <li>
          <span class="lnm-key__swatch lnm-key__swatch--none" aria-hidden="true" />
          No policy
        </li>
      </Show>
      <Show when={props.colouring === "state"}>
        <For each={["active", "here", "peer", "inactive"] as const}>
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
