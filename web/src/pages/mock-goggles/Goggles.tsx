// MOCKUP (GG5), never merged: the control that picks kinds of transaction to keep lit in a grid.
import { createMemo, createSignal, For, onCleanup, onSettled, Show } from "solid-js";
import type { GridTx } from "../../components/txgrid/layout";
import { groupDigits } from "../../lib/format";
import {
  type FlaggedTx,
  formatShare,
  GROUPS,
  type Kind,
  KINDS,
  matches,
  type Mode,
  tally,
} from "./kinds";

const MEMORY = "goggles";

/** The picked kinds and how they combine, remembered for the visit (this tab). */
export function createGoggles(preset: { kinds?: string[]; mode?: Mode }) {
  let saved: { kinds?: unknown; mode?: unknown } = {};
  try {
    saved = JSON.parse(sessionStorage.getItem(MEMORY) ?? "{}") as typeof saved;
  } catch {
    // No storage (a private window): the pick lasts the page.
  }
  const keys = preset.kinds ?? (Array.isArray(saved.kinds) ? saved.kinds.map(String) : []);
  const [picked, setPicked] = createSignal<readonly Kind[]>(
    KINDS.filter((k) => keys.includes(k.key)),
  );
  const [mode, setModeSignal] = createSignal<Mode>(
    preset.mode ?? (saved.mode === "all" ? "all" : "any"),
  );
  const save = (kinds: readonly Kind[], m: Mode) => {
    try {
      sessionStorage.setItem(MEMORY, JSON.stringify({ kinds: kinds.map((k) => k.key), mode: m }));
    } catch {
      // As above.
    }
  };
  const setPick = (next: readonly Kind[]) => {
    setPicked(next);
    save(next, mode());
  };
  return {
    picked,
    mode,
    toggle: (k: Kind) =>
      setPick(picked().includes(k) ? picked().filter((p) => p !== k) : [...picked(), k]),
    setMode: (m: Mode) => {
      setModeSignal(m);
      save(picked(), m);
    },
    clear: () => setPick([]),
    /** For the grid: undefined (everything lit) until something is picked. */
    lit: createMemo(() => {
      const p = picked();
      const m = mode();
      return p.length === 0
        ? undefined
        : (tx: GridTx) => "flags" in tx && typeof tx.flags === "number" && matches(tx.flags, p, m);
    }),
  };
}
export type Goggles = ReturnType<typeof createGoggles>;

/** The result in one line: "312 of 4 198 · 7% of the block". */
export function resultLine(g: Goggles, txs: readonly FlaggedTx[]): string {
  const total = groupDigits(txs.length);
  if (g.picked().length === 0) return `${total} transactions`;
  const { count, share } = tally(txs, (f) => matches(f, g.picked(), g.mode()));
  return count === 0
    ? `None of ${total}`
    : `${groupDigits(count)} of ${total} · ${formatShare(share)} of the block`;
}

const Lens = () => (
  <svg class="gg__icon" viewBox="0 0 20 20" aria-hidden="true">
    <circle cx="6" cy="11" r="3.6" />
    <circle cx="14" cy="11" r="3.6" />
    <path d="M9.6 10.4q.4-.8.8 0M2.4 10.6 3.8 6M17.6 10.6 16.2 6" />
  </svg>
);
const Cross = () => (
  <svg class="gg__x" viewBox="0 0 12 12" aria-hidden="true">
    <path d="M3 3l6 6M9 3l-6 6" />
  </svg>
);

/**
 * "Highlight": a bar under the grid with the picked kinds, and the panel that picks them. The
 * panel is a sheet from the bottom on narrow screens, and docks beside the grid (`beside`) or
 * below the bar (`below`) on wide ones. `inline` is the alternative: the panel always open in place.
 */
export function GogglesControl(props: {
  goggles: Goggles;
  txs: readonly FlaggedTx[];
  dock: "beside" | "below" | "inline";
  /** What to bring into view above the sheet when it opens on a narrow screen. */
  frame?: () => HTMLElement | undefined;
  startOpen?: boolean;
  startMore?: boolean;
}) {
  const g = props.goggles;
  const inline = () => props.dock === "inline";
  const [open, setOpen] = createSignal(props.startOpen === true);
  const [more, setMore] = createSignal(props.startMore === true);
  let toggle: HTMLButtonElement | undefined;
  let panel: HTMLDivElement | undefined;

  // Shares of the block per kind, and which kinds would leave nothing lit in "all" mode.
  const shares = createMemo(
    () => new Map(KINDS.map((k) => [k, tally(props.txs, (f) => matches(f, [k], "any"))])),
  );
  const clashes = createMemo(() => {
    const p = g.picked();
    if (g.mode() !== "all" || p.length === 0) return new Set<Kind>();
    return new Set(
      KINDS.filter(
        (k) => !p.includes(k) && tally(props.txs, (f) => matches(f, [...p, k], "all")).count === 0,
      ),
    );
  });
  const result = () => resultLine(g, props.txs);

  const close = () => {
    setOpen(false);
    toggle?.focus();
  };
  const show = () => {
    setOpen(true);
    const sheet = matchMedia("(max-width: 64.99em)").matches;
    if (sheet) {
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      props.frame?.()?.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
    }
    queueMicrotask(() =>
      panel?.querySelector<HTMLElement>(".gg__chip")?.focus({ preventScroll: true }),
    );
  };
  onSettled(() => {
    if (props.startOpen === true) show();
  });
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && open() && !inline()) close();
  };
  document.addEventListener("keydown", onKey);
  onCleanup(() => document.removeEventListener("keydown", onKey));

  const chip = (k: Kind) => {
    const s = () => shares().get(k)?.share ?? 0;
    const none = () => (shares().get(k)?.count ?? 0) === 0;
    const on = () => g.picked().includes(k);
    const clash = () => clashes().has(k);
    return (
      <button
        type="button"
        class={["gg__chip", { "gg__chip--clash": clash(), "gg__chip--none": none() }]}
        aria-pressed={on() ? "true" : "false"}
        aria-disabled={none() && !on() ? "true" : undefined}
        style={{ "--share": String(s()) }}
        onClick={() => {
          if (!none() || on()) g.toggle(k);
        }}
      >
        <span class="gg__label">{k.label}</span>
        <span class="gg__share num">{formatShare(s())}</span>
        <span class="visually-hidden">
          {none()
            ? " of the block: none here"
            : clash()
              ? " of the block, none with the picked kinds"
              : " of the block"}
        </span>
      </button>
    );
  };
  const group = (name: (typeof GROUPS)[number]) => (
    <div class="gg__group" role="group" aria-label={name}>
      <Show when={name !== "Common"}>
        <span class="gg__group-name" aria-hidden="true">
          {name}
        </span>
      </Show>
      <div class="gg__chips">
        <For each={KINDS.filter((k) => k.group === name)}>{(k) => chip(k)}</For>
      </div>
    </div>
  );

  return (
    <div
      class={[
        "gg",
        `gg--${props.dock}`,
        { "gg--open": open() || inline(), "gg--on": g.picked().length > 0 },
      ]}
    >
      <div class="gg__bar">
        <Show when={!inline()}>
          <button
            ref={toggle}
            type="button"
            class="btn gg__toggle"
            aria-expanded={open() ? "true" : "false"}
            aria-controls="gg-panel"
            onClick={() => (open() ? close() : show())}
          >
            <Lens />
            Highlight
          </button>
        </Show>
        <Show when={g.picked().length > 0}>
          <ul class="gg__picked" aria-label="Highlighted kinds">
            <For each={g.picked()}>
              {(k, i) => (
                <li>
                  <Show when={i() > 0}>
                    <span class="gg__join">{g.mode() === "any" ? "or" : "and"}</span>
                  </Show>
                  <button
                    type="button"
                    class="gg__tag"
                    aria-label={`Stop highlighting ${k.label}`}
                    onClick={() => g.toggle(k)}
                  >
                    {k.label}
                    <Cross />
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>
        <p
          class={["gg__result num", { "gg__result--none": result().startsWith("None") }]}
          role="status"
        >
          <Show when={g.picked().length > 0}>{result()}</Show>
        </p>
      </div>
      <div
        ref={panel}
        id="gg-panel"
        class="gg__panel"
        role={inline() ? "group" : "dialog"}
        aria-label="Highlight transactions by kind"
      >
        <div class="gg__head">
          <span class="gg__now num" aria-hidden="true">
            {result()}
          </span>
          <Show when={g.picked().length > 0}>
            <div class="gg__mode" role="group" aria-label="Match">
              <button
                type="button"
                aria-pressed={g.mode() === "any" ? "true" : "false"}
                onClick={() => g.setMode("any")}
              >
                Any
              </button>
              <button
                type="button"
                aria-pressed={g.mode() === "all" ? "true" : "false"}
                onClick={() => g.setMode("all")}
              >
                All
              </button>
            </div>
            <button type="button" class="gg__clear" onClick={() => g.clear()}>
              Clear
            </button>
          </Show>
          <Show when={!inline()}>
            <button type="button" class="btn gg__done" onClick={close}>
              Done
            </button>
          </Show>
        </div>
        <div class="gg__body">
          {group("Common")}
          <Show
            when={more()}
            fallback={
              <button
                type="button"
                class="gg__more"
                aria-expanded="false"
                onClick={() => setMore(true)}
              >
                More kinds <span class="num">{KINDS.length - 5}</span>
              </button>
            }
          >
            <For each={GROUPS.slice(1)}>{(name) => group(name)}</For>
          </Show>
        </div>
      </div>
    </div>
  );
}
