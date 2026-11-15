// Mockup: a node's closed channels (paged, by kind and peer), its fee rates (a bar opens the
// channels in that row) and its past, as two small charts on fitted axes.
import { useNavigate, useSearchParams } from "@solidjs/router";
import { createEffect, createMemo, For, lazy, Loading as Pending, onSettled, Show } from "solid-js";
import { Link } from "../../../components/Link";
import { Pagination } from "../../../components/Pagination";
import { formatDay, formatMoment } from "../../../components/chart/scale";
import "../../../components/chart/Chart.css";
import { More } from "../../../components/More";
import { SectionHeader } from "../../../components/SectionHeader";
import { Empty } from "../../../components/States";
import { formatBtc, groupDigits } from "../../../lib/format";
import { onNetwork } from "../../../lib/network";
import { useNetwork } from "../../../lib/page";
import { btcAxis, type CloseKind, feeSentence, type FeeRow } from "../lightning";
import { Alias } from "../parts";
import { type FeeSummary, feeRowsOf, summary, type Way } from "./fees";
import {
  days,
  Icon,
  KindTag,
  MockChannelLink,
  mockPaths,
  param,
  sats,
  shortBtc,
  TxLink,
  usePhone,
} from "./parts";
import { MOCK_NOW, type SampleNode } from "./sample";

const Chart = lazy(() => import("../../../components/chart/Chart"));
const DAY = 86_400;

const KINDS: CloseKind[] = ["cooperative", "force", "penalty", "other"];

export function NodeClosed(props: { node: SampleNode }) {
  const [search, setSearch] = useSearchParams();
  const phone = usePhone();
  const perPage = () => (phone() ? 25 : 50);
  const kind = () => KINDS.find((k) => k === param(search["kind"])) ?? null;
  const spliced = () => param(search["kind"]) === "continued";
  const peer = () => param(search["peer"]) ?? null;
  const page = () => Math.max(1, Number.parseInt(param(search["page"]) ?? "1", 10) || 1);
  const matching = createMemo(() =>
    props.node.closed.filter(
      (c) =>
        (kind() === null || c.kind === kind()) &&
        (!spliced() || c.continued !== null) &&
        (peer() === null || c.peer.id === peer()),
    ),
  );
  const pages = () => Math.max(1, Math.ceil(matching().length / perPage()));
  const current = () => Math.min(page(), pages());
  const shown = () => matching().slice((current() - 1) * perPage(), current() * perPage());
  const count = (k: CloseKind) => props.node.closed.filter((c) => c.kind === k).length;
  const continued = () => props.node.closed.filter((c) => c.continued !== null).length;
  const base = () => `${mockPaths.node(props.node.id)}?view=closed`;
  const peerHref = (id: string) => `${base()}&peer=${encodeURIComponent(id)}`;
  const peerShown = () => props.node.closed.find((c) => c.peer.id === peer())?.peer;
  let top: HTMLElement | undefined;
  createEffect(
    () => current(),
    (_, previous) => {
      if (previous !== undefined && top && top.getBoundingClientRect().top < 0)
        top.scrollIntoView({ block: "start" });
    },
  );
  const choose = (k: string | undefined) => setSearch({ kind: k, page: undefined });
  return (
    <section aria-labelledby="lnm-closed-title">
      <SectionHeader title="Closed channels" id="lnm-closed-title">
        Seen on the chain since this server started, newest first
      </SectionHeader>
      <Show
        when={props.node.closed.length > 0}
        fallback={
          <Empty title="No close seen">
            None of its channels closed while this server watched.
          </Empty>
        }
      >
        <div class="lnm-chips" role="group" aria-label="Kind of close">
          <button
            class="btn lnm-chipbtn"
            type="button"
            aria-pressed={kind() === null && !spliced() ? "true" : "false"}
            onClick={() => choose(undefined)}
          >
            All <span class="num muted">{groupDigits(props.node.closed.length)}</span>
          </button>
          <For each={KINDS}>
            {(k) => (
              <Show when={count(k) > 0}>
                <button
                  class="btn lnm-chipbtn"
                  type="button"
                  aria-pressed={kind() === k ? "true" : "false"}
                  onClick={() => choose(kind() === k ? undefined : k)}
                >
                  <KindTag kind={k} />
                  <span class="num muted">{groupDigits(count(k))}</span>
                </button>
              </Show>
            )}
          </For>
          <Show when={continued() > 0}>
            <button
              class="btn lnm-chipbtn"
              type="button"
              aria-pressed={spliced() ? "true" : "false"}
              onClick={() => choose(spliced() ? undefined : "continued")}
            >
              <span class="lnm-tag lnm-tag--muted">
                <Icon name="branch" />
                Continued as a new channel
              </span>
              <span class="num muted">{groupDigits(continued())}</span>
            </button>
          </Show>
        </div>
        <Show when={peerShown()}>
          {(p) => (
            <p class="lnm-peerbar">
              <span>
                Closes with{" "}
                <strong>
                  <Alias alias={p().alias} />
                </strong>
              </span>
              <Link class="tap" href={base()} noscroll>
                Show every peer
              </Link>
            </p>
          )}
        </Show>
        <p class="lnm-total" aria-live="polite" ref={(el) => (top = el)}>
          <Show
            when={matching().length !== props.node.closed.length}
            fallback={<>{groupDigits(props.node.closed.length)} closes</>}
          >
            <strong class="num">{groupDigits(matching().length)}</strong> of{" "}
            {groupDigits(props.node.closed.length)} closes match
          </Show>
        </p>
        <Show
          when={!phone()}
          fallback={
            <ol class="lnm-cards">
              <For each={shown()}>
                {(c) => (
                  <li class="lnm-card">
                    <p class="lnm-card__id">
                      <Link class="ln-node__name tap" href={peerHref(c.peer.id)} noscroll>
                        <Alias alias={c.peer.alias} max={24} />
                      </Link>
                      <span class="lnm-card__chan">
                        <Link class="ln-id num tap" href={mockPaths.channel(c.id)}>
                          {c.id}
                        </Link>
                      </span>
                    </p>
                    <p class="lnm-card__state">
                      <KindTag kind={c.kind} />
                      <span class="num">{formatDay(c.closedTime)}</span>
                      <span class="num muted">block {groupDigits(c.closedHeight)}</span>
                    </p>
                    <Show when={c.continued}>
                      {(n) => (
                        <p class="lnm-card__state lnm-continued">
                          Continued as <MockChannelLink id={n()} /> (inferred splice)
                        </p>
                      )}
                    </Show>
                    <details class="lnm-card__more">
                      <summary class="tap">More about this close</summary>
                      <dl class="lnm-card__list">
                        <div>
                          <dt>Capacity</dt>
                          <dd class="num">{sats(c.capacity)}</dd>
                        </div>
                        <div>
                          <dt>Closing fee</dt>
                          <dd class="num">{sats(c.fee)}</dd>
                        </div>
                        <div>
                          <dt>Lived</dt>
                          <dd class="num">{groupDigits(days(c.closedTime - c.opened))} days</dd>
                        </div>
                        <div>
                          <dt>Closing transaction</dt>
                          <dd>
                            <TxLink txid={c.txid} label="Copy closing transaction ID" />
                          </dd>
                        </div>
                      </dl>
                    </details>
                  </li>
                )}
              </For>
            </ol>
          }
        >
          <div class="table-scroll">
            <table class="table lnm-table lnm-chantable">
              <caption class="visually-hidden">Its closed channels, newest close first</caption>
              <thead>
                <tr>
                  <th scope="col">Peer and channel</th>
                  <th scope="col">What happened</th>
                  <th scope="col" class="table__num">
                    Capacity, sats
                  </th>
                  <th scope="col" class="table__num">
                    Closing fee, sats
                  </th>
                  <th scope="col" class="table__num">
                    Lived, days
                  </th>
                  <th scope="col">Closing transaction</th>
                  <th scope="col" class="table__num">
                    Closed
                  </th>
                </tr>
              </thead>
              <tbody>
                <For each={shown()}>
                  {(c) => (
                    <tr>
                      <td>
                        <span class="lnm-row2">
                          <Link
                            class="ln-node__name"
                            href={peerHref(c.peer.id)}
                            noscroll
                            title="Show only closes with this peer"
                          >
                            <Alias alias={c.peer.alias} max={24} />
                          </Link>
                          <MockChannelLink id={c.id} />
                        </span>
                      </td>
                      <td>
                        <span class="lnm-row2">
                          <KindTag kind={c.kind} />
                          <Show when={c.continued}>
                            {(n) => (
                              <span class="lnm-continued">
                                Continued as <MockChannelLink id={n()} /> (inferred)
                              </span>
                            )}
                          </Show>
                        </span>
                      </td>
                      <td class="table__num">{groupDigits(c.capacity)}</td>
                      <td class="table__num">{groupDigits(c.fee)}</td>
                      <td class="table__num">{groupDigits(days(c.closedTime - c.opened))}</td>
                      <td>
                        <TxLink txid={c.txid} label="Copy closing transaction ID" />
                      </td>
                      <td class="table__num">
                        {formatDay(c.closedTime)}
                        <span class="ln-row-when lnm-under">
                          Block {groupDigits(c.closedHeight)}
                        </span>
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
            page={current()}
            pageCount={pages()}
            onPage={(p) => setSearch({ page: p === 1 ? undefined : String(p) })}
            label="Close pages"
          />
        </Show>
      </Show>
      <More label="How a close is told apart">
        <p>
          The closing transaction says how a channel ended. A force close is a commitment
          transaction one end broadcast alone; a penalty is a force close of an old, revoked state
          whose outputs the other end swept with the revocation key. A cooperative close spends the
          channel alone and is not a commitment. "Continued as" is an observation: the closing
          transaction also funds a new channel between the same two nodes. That it was a splice is
          an inference; a close and a fresh open in one transaction look the same. "Other" spends
          more than the channel, most likely a splice that added funds.
        </p>
      </More>
    </section>
  );
}

const figure = (s: FeeSummary | null, get: (s: FeeSummary) => number) =>
  s === null ? "–" : groupDigits(get(s));

const WAYS: { way: Way; key: "outgoing" | "incoming"; word: string }[] = [
  { way: "out", key: "outgoing", word: "It charges" },
  { way: "in", key: "incoming", word: "Its peers charge" },
];

export function NodeFees(props: { node: SampleNode }) {
  const navigate = useNavigate();
  const network = useNetwork();
  const rows = () => feeRowsOf(props.node.channels);
  const most = () => Math.max(1, ...rows().flatMap((r) => [r.outgoing.count, r.incoming.count]));
  const out = () => summary(props.node.channels, "out");
  const inn = () => summary(props.node.channels, "in");
  const open = (way: Way, r: FeeRow) =>
    navigate(
      onNetwork(
        network(),
        `${mockPaths.node(props.node.id)}?view=channels&fee=${way}:${r.from ?? "none"}`,
      ),
    );
  return (
    <div class="lnm-fees">
      <section aria-labelledby="lnm-fees-sum-title">
        <SectionHeader title="Its fees in figures" id="lnm-fees-sum-title">
          Over its open channels, in ppm
        </SectionHeader>
        <div class="table-scroll">
          <table class="table lnm-table lnm-feesum">
            <caption class="visually-hidden">Its fee rates, out and in, ppm</caption>
            <thead>
              <tr>
                <th scope="col">Fee rate, ppm</th>
                <th scope="col" class="table__num">
                  It charges
                </th>
                <th scope="col" class="table__num">
                  Its peers charge
                </th>
              </tr>
            </thead>
            <tbody>
              <For
                each={[
                  { label: "Median", get: (s: FeeSummary) => s.median },
                  { label: "Average, by capacity", get: (s: FeeSummary) => s.weighted },
                  { label: "Lowest", get: (s: FeeSummary) => s.lowest },
                  { label: "Highest", get: (s: FeeSummary) => s.highest },
                ]}
              >
                {(r) => (
                  <tr>
                    <th scope="row">{r.label}</th>
                    <td class="table__num">{figure(out(), r.get)}</td>
                    <td class="table__num">{figure(inn(), r.get)}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
        <Show when={out() && inn()}>
          <p class="lnm-ratio">
            It charges{" "}
            <strong class="num">
              {((out()?.median ?? 0) / Math.max(1, inn()?.median ?? 1)).toFixed(1)}×
            </strong>{" "}
            what its peers charge towards it, median against median.
          </p>
        </Show>
      </section>
      <section aria-labelledby="lnm-fees-title">
        <SectionHeader title="Fee rates" id="lnm-fees-title">
          Choose a bar to list those channels
        </SectionHeader>
        <p class="ln-fees__answer">{feeSentence(rows())}</p>
        <figure class="ln-fees">
          <div class="ln-fees__plot">
            <span class="ln-fees__unit">ppm</span>
            <span class="ln-fees__bars ln-fees__key" aria-hidden="true">
              <span class="ln-fees__way ln-fees__way--out">It charges</span>
              <span class="ln-fees__way ln-fees__way--in">Its peers charge</span>
            </span>
            <For each={rows()}>
              {(r) => (
                <>
                  <span class="ln-fees__label num">{r.label}</span>
                  <span class="ln-fees__bars">
                    <For each={WAYS}>
                      {(w) => (
                        <button
                          type="button"
                          class={`ln-fees__bar ln-fees__bar--${w.way} lnm-barbtn`}
                          disabled={r[w.key].count === 0}
                          aria-label={`${w.word} ${r.from === null ? "no policy" : `${r.label} ppm`}: ${groupDigits(r[w.key].count)} channels, ${formatBtc(r[w.key].capacity)} BTC. List them.`}
                          onClick={() => open(w.way, r)}
                        >
                          <Show when={r[w.key].count > 0}>
                            <span
                              class="ln-fees__fill"
                              style={{ "--w": String(r[w.key].count / most()) }}
                            />
                            <span class="ln-fees__n num">{groupDigits(r[w.key].count)}</span>
                          </Show>
                        </button>
                      )}
                    </For>
                  </span>
                </>
              )}
            </For>
          </div>
        </figure>
        <More>
          <p>
            A channel has a fee rate each way: what this node charges to forward a payment out over
            it, and what the peer at the other end charges to send one towards it. A rate is in
            parts per million of the amount forwarded: 1 000 ppm is 0.1%. The average by capacity
            counts a 5 BTC channel fifty times as much as a 0.1 BTC one, which is closer to where
            payments go; it leaves out rates over 1 000 000 ppm, which refuse to route. The base fee
            per payment is not in these figures; the channel list shows it.
          </p>
        </More>
      </section>
    </div>
  );
}

export function NodeHistory(props: { node: SampleNode }) {
  onSettled(() => void Chart.preload());
  const points = () => props.node.history;
  const first = () => points()[0];
  const last = () => points().at(-1);
  const x = () => points().map((p) => p.time);
  const time = (t: number) => (t % DAY === 0 ? formatDay(t) : formatMoment(t));
  const change = (now: number, then: number, f: (n: number) => string) =>
    now === then ? "no change in" : `${now > then ? "up" : "down"} ${f(Math.abs(now - then))}`;
  return (
    <section aria-labelledby="lnm-history-title" class="lnm-neutral-charts">
      <SectionHeader title="Over time" id="lnm-history-title">
        Each change and midnight UTC
      </SectionHeader>
      <Show when={first() && last()}>
        <p class="lnm-history__words">
          Since {formatDay(first()?.time ?? 0)}:{" "}
          <strong>
            {change(
              last()?.channels ?? 0,
              first()?.channels ?? 0,
              (n) => `${groupDigits(n)} channels`,
            )}
          </strong>{" "}
          and <strong>{change(last()?.capacity ?? 0, first()?.capacity ?? 0, shortBtc)}</strong>, to{" "}
          {groupDigits(last()?.channels ?? 0)} channels and {shortBtc(last()?.capacity ?? 0)}. The
          axes fit the range, so small changes show; neither starts at zero.
        </p>
      </Show>
      <div class="lnm-twocharts">
        <div class="ln-chart lnm-chart--small">
          <Pending>
            <Chart
              label="This node's open channels, since this server's record began"
              x={x()}
              gap={DAY}
              height={140}
              left={{ format: groupDigits }}
              series={[
                {
                  name: "Channels",
                  values: points().map((p) => p.channels),
                  draw: "step",
                  format: groupDigits,
                },
              ]}
              time={time}
            />
          </Pending>
        </div>
        <div class="ln-chart lnm-chart--small">
          <Pending>
            <Chart
              label="This node's capacity, since this server's record began"
              x={x()}
              gap={DAY}
              height={140}
              left={{ format: btcAxis }}
              series={[
                {
                  name: "Capacity",
                  values: points().map((p) => p.capacity),
                  draw: "step",
                  format: formatBtc,
                  unit: "BTC",
                },
              ]}
              time={time}
            />
          </Pending>
        </div>
      </div>
      <p class="ln-coverage">Recorded since {formatMoment(first()?.time ?? MOCK_NOW)}.</p>
    </section>
  );
}
