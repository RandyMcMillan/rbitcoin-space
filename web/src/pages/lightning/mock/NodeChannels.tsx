// Mockup: a node's open channels as an operator scans them. Sortable by every figure; filtered by a
// peer (one tap on its name), a name or channel id, a state, a fee row from the Fees section, or the
// map's grouped cell. 50 a page on a wide screen in two-line rows; 25 a page on a phone as cards.
// Sort, filters and page live in the address, so a view can be linked.
import { useSearchParams } from "@solidjs/router";
import { createEffect, createMemo, For, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import { sorted } from "../../../components/chart/geometry";
import { Link } from "../../../components/Link";
import { Pagination } from "../../../components/Pagination";
import { Empty } from "../../../components/States";
import { groupDigits } from "../../../lib/format";
import { cleanAlias } from "../lightning";
import { Alias } from "../parts";
import { FEE_ROWS, inRow, rowLabel, type Way } from "./fees";
import {
  days,
  ENABLED_MEANS,
  hours,
  MockChannelLink,
  mockPaths,
  msatAsSats,
  param,
  shortBtc,
  StateTag,
  usePhone,
} from "./parts";
import { MOCK_NOW, type OpState, type OpenChannel, type Policy, type SampleNode } from "./sample";

interface SortKey {
  id: string;
  label: string;
  value: (c: OpenChannel) => number;
  /** The first press sorts this way: largest first for sizes, youngest first for ages. */
  first: "asc" | "desc";
  /** How the figure reads on a phone card when the list is sorted by it. */
  card: (c: OpenChannel) => string;
}

// A missing policy sorts last whichever way: a channel with no fee is not the cheapest.
const MISSING = Number.NaN;
const SORTS: SortKey[] = [
  {
    id: "capacity",
    label: "Capacity",
    value: (c) => c.capacity,
    first: "desc",
    card: (c) => `${groupDigits(c.capacity)} sats`,
  },
  {
    id: "age",
    label: "Age",
    value: (c) => MOCK_NOW - c.opened,
    first: "desc",
    card: (c) => `${groupDigits(days(MOCK_NOW - c.opened))} days old`,
  },
  {
    id: "out",
    label: "Fee out, this node",
    value: (c) => c.out?.fee_rate ?? MISSING,
    first: "asc",
    card: (c) => (c.out ? `Out ${groupDigits(c.out.fee_rate)} ppm` : "No fee out"),
  },
  {
    id: "in",
    label: "Fee in, the peer",
    value: (c) => c.in?.fee_rate ?? MISSING,
    first: "asc",
    card: (c) => (c.in ? `In ${groupDigits(c.in.fee_rate)} ppm` : "No fee in"),
  },
  {
    id: "cltv",
    label: "CLTV delta, this node",
    value: (c) => c.out?.cltv_delta ?? MISSING,
    first: "asc",
    card: (c) => `CLTV delta ${c.out ? groupDigits(c.out.cltv_delta) : "–"}`,
  },
  {
    id: "htlc",
    label: "Max HTLC, this node",
    value: (c) => c.out?.max_htlc_msat ?? MISSING,
    first: "desc",
    card: (c) => `Max HTLC ${c.out ? msatAsSats(c.out.max_htlc_msat) : "–"}`,
  },
  {
    id: "update",
    label: "Last policy update",
    value: (c) => c.last_update,
    first: "desc",
    card: (c) => `Updated ${groupDigits(hours(MOCK_NOW - c.last_update))} h ago`,
  },
  {
    id: "peer",
    label: "Peer's total capacity",
    value: (c) => c.peer.capacity,
    first: "desc",
    card: (c) => `Peer ${shortBtc(c.peer.capacity)}`,
  },
];
const DEFAULT_SORT = SORTS[0] as SortKey;
/** Sorts whose figure is already on every card. */
const ON_CARD = new Set(["capacity", "age", "out", "in"]);

const STATES: OpState[] = ["active", "here", "peer", "inactive"];

export function NodeChannels(props: { node: SampleNode }) {
  const [search, setSearch] = useSearchParams();
  const phone = usePhone();
  const perPage = () => (phone() ? 25 : 50);
  const sort = () => SORTS.find((s) => s.id === param(search["sort"])) ?? DEFAULT_SORT;
  const dir = () => {
    const d = param(search["dir"]);
    return d === "asc" || d === "desc" ? d : sort().first;
  };
  const query = () => param(search["q"]) ?? "";
  const state = (): OpState | null => STATES.find((x) => x === param(search["state"])) ?? null;
  const peer = () => param(search["peer"]) ?? null;
  /** The map's grouped cell: every channel outside the `smaller` largest. */
  const smaller = () => {
    const n = Number(param(search["smaller"]));
    return Number.isInteger(n) && n > 0 ? n : null;
  };
  /** A fee row from the Fees section: `out:100` (its lower bound), `in:none` for no policy. */
  const fee = (): { way: Way; from: number | null } | null => {
    const m = /^(out|in):(none|\d+)$/.exec(param(search["fee"]) ?? "");
    if (!m) return null;
    const from = m[2] === "none" ? null : Number(m[2]);
    if (from !== null && !FEE_ROWS.some((f) => f === from)) return null;
    return { way: m[1] === "in" ? "in" : "out", from };
  };
  const page = () => Math.max(1, Number.parseInt(param(search["page"]) ?? "1", 10) || 1);

  // How many channels this node has with each peer: a peer with ten reads as a group.
  const together = createMemo(() => {
    const n = new Map<string, number>();
    for (const c of props.node.channels) n.set(c.peer.id, (n.get(c.peer.id) ?? 0) + 1);
    return n;
  });
  const grouped = createMemo(() => {
    const n = smaller();
    return n === null ? null : new Set(props.node.channels.slice(n).map((c) => c.id));
  });
  const matching = createMemo(() => {
    const q = query().trim().toLowerCase();
    const st = state();
    const f = fee();
    const p = peer();
    const g = grouped();
    return props.node.channels.filter(
      (c) =>
        (q === "" ||
          c.id.includes(q) ||
          c.scid === q ||
          (cleanAlias(c.peer.alias) ?? "").toLowerCase().includes(q) ||
          c.peer.id.startsWith(q)) &&
        (st === null || c.state === st) &&
        (f === null || inRow(c, f.way, f.from)) &&
        (p === null || c.peer.id === p) &&
        (g === null || g.has(c.id)),
    );
  });
  const ordered = createMemo(() => {
    const s = sort();
    const sign = dir() === "asc" ? 1 : -1;
    return sorted(matching(), (a, b) => {
      const x = s.value(a);
      const y = s.value(b);
      if (Number.isNaN(x) || Number.isNaN(y))
        return Number.isNaN(x) ? (Number.isNaN(y) ? 0 : 1) : -1;
      return (x - y) * sign || b.capacity - a.capacity;
    });
  });
  const pages = () => Math.max(1, Math.ceil(ordered().length / perPage()));
  const current = () => Math.min(page(), pages());
  const shown = () => ordered().slice((current() - 1) * perPage(), current() * perPage());
  const counts = createMemo(() => {
    const n: Record<OpState, number> = { active: 0, here: 0, peer: 0, inactive: 0 };
    for (const c of props.node.channels) n[c.state] += 1;
    return n;
  });
  const peerShown = () => props.node.channels.find((c) => c.peer.id === peer())?.peer;

  // A new page starts at the top of the list, not where "Next" was.
  let top: HTMLElement | undefined;
  createEffect(
    () => current(),
    (_, previous) => {
      if (previous !== undefined && top && top.getBoundingClientRect().top < 0)
        top.scrollIntoView({ block: "start" });
    },
  );

  const setSort = (id: string) => {
    const s = SORTS.find((x) => x.id === id);
    if (!s) return;
    const next = sort().id === id ? (dir() === "asc" ? "desc" : "asc") : s.first;
    setSearch({ sort: id, dir: next, page: undefined });
  };
  const header = (
    label: string,
    whose: string,
    id: string | null,
    cls: string,
    title?: string,
  ): JSX.Element => {
    const active = () => id !== null && sort().id === id;
    return (
      <th
        scope="col"
        class={cls}
        aria-sort={active() ? (dir() === "asc" ? "ascending" : "descending") : undefined}
      >
        <Show
          when={id}
          fallback={
            <span class="lnm-th">
              {label}
              <span class="lnm-th__whose">{whose}</span>
            </span>
          }
        >
          {(i) => (
            <button
              class="lnm-sort lnm-th"
              type="button"
              title={title}
              onClick={() => setSort(i())}
            >
              <span>
                {label}
                <span class="lnm-sort__arrow" aria-hidden="true">
                  {active() ? (dir() === "asc" ? "↑" : "↓") : "↕"}
                </span>
              </span>
              <span class="lnm-th__whose">{whose}</span>
            </button>
          )}
        </Show>
      </th>
    );
  };
  const peerLink = (c: OpenChannel) =>
    `${mockPaths.node(props.node.id)}?view=channels&peer=${encodeURIComponent(c.peer.id)}`;
  const name = () => cleanAlias(props.node.alias) ?? "this node";

  return (
    <section aria-labelledby="lnm-channels-title" class="lnm-channels">
      <h2 id="lnm-channels-title" class="visually-hidden">
        Open channels
      </h2>
      <p class="lnm-explain">
        <strong>Fee out</strong>: what <bdi>{name()}</bdi> charges to forward over the channel.{" "}
        <strong>Fee in</strong>: what the peer charges to forward towards <bdi>{name()}</bdi>.{" "}
        <strong>Inbound discount</strong> (lnd's inbound fee): what an end takes off for a payment
        arriving over the channel, shown under the rate when there is one. {ENABLED_MEANS}
      </p>
      <div class="lnm-filters">
        <label class="lnm-filter">
          <span class="visually-hidden">Filter by a peer's name or key, or a channel id</span>
          <input
            type="search"
            class="lnm-input"
            placeholder="Peer or channel id"
            value={query()}
            spellcheck="false"
            autocomplete="off"
            onInput={(e) =>
              setSearch(
                { q: e.currentTarget.value || undefined, page: undefined },
                { replace: true },
              )
            }
          />
        </label>
        <div class="lnm-chips" role="group" aria-label="Channel state">
          <button
            class="btn lnm-chipbtn"
            type="button"
            aria-pressed={state() === null ? "true" : "false"}
            onClick={() => setSearch({ state: undefined, page: undefined })}
          >
            All <span class="num muted">{groupDigits(props.node.channels.length)}</span>
          </button>
          <For each={STATES}>
            {(s) => (
              <Show when={counts()[s] > 0}>
                <button
                  class="btn lnm-chipbtn"
                  type="button"
                  aria-pressed={state() === s ? "true" : "false"}
                  onClick={() =>
                    setSearch({ state: state() === s ? undefined : s, page: undefined })
                  }
                >
                  <StateTag state={s} />
                  <span class="num muted">{groupDigits(counts()[s])}</span>
                </button>
              </Show>
            )}
          </For>
        </div>
        <label class="lnm-sortpick">
          <span>Sort</span>
          <select
            class="lnm-input"
            value={`${sort().id}:${dir()}`}
            onChange={(e) => {
              const [id, d] = e.currentTarget.value.split(":");
              setSearch({ sort: id, dir: d, page: undefined });
            }}
          >
            <For each={SORTS}>
              {(s) => (
                <>
                  <option value={`${s.id}:${s.first}`}>
                    {s.label}, {s.first === "desc" ? "highest" : "lowest"} first
                  </option>
                  <option value={`${s.id}:${s.first === "desc" ? "asc" : "desc"}`}>
                    {s.label}, {s.first === "desc" ? "lowest" : "highest"} first
                  </option>
                </>
              )}
            </For>
          </select>
        </label>
      </div>
      <Show when={peerShown()}>
        {(p) => (
          <p class="lnm-peerbar">
            <span>
              <strong>{groupDigits(together().get(p().id) ?? 0)}</strong> channels with{" "}
              <strong>
                <Alias alias={p().alias} />
              </strong>
              <span class="muted">
                , which has {groupDigits(p().channels)} channels and {shortBtc(p().capacity)} in all
              </span>
            </span>
            <Link class="tap" href={mockPaths.node(p().id)}>
              Its node page
            </Link>
            <Link class="tap" href={`${mockPaths.node(props.node.id)}?view=channels`} noscroll>
              Show every peer
            </Link>
          </p>
        )}
      </Show>
      <p class="lnm-total" aria-live="polite" ref={(el) => (top = el)}>
        <Show
          when={matching().length !== props.node.channels.length}
          fallback={<>{groupDigits(props.node.channels.length)} open channels</>}
        >
          <strong class="num">{groupDigits(matching().length)}</strong> of{" "}
          {groupDigits(props.node.channels.length)} open channels match
        </Show>
        <Show when={fee()}>
          {(f) => (
            <span class="lnm-active-filter">
              {f().way === "out" ? "It charges" : "Its peers charge"}{" "}
              {f().from === null
                ? "no fee (no policy)"
                : `${rowLabel(FEE_ROWS.indexOf(f().from as (typeof FEE_ROWS)[number]))} ppm`}
              <Link
                class="lnm-clear"
                href={`${mockPaths.node(props.node.id)}?view=channels`}
                noscroll
              >
                Clear
              </Link>
            </span>
          )}
        </Show>
        <Show when={smaller()}>
          {(n) => (
            <span class="lnm-active-filter">
              Smaller than the {groupDigits(n())} largest, as the map groups them
              <Link
                class="lnm-clear"
                href={`${mockPaths.node(props.node.id)}?view=channels`}
                noscroll
              >
                Clear
              </Link>
            </span>
          )}
        </Show>
      </p>
      <Show
        when={shown().length > 0}
        fallback={
          <Empty title="No channel matches">
            Try part of a peer's name, the start of its key, or a channel id such as 811984x2037x0.
          </Empty>
        }
      >
        <Show
          when={!phone()}
          fallback={
            <ol class="lnm-cards">
              <For each={shown()}>
                {(c) => (
                  <Card
                    c={c}
                    together={together().get(c.peer.id) ?? 1}
                    peerHref={peerLink(c)}
                    extra={ON_CARD.has(sort().id) ? null : sort().card(c)}
                  />
                )}
              </For>
            </ol>
          }
        >
          <div class="table-scroll">
            <table class="table table--rows lnm-table lnm-chantable">
              <caption class="visually-hidden">
                Its open channels, sorted by {sort().label.toLowerCase()},{" "}
                {dir() === "asc" ? "lowest" : "highest"} first
              </caption>
              <thead>
                <tr>
                  {header(
                    "Peer",
                    "by its total capacity",
                    "peer",
                    "",
                    "Sorts by the peer's total capacity",
                  )}
                  {header("Capacity", "sats", "capacity", "table__num")}
                  {header("Age", "days", "age", "table__num")}
                  {header("Fee out", "this node, ppm", "out", "table__num")}
                  {header("Fee in", "the peer, ppm", "in", "table__num")}
                  {header("CLTV Δ", "this node", "cltv", "table__num")}
                  {header("Max HTLC", "this node, sats", "htlc", "table__num")}
                  {header("State", "of the policies", null, "")}
                  {header("Updated", "h ago", "update", "table__num")}
                </tr>
              </thead>
              <tbody>
                <For each={shown()}>
                  {(c) => (
                    <tr>
                      <td class="lnm-peer">
                        <span class="lnm-row2">
                          <span class="lnm-row2__line">
                            <Link
                              class="ln-node__name"
                              href={peerLink(c)}
                              noscroll
                              title="Show only this peer's channels"
                            >
                              <Alias alias={c.peer.alias} max={24} />
                            </Link>
                            <Show when={(together().get(c.peer.id) ?? 1) > 1}>
                              <span class="lnm-together">{together().get(c.peer.id)} channels</span>
                            </Show>
                          </span>
                          <span class="lnm-row2__line">
                            <MockChannelLink id={c.id} />
                            <Show when={c.batch > 0}>
                              <span
                                class="lnm-batch"
                                title="Funded in one transaction with other channels"
                              >
                                with {c.batch} {c.batch === 1 ? "other" : "others"}
                              </span>
                            </Show>
                          </span>
                        </span>
                        <Link
                          class="table__rowlink"
                          href={mockPaths.channel(c.id)}
                          tabindex="-1"
                          aria-hidden="true"
                        />
                      </td>
                      <td class="table__num">{groupDigits(c.capacity)}</td>
                      <td class="table__num">{groupDigits(days(MOCK_NOW - c.opened))}</td>
                      <td class="table__num">
                        <Fee p={c.out} />
                      </td>
                      <td class="table__num">
                        <Fee p={c.in} />
                      </td>
                      <td class="table__num">{c.out ? groupDigits(c.out.cltv_delta) : "–"}</td>
                      <td class="table__num">
                        <Show when={c.out} fallback="–">
                          {(p) => (
                            <span class="lnm-row2 lnm-row2--right">
                              <span>{groupDigits(Math.floor(p().max_htlc_msat / 1000))}</span>
                              <span class="lnm-sub">min {msatAsSats(p().min_htlc_msat)}</span>
                            </span>
                          )}
                        </Show>
                      </td>
                      <td>
                        <StateTag state={c.state} />
                      </td>
                      <td class="table__num">{groupDigits(hours(MOCK_NOW - c.last_update))}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </Show>
      <Show when={pages() > 1}>
        <Pagination
          page={current()}
          pageCount={pages()}
          onPage={(p) => setSearch({ page: p === 1 ? undefined : String(p) })}
          label="Channel pages"
        />
      </Show>
    </section>
  );
}

/** A policy's rate and base fee on one line; an inbound discount under it when there is one. */
function Fee(props: { p: Policy | null }) {
  return (
    <Show
      when={props.p}
      fallback={
        <span class="muted" title="No policy">
          –
        </span>
      }
    >
      {(p) => (
        <span class="lnm-row2 lnm-row2--right">
          <span>
            {groupDigits(p().fee_rate)}
            <span class="lnm-sub"> +{msatAsSats(p().base_fee_msat)}</span>
          </span>
          <Show when={p().inbound_rate !== 0 || p().inbound_base_msat !== 0}>
            <span
              class="lnm-sub lnm-inbound"
              title="Inbound discount: taken off for payments arriving over this channel"
            >
              inbound {inbound(p())}
            </span>
          </Show>
        </span>
      )}
    </Show>
  );
}

/** An inbound discount: `−50 ppm`, `−25 ppm −1 sat`. */
export const inbound = (p: Policy): string =>
  `${p.inbound_rate < 0 ? "−" : ""}${groupDigits(Math.abs(p.inbound_rate))} ppm${
    p.inbound_base_msat === 0 ? "" : ` ${msatAsSats(p.inbound_base_msat)}`
  }`;

/** A phone's channel: identity, the figures an operator compares, state and age; the rest folded. */
function Card(props: { c: OpenChannel; together: number; peerHref: string; extra: string | null }) {
  const c = () => props.c;
  const rate = (p: Policy | null) => (p ? `${groupDigits(p.fee_rate)} ppm` : "–");
  return (
    <li class="lnm-card">
      <p class="lnm-card__id">
        <Link
          class="ln-node__name tap"
          href={props.peerHref}
          noscroll
          title="Show only this peer's channels"
        >
          <Alias alias={c().peer.alias} max={24} />
        </Link>
        <Show when={props.together > 1}>
          <span class="lnm-together">{props.together} channels</span>
        </Show>
        <span class="lnm-card__chan">
          <Link class="ln-id num tap" href={mockPaths.channel(c().id)}>
            {c().id}
          </Link>
        </span>
      </p>
      <dl class="lnm-card__figs">
        <div>
          <dt>Capacity, sats</dt>
          <dd class="num">{groupDigits(c().capacity)}</dd>
        </div>
        <div>
          <dt>Fee out</dt>
          <dd class="num">
            {rate(c().out)}
            <Show when={c().out}>
              {(p) => <span class="lnm-sub">+{msatAsSats(p().base_fee_msat)}</span>}
            </Show>
          </dd>
        </div>
        <div>
          <dt>Fee in</dt>
          <dd class="num">
            {rate(c().in)}
            <Show when={c().in}>
              {(p) => <span class="lnm-sub">+{msatAsSats(p().base_fee_msat)}</span>}
            </Show>
          </dd>
        </div>
      </dl>
      <p class="lnm-card__state">
        <StateTag state={c().state} />
        <span class="num">{groupDigits(days(MOCK_NOW - c().opened))} days old</span>
        <Show when={props.extra}>{(x) => <strong class="num">{x()}</strong>}</Show>
      </p>
      <details class="lnm-card__more">
        <summary class="tap">More about this channel</summary>
        <dl class="lnm-card__list">
          <div>
            <dt>CLTV delta</dt>
            <dd class="num">
              this node {c().out ? groupDigits(c().out?.cltv_delta ?? 0) : "–"}, the peer{" "}
              {c().in ? groupDigits(c().in?.cltv_delta ?? 0) : "–"}
            </dd>
          </div>
          <div>
            <dt>HTLC limits, this node</dt>
            <dd class="num">
              {c().out
                ? `${msatAsSats(c().out?.min_htlc_msat ?? 0)} to ${msatAsSats(c().out?.max_htlc_msat ?? 0)}`
                : "–"}
            </dd>
          </div>
          <Show
            when={
              c().out && (c().out?.inbound_rate ?? 0) !== 0
                ? c().out
                : c().in && (c().in?.inbound_rate ?? 0) !== 0
                  ? c().in
                  : null
            }
          >
            {(p) => (
              <div>
                <dt>Inbound discount, {p() === c().out ? "this node" : "the peer"}</dt>
                <dd class="num">{inbound(p())}</dd>
              </div>
            )}
          </Show>
          <div>
            <dt>Policies updated</dt>
            <dd class="num">{groupDigits(hours(MOCK_NOW - c().last_update))} h ago</dd>
          </div>
          <div>
            <dt>The peer</dt>
            <dd class="num">
              {groupDigits(c().peer.channels)} channels, {shortBtc(c().peer.capacity)}
            </dd>
          </div>
          <Show when={c().batch > 0}>
            <div>
              <dt>Funded</dt>
              <dd>
                in one transaction with {c().batch} other {c().batch === 1 ? "channel" : "channels"}
              </dd>
            </div>
          </Show>
        </dl>
      </details>
    </li>
  );
}
