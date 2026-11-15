// Mockup: a node's open channels as an operator scans them. Sortable by every figure, filtered by
// a peer's name or a channel id, by state, or by a fee row chosen in the Fees section, 25 a page.
// Sort, filters and page live in the address, so a view can be linked.
import { sorted } from "../../../components/chart/geometry";
import { useSearchParams } from "@solidjs/router";
import { createMemo, For, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import { Amount } from "../../../components/Amount";
import { Link } from "../../../components/Link";
import { Pagination } from "../../../components/Pagination";
import { Empty } from "../../../components/States";
import { groupDigits } from "../../../lib/format";
import { cleanAlias, msatShort } from "../lightning";
import { FEE_ROWS, inRow, rowLabel, type Way } from "./fees";
import {
  Ago,
  duration,
  MockChannelLink,
  mockPaths,
  PeerName,
  STATE_LABEL,
  StateTag,
} from "./parts";
import { MOCK_NOW, type OpState, type OpenChannel, type SampleNode } from "./sample";

const PER_PAGE = 25;

interface SortKey {
  id: string;
  label: string;
  value: (c: OpenChannel) => number;
  /** The first press sorts this way: largest first for sizes, youngest first for ages. */
  first: "asc" | "desc";
}

// A missing policy sorts last whichever way: a channel with no fee is not the cheapest.
const MISSING = Number.NaN;
const SORTS: SortKey[] = [
  { id: "capacity", label: "Capacity", value: (c) => c.capacity, first: "desc" },
  { id: "age", label: "Age", value: (c) => MOCK_NOW - c.opened, first: "desc" },
  { id: "out", label: "Fee out", value: (c) => c.out?.fee_rate ?? MISSING, first: "asc" },
  { id: "in", label: "Fee in", value: (c) => c.in?.fee_rate ?? MISSING, first: "asc" },
  { id: "cltv", label: "CLTV delta", value: (c) => c.out?.cltv_delta ?? MISSING, first: "asc" },
  { id: "htlc", label: "Max HTLC", value: (c) => c.out?.max_htlc_msat ?? MISSING, first: "desc" },
  { id: "update", label: "Last update", value: (c) => c.last_update, first: "desc" },
  { id: "peer", label: "Peer's capacity", value: (c) => c.peer.capacity, first: "desc" },
];

const STATES: OpState[] = ["active", "here", "peer", "inactive"];

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export function NodeChannels(props: { node: SampleNode }) {
  const [search, setSearch] = useSearchParams();
  const sort = () => SORTS.find((s) => s.id === one(search["sort"])) ?? SORTS[0];
  const dir = () =>
    one(search["dir"]) === "asc" || one(search["dir"]) === "desc"
      ? one(search["dir"])
      : sort()?.first;
  const query = () => one(search["q"]) ?? "";
  const state = (): OpState | null => {
    const s = one(search["state"]);
    return STATES.find((x) => x === s) ?? null;
  };
  /** A fee row from the Fees section: `out:100` (its lower bound), `in:none` for no policy. */
  const fee = (): { way: Way; from: number | null } | null => {
    const m = /^(out|in):(none|\d+)$/.exec(one(search["fee"]) ?? "");
    if (!m) return null;
    const from = m[2] === "none" ? null : Number(m[2]);
    if (from !== null && !FEE_ROWS.some((f) => f === from)) return null;
    return { way: m[1] === "in" ? "in" : "out", from };
  };
  const page = () => Math.max(1, Number.parseInt(one(search["page"]) ?? "1", 10) || 1);

  const matching = createMemo(() => {
    const q = query().trim().toLowerCase();
    const st = state();
    const f = fee();
    return props.node.channels.filter(
      (c) =>
        (q === "" ||
          c.id.includes(q) ||
          c.scid === q ||
          (cleanAlias(c.peer.alias) ?? "").toLowerCase().includes(q) ||
          c.peer.id.startsWith(q)) &&
        (st === null || c.state === st) &&
        (f === null || inRow(c, f.way, f.from)),
    );
  });
  const ordered = createMemo(() => {
    const s = sort() ?? SORTS[0];
    if (!s) return matching();
    const sign = dir() === "asc" ? 1 : -1;
    return sorted(matching(), (a, b) => {
      const x = s.value(a);
      const y = s.value(b);
      if (Number.isNaN(x) || Number.isNaN(y))
        return Number.isNaN(x) ? (Number.isNaN(y) ? 0 : 1) : -1;
      return (x - y) * sign || b.capacity - a.capacity;
    });
  });
  const pages = () => Math.max(1, Math.ceil(ordered().length / PER_PAGE));
  const shown = () =>
    ordered().slice(
      (Math.min(page(), pages()) - 1) * PER_PAGE,
      Math.min(page(), pages()) * PER_PAGE,
    );
  const counts = createMemo(() => {
    const n: Record<OpState, number> = { active: 0, here: 0, peer: 0, inactive: 0 };
    for (const c of props.node.channels) n[c.state] += 1;
    return n;
  });

  const setSort = (id: string) => {
    const s = SORTS.find((x) => x.id === id);
    if (!s) return;
    const next = sort()?.id === id ? (dir() === "asc" ? "desc" : "asc") : s.first;
    setSearch({ sort: id, dir: next, page: undefined });
  };
  const header = (label: string, id: string | null, cls: string, unit?: string): JSX.Element => {
    const active = () => id !== null && sort()?.id === id;
    return (
      <th
        scope="col"
        class={cls}
        aria-sort={active() ? (dir() === "asc" ? "ascending" : "descending") : undefined}
      >
        <Show when={id} fallback={label}>
          {(i) => (
            <button class="lnm-sort" type="button" onClick={() => setSort(i())}>
              {label}
              <Show when={unit}>
                <span class="lnm-sort__unit">, {unit}</span>
              </Show>
              <span class="lnm-sort__arrow" aria-hidden="true">
                {active() ? (dir() === "asc" ? "↑" : "↓") : "↕"}
              </span>
            </button>
          )}
        </Show>
      </th>
    );
  };

  return (
    <section aria-labelledby="lnm-channels-title">
      <h2 id="lnm-channels-title" class="visually-hidden">
        Open channels
      </h2>
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
            value={`${sort()?.id ?? "capacity"}:${dir() ?? "desc"}`}
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
      <p class="lnm-total" aria-live="polite">
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
              <Link class="lnm-clear" href={`${mockPaths.node(props.node.id)}?view=channels`}>
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
        <div class="table-scroll">
          <table class="table table--rows lnm-table">
            <caption class="visually-hidden">
              Its open channels, sorted by {sort()?.label.toLowerCase()},{" "}
              {dir() === "asc" ? "lowest" : "highest"} first
            </caption>
            <thead>
              <tr>
                {header("Peer and channel", "peer", "")}
                {header("Capacity", "capacity", "table__num", "BTC")}
                {header("Age", "age", "table__num table__optional")}
                {header("Fee out", "out", "table__num", "ppm")}
                {header("Fee in", "in", "table__num table__optional", "ppm")}
                {header("CLTV Δ", "cltv", "table__num table__optional")}
                {header("Max HTLC", "htlc", "table__num table__optional")}
                {header("State", null, "")}
                {header("Updated", "update", "table__num table__optional")}
              </tr>
            </thead>
            <tbody>
              <For each={shown()}>
                {(c) => (
                  <tr>
                    <td class="lnm-peer">
                      <span class="ln-ends">
                        <PeerName peer={c.peer} />
                        <span class="lnm-chan">
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
                    <td class="table__num">
                      <Amount sats={c.capacity} unit={false} short />
                    </td>
                    <td class="table__num table__optional">{duration(MOCK_NOW - c.opened)}</td>
                    <td class="table__num">
                      <Fee p={c.out} />
                    </td>
                    <td class="table__num table__optional">
                      <Fee p={c.in} />
                    </td>
                    <td class="table__num table__optional">
                      {c.out ? groupDigits(c.out.cltv_delta) : "–"}
                    </td>
                    <td class="table__num table__optional">
                      {c.out ? msatShort(c.out.max_htlc_msat) : "–"}
                    </td>
                    <td>
                      <span class="lnm-state-long">
                        <StateTag state={c.state} />
                      </span>
                      <span class="lnm-state-short">
                        <StateTag state={c.state} short />
                      </span>
                    </td>
                    <td class="table__num table__optional">
                      <Ago time={c.last_update} />
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>
      <Show when={pages() > 1}>
        <Pagination
          page={Math.min(page(), pages())}
          pageCount={pages()}
          onPage={(p) => setSearch({ page: p === 1 ? undefined : String(p) })}
          label="Channel pages"
        />
      </Show>
      <p class="ln-aside">
        Fee out is what this node charges to forward over the channel; fee in is what the peer
        charges towards it. Under each rate, the base fee per payment. "{STATE_LABEL.here.word}"
        means this node switched forwarding off on this channel; "{STATE_LABEL.peer.word}", the peer
        did.
      </p>
    </section>
  );
}

/** A policy's rate over its base fee, or a dash for none. */
function Fee(props: { p: OpenChannel["out"] }) {
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
        <span class="lnm-fee">
          <span>{groupDigits(p().fee_rate)}</span>
          <span class="lnm-fee__base">
            {p().base_fee_msat === 0 ? "no base" : `+${msatShort(p().base_fee_msat)}`}
          </span>
        </span>
      )}
    </Show>
  );
}
