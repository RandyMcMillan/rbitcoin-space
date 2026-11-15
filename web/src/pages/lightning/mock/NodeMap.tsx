// Mockup: a node's open channels as a treemap on canvas. Area is capacity; colour is chosen by a
// switch (age, fee out, fee in, state). The 500 largest (150 on a phone, so every cell can be
// tapped) are drawn one by one and the rest as one grouped cell, which opens the list of exactly
// those channels. One readout above the map says what is chosen; the channel list is the same data
// in accessible form.
import { useNavigate, useSearchParams } from "@solidjs/router";
import { createEffect, createMemo, createSignal, For, onSettled, Show } from "solid-js";
import { Link } from "../../../components/Link";
import { SectionHeader } from "../../../components/SectionHeader";
import { groupDigits } from "../../../lib/format";
import { onNetwork } from "../../../lib/network";
import { useNetwork } from "../../../lib/page";
import { cleanAlias, cut } from "../lightning";
import { summary } from "./fees";
import { days, mockPaths, sats, shortBtc, STATE_LABEL, StateTag, usePhone } from "./parts";
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

/** Cells drawn one by one on a wide screen and on a phone; the rest are one. */
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
  channel: OpenChannel | null;
  /** For the grouped cell: the channels in it. */
  rest: OpenChannel[] | null;
  value: number;
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

  const height = () => Math.round(Math.min(560, Math.max(300, width() * 0.56)));
  const capacity = () => props.node.channels.reduce((s, c) => s + c.capacity, 0);
  const items = createMemo(() => {
    const all = props.node.channels; // already largest first
    const list: Omit<Cell, "rect">[] = all
      .slice(0, cap())
      .map((c) => ({ channel: c, rest: null, value: c.capacity }));
    const rest = all.slice(cap());
    if (rest.length > 0) {
      const sum = rest.reduce((s, c) => s + c.capacity, 0);
      list.push({ channel: null, rest, value: sum });
      // Laid out by its true capacity, among the others.
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
  /** The keyboard's order: channels largest to smallest, then the grouped cell. */
  const order = createMemo(() => {
    const list = cells().map((c, i) => ({ c, i }));
    return [
      ...list.filter((x) => x.c.channel !== null).map((x) => x.i),
      ...list.filter((x) => x.c.channel === null).map((x) => x.i),
    ];
  });

  const token = (name: string) =>
    canvas ? getComputedStyle(canvas).getPropertyValue(name).trim() : "";
  const colourOf = (c: Cell): string => {
    if (!c.channel) return token("--color-surface-sunken");
    const ch = c.channel;
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
    const muted = token("--color-text-muted");
    const font = token("--font-sans") || "system-ui";
    const fit = (text: string, room: number) => {
      let t = text;
      while (t.length > 1 && ctx.measureText(t).width > room) t = `${t.slice(0, -2)}…`;
      return t;
    };
    for (const c of cells()) {
      const r = c.rect;
      if (r.w < 0.5 || r.h < 0.5) continue;
      ctx.fillStyle = colourOf(c);
      ctx.fillRect(r.x, r.y, r.w, r.h);
      // Disabled by the peer: hatched, so the two "off" states differ in shape, not colour alone.
      if (c.channel && colouring() === "state" && c.channel.state === "peer") hatch(ctx, r, panel);
      if (!c.channel) hatch(ctx, r, token("--color-line"));
      ctx.strokeStyle = panel;
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, Math.max(0, r.w - 1), Math.max(0, r.h - 1));
      // Every cell with room names its peer and capacity on a panel-coloured tab, which reads on
      // any fill.
      const lines = c.channel
        ? [cleanAlias(c.channel.peer.alias) ?? "No name", groupDigits(c.channel.capacity)]
        : [
            `${groupDigits(c.rest?.length ?? 0)} smaller channels`,
            `${shortBtc(c.value)}, ${Math.round((c.value / capacity()) * 100)}% of capacity`,
            "Choose to list them",
          ];
      const shown = r.h >= 16 * lines.length + 8 ? lines : r.h >= 24 ? lines.slice(0, 1) : [];
      if (r.w >= 52 && shown.length > 0) {
        ctx.font = `12px ${font}`;
        const texts = shown.map((t, k) => fit(k === 0 ? cut(t, 24).text : t, r.w - 14));
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
    if (!c) return;
    const href = c.channel
      ? mockPaths.channel(c.channel.id)
      : `${mockPaths.node(props.node.id)}?view=channels&smaller=${cap()}`;
    navigate(onNetwork(network(), href));
  };
  const describe = (c: Cell | undefined): string => {
    if (!c) return "Nothing chosen";
    if (!c.channel)
      return `${groupDigits(c.rest?.length ?? 0)} smaller channels together, ${shortBtc(c.value)}. ${breakdown(c.rest ?? [], colouring())}. Enter lists them.`;
    const ch = c.channel;
    return `${cleanAlias(ch.peer.alias) ?? "No name"}, ${sats(ch.capacity)}, ${groupDigits(days(MOCK_NOW - ch.opened))} days old, fee out ${ch.out ? `${groupDigits(ch.out.fee_rate)} ppm` : "none"}, fee in ${ch.in ? `${groupDigits(ch.in.fee_rate)} ppm` : "none"}, ${STATE_LABEL[ch.state].word}. Enter opens it.`;
  };
  const step = (from: number | null, by: number): number | null => {
    const o = order();
    if (o.length === 0) return null;
    const k = from === null ? -1 : o.indexOf(from);
    const next = from === null ? 0 : Math.max(0, Math.min(o.length - 1, k + by));
    return o[next] ?? null;
  };

  return (
    <section aria-labelledby="lnm-map-title">
      <SectionHeader title="Channel map" id="lnm-map-title">
        Area is capacity; each cell names its peer over its capacity in sats
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
        <Readout
          cell={at() === null ? undefined : cells()[at() ?? 0]}
          colouring={colouring()}
          total={capacity()}
        />
      </div>
      <div class="lnm-map" ref={frame}>
        <canvas
          ref={canvas}
          class="lnm-map__canvas"
          tabindex="0"
          role="slider"
          aria-label="Channel map. Arrow keys step from the largest channel to the smallest, then to the grouped smaller channels; Enter opens what is chosen."
          aria-valuemin={1}
          aria-valuemax={order().length}
          aria-valuenow={at() === null ? 0 : order().indexOf(at() ?? 0) + 1}
          aria-valuetext={describe(at() === null ? undefined : cells()[at() ?? 0])}
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
            // A mouse click opens what it points at, which the readout already shows; a finger's
            // first tap only reads it, its second opens it.
            if (pointer === "mouse" || (at() === k && pinned)) {
              open(k);
              return;
            }
            pinned = true;
            setAt(k);
          }}
          onKeyDown={(e) => {
            const cur = at();
            let next: number | null = cur;
            if (e.key === "ArrowRight" || e.key === "ArrowDown") next = step(cur, 1);
            else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = step(cur, -1);
            else if (e.key === "PageDown") next = step(cur, 10);
            else if (e.key === "PageUp") next = step(cur, -10);
            else if (e.key === "Home") next = order()[0] ?? null;
            else if (e.key === "End") next = order().at(-1) ?? null;
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
        <Show when={props.node.channels.length > cap()} fallback="Every open channel is drawn. ">
          The {groupDigits(cap())} largest channels are drawn one by one
          {phone() ? " (500 on a wider screen)" : ""}; the other{" "}
          {groupDigits(props.node.channels.length - cap())} share the hatched cell, sized by their
          total capacity.{" "}
        </Show>
        Point at a channel or tap it to read it; click it, tap it again, or press Enter to open it.
        The arrow keys step from the largest channel to the smallest. The{" "}
        <Link href={`${mockPaths.node(props.node.id)}?view=channels`}>channel list</Link> holds the
        same figures in a form every reader can use.
      </p>
    </section>
  );
}

/** What the grouped channels are, by the current colouring. */
function breakdown(rest: OpenChannel[], by: Colouring): string {
  if (by === "state") {
    return STATES.map((s) => [s, rest.filter((c) => c.state === s).length] as const)
      .filter(([, n]) => n > 0)
      .map(([s, n]) => `${groupDigits(n)} ${STATE_LABEL[s].word.toLowerCase()}`)
      .join(", ");
  }
  if (by === "age") {
    return AGE_BANDS.map(
      (b, i) =>
        [
          b.label,
          rest.filter((c) => ageBand((MOCK_NOW - c.opened) / 86_400) === i).length,
        ] as const,
    )
      .filter(([, n]) => n > 0)
      .map(([label, n]) => `${groupDigits(n)} ${label.toLowerCase()}`)
      .join(", ");
  }
  const s = summary(rest, by);
  const none = rest.filter((c) => (by === "out" ? c.out : c.in) === null).length;
  return s === null
    ? "no policy"
    : `fee ${by === "out" ? "out" : "in"} median ${groupDigits(s.median)} ppm, from ${groupDigits(s.lowest)} to ${groupDigits(s.highest)}${none > 0 ? `, ${groupDigits(none)} with no policy` : ""}`;
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

function Readout(props: { cell: Cell | undefined; colouring: Colouring; total: number }) {
  return (
    <Show
      when={props.cell}
      fallback={<span class="muted">Point at, tap or arrow to a channel to read it here.</span>}
    >
      {(c) => (
        <Show
          when={c().channel}
          fallback={
            <span class="lnm-readout__line">
              <strong class="num">{groupDigits(c().rest?.length ?? 0)} smaller channels</strong>
              <span class="num">
                {shortBtc(c().value)}, {Math.round((c().value / props.total) * 100)}% of capacity
              </span>
              <span>{breakdown(c().rest ?? [], props.colouring)}</span>
            </span>
          }
        >
          {(ch) => (
            <span class="lnm-readout__line">
              <strong>
                <bdi>{cut(cleanAlias(ch().peer.alias) ?? "No name", 32).text}</bdi>
              </strong>
              <span class="num">{ch().id}</span>
              <span class="num">{sats(ch().capacity)}</span>
              <span class="num">{groupDigits(days(MOCK_NOW - ch().opened))} days old</span>
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
