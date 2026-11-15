// Mockup: the Lightning overview for operators. Totals with their change over a period, what an
// open costs now, the network as it changes, the period's movers, closes by kind per day, the
// shipped chart and top lists, and an invoice reader.
import { sorted } from "../../../components/chart/geometry";
import { useSearchParams } from "@solidjs/router";
import { createMemo, createSignal, For, lazy, Loading as Pending, onSettled, Show } from "solid-js";
import { Amount } from "../../../components/Amount";
import { formatDay, formatMoment } from "../../../components/chart/scale";
import "../../../components/chart/Chart.css";
import { type Column, DataTable } from "../../../components/DataTable";
import { FeeRate } from "../../../components/FeeRate";
import { Link } from "../../../components/Link";
import { More } from "../../../components/More";
import { Periods } from "../../../components/Periods";
import { SectionHeader } from "../../../components/SectionHeader";
import { formatBtc, groupDigits } from "../../../lib/format";
import { paths } from "../../../lib/network";
import { usePageTitle } from "../../../lib/page";
import { btcAxis, msat, ppm, type RankedNode } from "../lightning";
import { Stat, VERIFIED_NOTE } from "../parts";
import { InvoiceSearch } from "./Invoice";
import { LiveFeed } from "./LiveFeed";
import { Change } from "./NodePage";
import {
  arrivals,
  BEFORE,
  closesPerDay,
  type DayCloses,
  type Mover,
  movers,
  now,
  type Period,
  PERIODS,
  series,
} from "./overview";
import { Ago, Icon, KIND_LABEL, MockFrame, MockNodeName, mockPaths, shortBtc } from "./parts";
import { recordedOverview } from "./sample";

const Chart = lazy(() => import("../../../components/chart/Chart"));

/** A funding transaction's size: one P2WPKH input, the P2WSH channel output and change. */
const FUNDING_VB = 154;
/** The next block's fee rate in the samples: late-2026 levels, most traffic under 1 sat/vB. */
const NEXT_BLOCK_RATE = 0.82;

export default function MockOverviewPage() {
  usePageTitle(() => "Mockup: Lightning");
  const [search] = useSearchParams();
  const period = createMemo(
    (): Period => PERIODS.find((p) => p.id === search["period"]) ?? PERIODS[1],
  );
  return (
    <MockFrame>
      <header class="ln-head">
        <h1>Lightning</h1>
      </header>
      <InvoiceSearch />
      <Totals period={period()} />
      <LiveFeed />
      <Movers period={period()} />
      <Closes />
      <OverTime period={period()} />
      <TopLists />
    </MockFrame>
  );
}

const href = (id?: string) =>
  id === undefined ? mockPaths.overview() : `${mockPaths.overview()}?period=${id}`;

function Totals(props: { period: Period }) {
  const before = () => BEFORE[props.period.id];
  const days = () => props.period.days;
  return (
    <section aria-labelledby="lnm-now-title">
      <SectionHeader title="The network now" id="lnm-now-title">
        As of {formatMoment(now.time)}
      </SectionHeader>
      <div class="ln-section-head">
        <Periods choices={PERIODS} current={props.period.id} fitted={false} href={href} />
      </div>
      <dl class="ln-stats">
        <Stat
          label="Channels"
          sub={
            <Change
              now={now.channels}
              then={before().channels}
              format={groupDigits}
              days={days()}
            />
          }
        >
          <span class="num">{groupDigits(now.channels)}</span>
        </Stat>
        <Stat
          label="Nodes"
          sub={<Change now={now.nodes} then={before().nodes} format={groupDigits} days={days()} />}
        >
          <span class="num">{groupDigits(now.nodes)}</span>
        </Stat>
        <Stat
          label="Capacity"
          sub={
            <Change now={now.capacity} then={before().capacity} format={shortBtc} days={days()} />
          }
        >
          <Amount sats={now.capacity} short />
        </Stat>
        <Stat
          label="Median fee rate"
          sub={
            <Change
              now={now.med_fee_rate}
              then={before().med_fee_rate}
              format={ppm}
              days={days()}
            />
          }
        >
          <span class="num">{ppm(now.med_fee_rate)}</span>
        </Stat>
        <Stat
          label="Median base fee"
          sub={
            <Change
              now={now.med_base_fee_msat}
              then={before().med_base_fee_msat}
              format={msat}
              days={days()}
            />
          }
        >
          <span class="num">{msat(now.med_base_fee_msat)}</span>
        </Stat>
      </dl>
      <p class="lnm-opencost">
        <Icon name="swap" />
        <span>
          Opening a channel now costs about{" "}
          <strong class="num">{groupDigits(Math.ceil(FUNDING_VB * NEXT_BLOCK_RATE))} sats</strong>{" "}
          on chain: a {FUNDING_VB} vB funding transaction at the next block's{" "}
          <FeeRate rate={NEXT_BLOCK_RATE} up />. Closing it costs about as much again.
        </span>
      </p>
      <p class="ln-aside">Only channels checked against the chain are counted.</p>
      <More>
        <p>
          {VERIFIED_NOTE} A change compares the newest snapshot with the one a period before. The
          cost of an open assumes one ordinary input and change; a batch open shares one transaction
          between several channels and costs each less.
        </p>
      </More>
    </section>
  );
}

function MoverTable(props: {
  title: string;
  rows: Mover[];
  unit: "capacity" | "channels";
  id: string;
}) {
  const columns: Column<Mover>[] = [
    { header: "Node", cell: (m) => <MockNodeName node={m} /> },
    {
      header: props.unit === "capacity" ? "Change, BTC" : "Change",
      numeric: true,
      cell: (m) => (
        <span>
          {m.change > 0 ? "+" : "−"}
          {props.unit === "capacity"
            ? formatBtc(Math.abs(m.change)).replace(/\.?0+$/, "")
            : groupDigits(Math.abs(m.change))}
        </span>
      ),
    },
    {
      header: props.unit === "capacity" ? "Now, BTC" : "Now",
      numeric: true,
      optional: true,
      cell: (m) =>
        props.unit === "capacity" ? <Amount sats={m.now} unit={false} short /> : groupDigits(m.now),
    },
  ];
  return (
    <div class="lnm-mover">
      <h3 id={props.id}>{props.title}</h3>
      <DataTable caption={props.title} columns={columns} rows={props.rows} />
    </div>
  );
}

function Movers(props: { period: Period }) {
  const m = () => movers(props.period);
  const a = () => arrivals(props.period);
  const arrivalColumns = (
    word: string,
  ): Column<ReturnType<typeof arrivals>["newest"][number]>[] => [
    { header: "Node", cell: (n) => <MockNodeName node={n} /> },
    { header: word, numeric: true, cell: (n) => <Ago time={n.time} /> },
    { header: "Channels", numeric: true, optional: true, cell: (n) => groupDigits(n.channels) },
  ];
  return (
    <section aria-labelledby="lnm-movers-title">
      <SectionHeader title="Movers" id="lnm-movers-title">
        Over {props.period.words}
      </SectionHeader>
      <div class="lnm-movers">
        <MoverTable
          id="lnm-m1"
          title="Most capacity gained"
          rows={m().capacityUp}
          unit="capacity"
        />
        <MoverTable
          id="lnm-m2"
          title="Most capacity lost"
          rows={m().capacityDown}
          unit="capacity"
        />
        <MoverTable
          id="lnm-m3"
          title="Most channels gained"
          rows={m().channelsUp}
          unit="channels"
        />
        <MoverTable
          id="lnm-m4"
          title="Most channels lost"
          rows={m().channelsDown}
          unit="channels"
        />
        <div class="lnm-mover">
          <h3>Newest nodes</h3>
          <DataTable
            caption="Newest nodes"
            columns={arrivalColumns("First channel")}
            rows={a().newest}
          />
        </div>
        <div class="lnm-mover">
          <h3>Nodes that left</h3>
          <DataTable
            caption="Nodes that left"
            columns={arrivalColumns("Last channel closed")}
            rows={a().gone}
          />
        </div>
      </div>
      <p class="ln-aside">
        A node leaves when its last public channel closes; it may still run with private channels.
      </p>
    </section>
  );
}

const KINDS = ["cooperative", "force", "penalty", "other"] as const;

function Closes() {
  const days = closesPerDay();
  const [at, setAt] = createSignal(days.length - 1);
  const [figures, setFigures] = createSignal(false);
  const total = (d: DayCloses) => d.cooperative + d.force + d.penalty + d.other;
  const most = Math.max(...days.map((d) => total(d)));
  const top = Math.ceil(most / 100) * 100;
  const day = () => days[at()] ?? days.at(-1);
  const sums = KINDS.map((k) => days.reduce((s, d) => s + d[k], 0));
  return (
    <section aria-labelledby="lnm-closes-title">
      <SectionHeader title="Closes by kind" id="lnm-closes-title">
        <Link href={mockPaths.penalties()}>{groupDigits(sums[2] ?? 0)} penalties in 30 days</Link>
      </SectionHeader>
      <p class="lnm-readout lnm-readout--chart">
        <strong>{day() ? formatDay(day()?.day ?? 0) : ""}</strong>
        <For each={KINDS}>
          {(k) => (
            <span class={`lnm-tag lnm-tag--${KIND_LABEL[k].tone}`}>
              <span class={`lnm-key__swatch lnm-kind-${k}`} aria-hidden="true" />
              {KIND_LABEL[k].word} <span class="num">{groupDigits(day()?.[k] ?? 0)}</span>
            </span>
          )}
        </For>
      </p>
      <div class="lnm-bars" role="group" aria-label="Closes per day, the last 30 days">
        <span class="lnm-bars__axis num" aria-hidden="true">
          <span>{groupDigits(top)}</span>
          <span>{groupDigits(top / 2)}</span>
          <span>0</span>
        </span>
        <div class="lnm-bars__plot">
          <For each={days}>
            {(d, i) => (
              <button
                type="button"
                class={["lnm-bars__day", { "lnm-bars__day--at": at() === i() }]}
                aria-label={`${formatDay(d.day)}: ${KINDS.map((k) => `${d[k]} ${KIND_LABEL[k].word.toLowerCase()}`).join(", ")}`}
                aria-pressed={at() === i() ? "true" : "false"}
                onPointerEnter={() => setAt(i())}
                onFocus={() => setAt(i())}
                onClick={() => setAt(i())}
              >
                <For each={KINDS}>
                  {(k) => (
                    <Show when={d[k] > 0}>
                      <span
                        class={`lnm-bars__seg lnm-kind-${k}`}
                        style={{ "--h": String(d[k] / top) }}
                      />
                    </Show>
                  )}
                </For>
              </button>
            )}
          </For>
        </div>
      </div>
      <p class="lnm-bars__ends num" aria-hidden="true">
        <span>{formatDay(days[0]?.day ?? 0)}</span>
        <span>{formatDay(days.at(-1)?.day ?? 0)}</span>
      </p>
      <p class="ln-aside">
        In 30 days:{" "}
        {KINDS.map(
          (k, i) => `${groupDigits(sums[i] ?? 0)} ${KIND_LABEL[k].word.toLowerCase()}`,
        ).join(", ")}
        . Penalties are a sliver even when they happen; the figures name each day's.
      </p>
      <details class="chart__figures" onToggle={(e) => setFigures(e.currentTarget.open)}>
        <summary>Show the figures</summary>
        <Show when={figures()}>
          <DataTable
            caption="Closes per day by kind"
            columns={[
              { header: "Day", cell: (d: DayCloses) => formatDay(d.day) },
              ...KINDS.map((k) => ({
                header: KIND_LABEL[k].word,
                numeric: true,
                cell: (d: DayCloses) => groupDigits(d[k]),
              })),
            ]}
            rows={sorted(days, (a, b) => b.day - a.day)}
          />
        </Show>
      </details>
    </section>
  );
}

function OverTime(props: { period: Period }) {
  onSettled(() => void Chart.preload());
  const s = () => series(props.period);
  return (
    <section id="history" class="ln-history" aria-labelledby="lnm-history-title">
      <SectionHeader title="Over time" id="lnm-history-title">
        The shipped chart, on sample data
      </SectionHeader>
      <div class="ln-chart">
        <Pending>
          <Chart
            label={`Lightning channels and capacity, ${props.period.words}`}
            x={s().points.map((p) => p.time)}
            gap={s().step}
            height={240}
            left={{ format: (v) => groupDigits(v) }}
            right={{ format: btcAxis }}
            series={[
              {
                name: "Channels",
                values: s().points.map((p) => p.channels),
                draw: "area",
                format: groupDigits,
                marks: true,
              },
              {
                name: "Capacity",
                values: s().points.map((p) => p.capacity),
                draw: "line",
                axis: "right",
                tone: 2,
                format: formatBtc,
                unit: "BTC",
                marks: true,
              },
            ]}
            notes={[
              { name: "Nodes", values: s().points.map((p) => p.nodes), format: groupDigits },
              {
                name: "Median fee rate",
                values: s().points.map((p) => p.med_fee_rate),
                format: ppm,
              },
            ]}
            time={formatMoment}
          />
        </Pending>
      </div>
    </section>
  );
}

function TopLists() {
  const columns = (by: "capacity" | "channels"): Column<RankedNode>[] => [
    { header: "Node", cell: (n) => <MockNodeName node={n} /> },
    {
      header: "Capacity, BTC",
      numeric: true,
      optional: by === "channels",
      cell: (n) => <Amount sats={n.capacity} unit={false} short />,
    },
    {
      header: "Channels",
      numeric: true,
      optional: by !== "channels",
      cell: (n) => groupDigits(n.channels),
    },
  ];
  return (
    <div class="ln-pair">
      <section aria-labelledby="lnm-top-capacity-title">
        <SectionHeader title="Largest nodes" id="lnm-top-capacity-title">
          <Link href={paths.lightningRankings("capacity")}>Top 100</Link>
        </SectionHeader>
        <DataTable
          caption="The five nodes with the most capacity"
          columns={columns("capacity")}
          rows={recordedOverview.top_capacity.slice(0, 5)}
        />
      </section>
      <section aria-labelledby="lnm-top-channels-title">
        <SectionHeader title="Most connected nodes" id="lnm-top-channels-title">
          <Link href={paths.lightningRankings("channels")}>Top 100</Link>
        </SectionHeader>
        <DataTable
          caption="The five nodes with the most channels"
          columns={columns("channels")}
          rows={recordedOverview.top_channels.slice(0, 5)}
        />
      </section>
    </div>
  );
}
