// Mockup: a node's closed channels, its fee rates (a bar opens the channels in that row) and its
// past, the shipped chart unchanged.
import { useNavigate } from "@solidjs/router";
import { For, lazy, Loading as Pending, onSettled, Show } from "solid-js";
import { Amount } from "../../../components/Amount";
import { formatDay, formatMoment } from "../../../components/chart/scale";
import "../../../components/chart/Chart.css";
import { Hash } from "../../../components/Hash";
import { More } from "../../../components/More";
import { SectionHeader } from "../../../components/SectionHeader";
import { Empty } from "../../../components/States";
import { formatBtc, groupDigits } from "../../../lib/format";
import { onNetwork } from "../../../lib/network";
import { useNetwork } from "../../../lib/page";
import { btcAxis, feeSentence, type FeeRow } from "../lightning";
import { type FeeSummary, feeRowsOf, summary, type Way } from "./fees";
import { duration, KindTag, MockChannelLink, mockPaths, PeerName } from "./parts";
import { MOCK_NOW, type SampleNode } from "./sample";

const Chart = lazy(() => import("../../../components/chart/Chart"));
const DAY = 86_400;

export function NodeClosed(props: { node: SampleNode }) {
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
        <div class="table-scroll">
          <table class="table lnm-table">
            <caption class="visually-hidden">Its closed channels, newest close first</caption>
            <thead>
              <tr>
                <th scope="col">Peer and channel</th>
                <th scope="col">Kind</th>
                <th scope="col" class="table__num">
                  Capacity, BTC
                </th>
                <th scope="col" class="table__num table__optional">
                  Closing fee, sats
                </th>
                <th scope="col" class="table__num table__optional">
                  Lived
                </th>
                <th scope="col" class="table__optional">
                  Closing transaction
                </th>
                <th scope="col" class="table__num">
                  Closed
                </th>
              </tr>
            </thead>
            <tbody>
              <For each={props.node.closed}>
                {(c) => (
                  <tr>
                    <td>
                      <span class="ln-ends">
                        <PeerName peer={c.peer} />
                        <MockChannelLink id={c.id} />
                      </span>
                    </td>
                    <td>
                      <span class="ln-ends">
                        <KindTag kind={c.kind} />
                        <Show when={c.continued}>
                          {(n) => (
                            <span class="lnm-continued">
                              Continued as <MockChannelLink id={n()} />
                            </span>
                          )}
                        </Show>
                      </span>
                    </td>
                    <td class="table__num">
                      <Amount sats={c.capacity} unit={false} short />
                    </td>
                    <td class="table__num table__optional">{groupDigits(c.fee)}</td>
                    <td class="table__num table__optional">{duration(c.closedTime - c.opened)}</td>
                    <td class="table__optional">
                      <Hash value={c.txid} copyLabel="Copy closing transaction ID" />
                    </td>
                    <td class="table__num">
                      {formatDay(c.closedTime)}
                      <span class="ln-row-when lnm-under">Block {groupDigits(c.closedHeight)}</span>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>
      <More label="How a close is told apart">
        <p>
          The closing transaction says how a channel ended. A force close is a commitment
          transaction one end broadcast alone; a penalty is a force close of an old state that the
          other end swept with its revocation key. A cooperative close spends the channel alone and
          is not a commitment. "Continued as" means the closing transaction funded a new channel
          between the same two nodes: a splice, not an ending. "Other" spends more than the channel,
          most likely a splice that added funds.
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
  const channelAxis = () =>
    Math.max(...points().map((p) => p.channels)) <= 4
      ? { domain: [0, 4] as const, format: groupDigits }
      : { zero: true, format: groupDigits };
  return (
    <section aria-labelledby="lnm-history-title">
      <SectionHeader title="Over time" id="lnm-history-title">
        Each change and midnight UTC
      </SectionHeader>
      <p class="ln-coverage">Recorded since {formatMoment(points()[0]?.time ?? MOCK_NOW)}.</p>
      <div class="ln-chart ln-chart--node">
        <Pending>
          <Chart
            label="This node's channels and capacity, since this server's record began"
            x={points().map((p) => p.time)}
            gap={DAY}
            height={200}
            left={channelAxis()}
            right={{ zero: true, format: btcAxis }}
            series={[
              {
                name: "Channels",
                values: points().map((p) => p.channels),
                draw: "step-area",
                format: groupDigits,
              },
              {
                name: "Capacity",
                values: points().map((p) => p.capacity),
                draw: "step",
                axis: "right",
                tone: 2,
                format: formatBtc,
                unit: "BTC",
              },
            ]}
            time={(t) => (t % DAY === 0 ? formatDay(t) : formatMoment(t))}
          />
        </Pending>
      </div>
    </section>
  );
}
