// Pieces every Lightning mockup shares: the frame with its "Mockup, sample data" marker, the
// mockups' own way around, words with icons for states and close kinds, and links that stay
// inside the mockups.
import { useLocation } from "@solidjs/router";
import { For, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import { Link } from "../../../components/Link";
import {
  formatRelative,
  formatUtc,
  groupDigits,
  isoTime,
  truncateMiddle,
} from "../../../lib/format";
import type { CloseKind } from "../lightning";
import { Alias } from "../parts";
import { MOCK_NOW, type OpState, type Peer, SMALL_KEY } from "./sample";
import "./Mock.css";

const ACINQ_KEY = "03864ef025fde8fb587d989186ce6a4a186895ee44a926bfc370e2c366597a3f8f";

export const mockPaths = {
  overview: () => "/mock/lightning",
  node: (key: string) => `/mock/lightning/node/${encodeURIComponent(key)}`,
  channel: (id: string) => `/mock/lightning/channel/${encodeURIComponent(id)}`,
  block: () => "/mock/lightning/block",
  penalties: () => "/mock/lightning/penalties",
};

const MOCK_LINKS = [
  { href: mockPaths.overview(), label: "Overview" },
  { href: mockPaths.node(ACINQ_KEY), label: "Large node" },
  { href: mockPaths.node(SMALL_KEY), label: "Small node" },
  { href: mockPaths.channel("811984x2037x0"), label: "Open channel" },
  { href: mockPaths.channel("958844x904x1"), label: "Penalty" },
  { href: mockPaths.channel("948730x2215x0"), label: "Splice" },
  { href: mockPaths.block(), label: "Block panel" },
];

/** A mockup page: the mockups' links, the quiet marker that says it is one, then the page. */
export function MockFrame(props: { children: JSX.Element }) {
  const location = useLocation();
  return (
    <div class="wrap ln lnm">
      <nav class="ln-nav lnm-nav" aria-label="Mockups">
        <For each={MOCK_LINKS}>
          {(l) => (
            <Link
              class="ln-nav__item"
              href={l.href}
              aria-current={location.pathname === l.href ? "page" : "false"}
            >
              {l.label}
            </Link>
          )}
        </For>
        <span class="lnm-marker">Mockup, sample data</span>
      </nav>
      {props.children}
    </div>
  );
}

/** Relative time against the moment the samples were taken, so they read the same every day. */
export function Ago(props: { time: number; suffix?: boolean }) {
  return (
    <time class="num" datetime={isoTime(props.time)} title={formatUtc(props.time)}>
      {formatRelative(props.time, MOCK_NOW, { suffix: props.suffix !== false })}
    </time>
  );
}

/** A span of time in its largest unit: `3 y 2 m`, `5 months`, `12 days`, `4 h`. */
export function duration(seconds: number): string {
  const d = seconds / 86_400;
  if (d >= 365) {
    const y = Math.floor(d / 365);
    const m = Math.floor((d - y * 365) / 30.44);
    return m > 0 ? `${y} y ${m} mo` : `${y} y`;
  }
  if (d >= 61) return `${Math.floor(d / 30.44)} months`;
  if (d >= 2) return `${Math.floor(d)} days`;
  return `${Math.max(1, Math.round(seconds / 3600))} h`;
}

/** `1st`, `2nd`, `3rd`, `4 812th`. */
export function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${groupDigits(n)}${suffix}`;
}

export type IconName =
  | "plus"
  | "check"
  | "pause"
  | "pauseDashed"
  | "off"
  | "swap"
  | "warn"
  | "cross"
  | "branch";

/** A 14 px drawn icon in the text's colour; always beside a word that says the same. */
export function Icon(props: { name: IconName }) {
  return (
    <svg class="lnm-icon" viewBox="0 0 16 16" aria-hidden="true">
      {ICONS[props.name]()}
    </svg>
  );
}

// Functions, not elements: one element can sit in one place only.
const ICONS: Record<IconName, () => JSX.Element> = {
  plus: () => (
    <>
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 5v6M5 8h6" />
    </>
  ),
  check: () => (
    <>
      <circle cx="8" cy="8" r="6.5" />
      <path d="M5 8.2l2 2 4-4.4" />
    </>
  ),
  pause: () => (
    <>
      <circle cx="8" cy="8" r="6.5" />
      <path d="M6.5 5.5v5M9.5 5.5v5" />
    </>
  ),
  pauseDashed: () => (
    <>
      <circle cx="8" cy="8" r="6.5" stroke-dasharray="2.6 1.8" />
      <path d="M6.5 5.5v5M9.5 5.5v5" />
    </>
  ),
  off: () => (
    <>
      <circle cx="8" cy="8" r="6.5" />
      <path d="M3.5 12.5l9-9" />
    </>
  ),
  swap: () => <path d="M2.5 5.5h10l-2.5-2.5M13.5 10.5h-10l2.5 2.5" />,
  warn: () => (
    <>
      <path d="M8 1.8l6.6 12H1.4z" />
      <path d="M8 6.5v3.2M8 11.6v.2" />
    </>
  ),
  cross: () => (
    <>
      <circle cx="8" cy="8" r="6.5" />
      <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" />
    </>
  ),
  branch: () => <path d="M3 3v4.5c0 2 1.5 3 3.5 3H13M10.5 8l2.5 2.5-2.5 2.5M3 13v-1" />,
};

export const STATE_LABEL: Record<
  OpState,
  { word: string; short: string; icon: IconName; tone: string }
> = {
  active: { word: "Active", short: "Active", icon: "check", tone: "positive" },
  here: { word: "Disabled by this node", short: "Off here", icon: "pause", tone: "caution" },
  peer: {
    word: "Disabled by the peer",
    short: "Off at peer",
    icon: "pauseDashed",
    tone: "caution",
  },
  inactive: { word: "Inactive", short: "Inactive", icon: "off", tone: "muted" },
};

/** A channel's state as an icon in its status colour and a word. `short` for a phone's column. */
export function StateTag(props: { state: OpState; short?: boolean }) {
  const s = () => STATE_LABEL[props.state];
  return (
    <span class={`lnm-tag lnm-tag--${s().tone}`} title={s().word}>
      <Icon name={s().icon} />
      {props.short ? s().short : s().word}
    </span>
  );
}

export const KIND_LABEL: Record<CloseKind, { word: string; icon: IconName; tone: string }> = {
  cooperative: { word: "Cooperative", icon: "swap", tone: "muted" },
  force: { word: "Force", icon: "warn", tone: "caution" },
  penalty: { word: "Penalty", icon: "cross", tone: "negative" },
  other: { word: "Other", icon: "branch", tone: "muted" },
};

export function KindTag(props: { kind: CloseKind; long?: boolean }) {
  const k = () => KIND_LABEL[props.kind];
  return (
    <span class={`lnm-tag lnm-tag--${k().tone}`}>
      <Icon name={k().icon} />
      {props.long ? `${k().word} close` : k().word}
    </span>
  );
}

/** A node in a mockup's list: its name linked inside the mockups, its key under it. */
export function MockNodeName(props: {
  node: { id: string; alias: string | null };
  sub?: JSX.Element;
}) {
  return (
    <span class="ln-node">
      <Link class="ln-node__name" href={mockPaths.node(props.node.id)}>
        <Alias alias={props.node.alias} />
      </Link>
      <Show
        when={props.sub}
        fallback={
          <span class="ln-key" title={props.node.id}>
            {truncateMiddle(props.node.id, 8, 6)}
          </span>
        }
      >
        <span class="ln-key">{props.sub}</span>
      </Show>
    </span>
  );
}

/** A peer, with its own size under its name so a reader judges it in place. */
export function PeerName(props: { peer: Peer }) {
  return (
    <MockNodeName
      node={props.peer}
      sub={
        <>
          {groupDigits(props.peer.channels)} channels, {shortBtc(props.peer.capacity)}
        </>
      }
    />
  );
}

/** BTC in magnitude with its unit, for a phrase: `324.6 BTC`, `0.025 BTC`. */
export function shortBtc(sats: number): string {
  const btc = sats / 1e8;
  if (btc >= 1000) return `${groupDigits(Math.round(btc))} BTC`;
  if (btc >= 1) return `${btc.toFixed(btc >= 100 ? 0 : 1)} BTC`;
  return `${Number(btc.toPrecision(2))} BTC`;
}

export function MockChannelLink(props: { id: string }) {
  return (
    <Link class="ln-id num" href={mockPaths.channel(props.id)}>
      {props.id}
    </Link>
  );
}

/** A node's announced colour as a small chip with its value; only a #rrggbb value is drawn. */
export function ColourChip(props: { color: string | null }) {
  const valid = () =>
    props.color !== null && /^#[0-9a-f]{6}$/i.test(props.color) ? props.color : null;
  return (
    <Show when={valid()} fallback={<span class="muted">No colour announced</span>}>
      {(c) => (
        <span class="lnm-chip">
          <span class="lnm-chip__swatch" style={{ "--chip": c() }} aria-hidden="true" />
          <span class="mono">{c()}</span>
        </span>
      )}
    </Show>
  );
}
