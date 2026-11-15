// Mockup: a Lightning node page for operators. Header, the node at a glance, then one section at a
// time chosen by a row of links whose choice is in the address (`?view=`).
import { sorted } from "../../../components/chart/geometry";
import { useParams, useSearchParams } from "@solidjs/router";
import { createMemo, For, lazy, Loading as Pending, Match, Show, Switch } from "solid-js";
import { Amount } from "../../../components/Amount";
import { formatDay } from "../../../components/chart/scale";
import { CopyButton } from "../../../components/CopyButton";
import { HashFull } from "../../../components/Hash";
import { Link } from "../../../components/Link";
import { scrollCue } from "../../../components/scrollCue";
import { Empty } from "../../../components/States";
import { SectionHeader } from "../../../components/SectionHeader";
import { groupDigits } from "../../../lib/format";
import { usePageTitle } from "../../../lib/page";
import { cleanAlias, cut, NAME_IN_TITLE } from "../lightning";
import { Stat } from "../parts";
import { NodeClosed, NodeFees, NodeHistory } from "./NodeSections";
import { NodeChannels } from "./NodeChannels";
import {
  Ago,
  ColourChip,
  days,
  Icon,
  KIND_LABEL,
  MockFrame,
  mockPaths,
  ordinal,
  sats,
  shortBtc,
} from "./parts";
import { MOCK_NOW, type SampleNode, sampleNode, sampleNodes } from "./sample";

const NodeMap = lazy(() => import("./NodeMap"));

export const VIEWS = [
  { id: "channels", label: "Channels" },
  { id: "map", label: "Map" },
  { id: "closed", label: "Closed" },
  { id: "fees", label: "Fees" },
  { id: "history", label: "History" },
] as const;
export type View = (typeof VIEWS)[number]["id"];

export default function MockNodePage() {
  const params = useParams<{ key: string }>();
  const node = createMemo(() => sampleNode(params.key ?? ""));
  return (
    <MockFrame>
      <Show
        when={node()}
        fallback={
          <>
            <h1>Lightning node</h1>
            <Empty title="Not one of the sample nodes">
              These mockups hold two nodes:{" "}
              <For each={sampleNodes()}>
                {(n, i) => (
                  <>
                    {i() > 0 ? " and " : ""}
                    <Link href={mockPaths.node(n.id)}>{n.alias ?? "No name"}</Link>
                  </>
                )}
              </For>
              . On the real site this is the page for a node the server does not hold.
            </Empty>
          </>
        }
      >
        {(n) => <Body node={n()} />}
      </Show>
    </MockFrame>
  );
}

function Body(props: { node: SampleNode }) {
  const [search] = useSearchParams();
  const view = (): View => {
    const v = search["view"];
    return VIEWS.find((x) => x.id === v)?.id ?? "channels";
  };
  const name = () => cleanAlias(props.node.alias);
  usePageTitle(
    () => `Mockup: node ${cut(name() ?? props.node.id.slice(0, 20), NAME_IN_TITLE).text}`,
  );
  return (
    <>
      <Identity node={props.node} />
      <div class="lnm-views">
        {/* noscroll: a section change keeps the picker where it is on screen. */}
        <nav class="ln-picker lnm-subnav" aria-label="Node sections">
          <ul ref={(el) => scrollCue(el)}>
            <For each={VIEWS}>
              {(v) => (
                <li>
                  <Link
                    class="ln-picker__item"
                    href={`${mockPaths.node(props.node.id)}?view=${v.id}`}
                    aria-current={view() === v.id ? "page" : "false"}
                    noscroll
                  >
                    {v.label}
                    <Show when={v.id === "channels"}>
                      <span class="lnm-count num">{groupDigits(props.node.channels.length)}</span>
                    </Show>
                    <Show when={v.id === "closed"}>
                      <span class="lnm-count num">{groupDigits(props.node.closed.length)}</span>
                    </Show>
                  </Link>
                </li>
              )}
            </For>
          </ul>
        </nav>
        <Switch>
          <Match when={view() === "channels"}>
            <NodeChannels node={props.node} />
          </Match>
          <Match when={view() === "map"}>
            <Pending fallback={<div class="lnm-map-hold" />}>
              <NodeMap node={props.node} />
            </Pending>
          </Match>
          <Match when={view() === "closed"}>
            <NodeClosed node={props.node} />
          </Match>
          <Match when={view() === "fees"}>
            <NodeFees node={props.node} />
          </Match>
          <Match when={view() === "history"}>
            <NodeHistory node={props.node} />
          </Match>
        </Switch>
      </div>
      <Glance node={props.node} />
      <About node={props.node} />
    </>
  );
}

/** The compact identity: name, ranks and the two figures that size a node, on one or two lines. */
function Identity(props: { node: SampleNode }) {
  const name = () => cleanAlias(props.node.alias);
  const capacity = () => props.node.channels.reduce((s, c) => s + c.capacity, 0);
  const newest = () => Math.max(...props.node.channels.map((c) => c.last_update));
  return (
    <header class="lnm-ident">
      <h1>
        <Show when={name()} fallback={<span class="ln-alias--none">Unnamed node</span>}>
          {(t) => <bdi class="ln-alias">{cut(t(), NAME_IN_TITLE).text}</bdi>}
        </Show>
      </h1>
      <p class="lnm-ident__line">
        <span>
          <strong class="num">{shortBtc(capacity())}</strong>,{" "}
          <span class="muted">{ordinal(props.node.rank.capacity)} by capacity</span>
        </span>
        <span>
          <strong class="num">{groupDigits(props.node.channels.length)}</strong> open channels,{" "}
          <span class="muted">{ordinal(props.node.rank.channels)} by channels</span>
        </span>
        <span class="muted">
          Channel policies updated as recently as <Ago time={newest()} />
        </span>
      </p>
    </header>
  );
}

/** Who the node is and what it announces: below the working section, for when it is wanted. */
function About(props: { node: SampleNode }) {
  const connect = () =>
    props.node.socket === null
      ? null
      : `${props.node.id}@${cut(cleanAlias(props.node.socket) ?? "", 128).text}`;
  return (
    <section aria-labelledby="lnm-about-title">
      <SectionHeader title="Who it is and what it announces" id="lnm-about-title">
        Its own announcement, updated <Ago time={props.node.last_update} />
      </SectionHeader>
      <dl class="ln-facts lnm-about">
        <div class="ln-fact">
          <dt>Public key</dt>
          <dd>
            <HashFull value={props.node.id} copyLabel="Copy public key" />
            <span class="ln-fact__sub">Its identity: any node can announce any name.</span>
          </dd>
        </div>
        <div class="ln-fact">
          <dt>Connect</dt>
          <dd>
            <Show when={connect()} fallback={<span class="muted">No address announced</span>}>
              {(c) => (
                <span class="lnm-connect">
                  <span class="mono lnm-connect__text">{c()}</span>
                  <CopyButton value={c()} label="Copy the connect string" />
                </span>
              )}
            </Show>
          </dd>
        </div>
        <div class="ln-fact">
          <dt>Addresses</dt>
          <dd>
            <Show when={props.node.addresses.length > 0} fallback="None announced">
              <ul class="ln-chips ln-chips--mono">
                <For each={props.node.addresses}>
                  {(a) => <li>{cut(cleanAlias(a) ?? "", 128).text}</li>}
                </For>
              </ul>
            </Show>
          </dd>
        </div>
        <div class="ln-fact">
          <dt>Features</dt>
          <dd>
            <ul class="ln-chips">
              <For each={props.node.features}>
                {(f) => (
                  <li>
                    {f.name ?? `Bit ${f.bit}`}
                    <span class="ln-chips__req">{f.required ? " (required)" : ""}</span>
                  </li>
                )}
              </For>
            </ul>
          </dd>
        </div>
        <div class="ln-fact">
          <dt>Announced colour, the node's own choice</dt>
          <dd>
            <ColourChip color={props.node.color} />
          </dd>
        </div>
      </dl>
      <p class="ln-aside">
        A node re-announces itself only when something about it changes, so an old announcement is
        normal for a node that runs quietly; its channels' policies say more about whether it is
        working.
      </p>
    </section>
  );
}

/** "Up 7.1 BTC (2.6%)", "Down 3", "No change": an arrow and a word, never a colour. */
export function Change(props: {
  now: number;
  then: number;
  format: (n: number) => string;
  days?: number;
}) {
  const d = () => props.now - props.then;
  const share = () => (props.then === 0 ? null : (d() / props.then) * 100);
  const text = () => {
    if (d() === 0) return "No change";
    const s = share();
    const pct = s === null ? "" : ` (${Math.abs(s) < 0.1 ? "<0.1" : Math.abs(s).toFixed(1)}%)`;
    return `${d() > 0 ? "↑ Up" : "↓ Down"} ${props.format(Math.abs(d()))}${pct}`;
  };
  return (
    <>
      {text()} in {props.days === 1 ? "1 day" : `${props.days ?? 7} days`}
    </>
  );
}

function Glance(props: { node: SampleNode }) {
  const chans = () => props.node.channels;
  const capacity = () => chans().reduce((s, c) => s + c.capacity, 0);
  const weekAgo = () => {
    const h = props.node.history;
    const t = MOCK_NOW - 7 * 86_400;
    let last = h[0];
    for (const p of h) if (p.time <= t) last = p;
    return last;
  };
  const active = () => chans().filter((c) => c.state === "active").length;
  const bySize = () =>
    sorted(
      chans().map((c) => c.capacity),
      (a, b) => a - b,
    );
  const byAge = () =>
    sorted(
      chans().map((c) => MOCK_NOW - c.opened),
      (a, b) => a - b,
    );
  const dayCount = (n: number) => `${groupDigits(n)} ${n === 1 ? "day" : "days"}`;
  const mid = <T,>(xs: T[]) => xs[Math.floor(xs.length / 2)];
  const kinds = () => {
    const k = { cooperative: 0, force: 0, penalty: 0, other: 0 };
    for (const c of props.node.closed) k[c.kind] += 1;
    return k;
  };
  const forced = () => {
    const k = kinds();
    const total = props.node.closed.length;
    return total === 0 ? null : Math.round(((k.force + k.penalty) / total) * 100);
  };
  return (
    <section aria-labelledby="lnm-glance-title">
      <SectionHeader title="At a glance" id="lnm-glance-title">
        Changes over 7 days, from this server's record
      </SectionHeader>
      <dl class="ln-stats lnm-glance">
        <Stat
          label="Capacity"
          sub={
            <Change now={capacity()} then={weekAgo()?.capacity ?? capacity()} format={shortBtc} />
          }
        >
          <Amount sats={capacity()} short />
        </Stat>
        <Stat
          label="Open channels"
          sub={
            <>
              {groupDigits(active())} enabled both ways, {groupDigits(chans().length - active())}{" "}
              not
              <br />
              <Change
                now={chans().length}
                then={weekAgo()?.channels ?? chans().length}
                format={groupDigits}
              />
            </>
          }
        >
          <span class="num">{groupDigits(chans().length)}</span>
        </Stat>
        <Stat
          label="Channel size, median"
          sub={
            <>
              Largest {sats(bySize().at(-1) ?? 0)}, smallest {sats(bySize()[0] ?? 0)}
            </>
          }
        >
          <span class="num">{sats(mid(bySize()) ?? 0)}</span>
        </Stat>
        <Stat
          label="Channel age, median"
          sub={
            <>
              Oldest {groupDigits(days(byAge().at(-1) ?? 0))} days, youngest{" "}
              {dayCount(days(byAge()[0] ?? 0))}
            </>
          }
        >
          <span class="num">{groupDigits(days(mid(byAge()) ?? 0))} days</span>
        </Stat>
        <Stat
          label="Closes seen"
          sub={
            <Show when={forced() !== null} fallback="None since this server started">
              {forced()}% forced
              <span class="lnm-kinds">
                <For each={["cooperative", "force", "penalty", "other"] as const}>
                  {(k) => (
                    <Show when={kinds()[k] > 0}>
                      <span class={`lnm-tag lnm-tag--${KIND_LABEL[k].tone}`}>
                        <Icon name={KIND_LABEL[k].icon} />
                        {groupDigits(kinds()[k])} {KIND_LABEL[k].word.toLowerCase()}
                      </span>
                    </Show>
                  )}
                </For>
              </span>
            </Show>
          }
        >
          <span class="num">{groupDigits(props.node.closed.length)}</span>
        </Stat>
        <Stat label="First seen" sub="Its oldest funding block this server holds">
          <span class="num">{formatDay(props.node.first_seen)}</span>
        </Stat>
      </dl>
    </section>
  );
}
