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
import { groupDigits } from "../../../lib/format";
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
/** A cooperative close: the funding output in, two P2WPKH outputs. */
const COOP_VB = 169;

export default function MockOverviewPage() {
  usePageTitle(() => "Mockup: Lightning");
  const [search] = useSearchParams();
  const period = createMemo(
    (): Period => PERIODS.find((p) => p.id === search["period"]) ?? PERIODS[1],
  );
  return (
    <MockFrame>
      <header class="ln-head lnm-ovhead">
        <h1>Lightning</h1>
        <InvoiceSearch />
      </header>
      {/* A phone's way down a long page. */}
      <nav class="lnm-jumps" aria-label="On this page">
        <For each={JUMPS}>
          {(j) => (
            <a class="tap" href={`#${j.id}`} rel="external">
              {j.label}
            </a>
          )}
        </For>
      </nav>
      <Totals period={period()} />
      <LiveFeed />
      <Movers period={period()} />
      <Closes />
      <OverTime period={period()} />
      <TopLists />
    </MockFrame>
  );
}

const JUMPS = [
  { id: "lnm-now-title", label: "Now" },
  { id: "lnm-feed-title", label: "As it happens" },
  { id: "lnm-movers-title", label: "Movers" },
  { id: "lnm-closes-title", label: "Closes" },
  { id: "lnm-history-title", label: "Over time" },
  { id: "lnm-top-capacity-title", label: "Top nodes" },
];

const href = (id?: string) =>
  id === undefined ? mockPaths.overview() : `${mockPaths.overview()}?period=${id}`;

function Totals(props: { period: Period }) {
  const before = () => BEFORE[props.period.id];
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
          sub={<Change now={now.channels} then={before().channels} format={groupDigits} />}
        >
          <span class="num">{groupDigits(now.channels)}</span>
        </Stat>
        <Stat
          label="Nodes"
          sub={<Change now={now.nodes} then={before().nodes} format={groupDigits} />}
        >
          <span class="num">{groupDigits(now.nodes)}</span>
        </Stat>
        <Stat
          label="Capacity"
          sub={<Change now={now.capacity} then={before().capacity} format={shortBtc} />}
        >
          <Amount sats={now.capacity} short />
        </Stat>
        <Stat
          label="Median fee rate"
          sub={<Change now={now.med_fee_rate} then={before().med_fee_rate} format={ppm} />}
        >
          <span class="num">{ppm(now.med_fee_rate)}</span>
        </Stat>
        <Stat
          label="Median base fee"
          sub={
            <Change now={now.med_base_fee_msat} then={before().med_base_fee_msat} format={msat} />
          }
        >
          <span class="num">{msat(now.med_base_fee_msat)}</span>
        </Stat>
      </dl>
      <p class="lnm-opencost">
        <Icon name="swap" />
        <span>
          Opening a channel: about{" "}
          <strong class="num">{groupDigits(Math.ceil(FUNDING_VB * NEXT_BLOCK_RATE))} sats</strong>{" "}
          on chain now
        </span>
      </p>
      <p class="ln-aside">Only channels checked against the chain.</p>
      <More>
        <p>{VERIFIED_NOTE} A change compares the newest snapshot with the one a period before.</p>
        <p>
          The opening cost assumes a {FUNDING_VB} vB funding transaction (one P2WPKH input, the
          channel's P2WSH output and change) at the next block's{" "}
          <FeeRate rate={NEXT_BLOCK_RATE} up />. A cooperative close, about {COOP_VB} vB, would be
          about {groupDigits(Math.ceil(COOP_VB * NEXT_BLOCK_RATE))} sats at that rate; a force close
          and its sweeps cost more, and vary. A batch open shares one transaction and costs each
          channel less.
        </p>
      </More>
    </section>
  );
}

const MEASURES = [
  { id: "capacity", label: "Capacity" },
  { id: "channels", label: "Channels" },
] as const;
const DIRECTIONS = [
  { id: "gained", label: "Gained" },
  { id: "lost", label: "Lost" },
  { id: "net", label: "Largest either way" },
] as const;

function Movers(props: { period: Period }) {
  const [search, setSearch] = useSearchParams();
  const measure = () => MEASURES.find((m) => m.id === search["measure"])?.id ?? "capacity";
  const direction = () => DIRECTIONS.find((d) => d.id === search["moved"])?.id ?? "gained";
  const m = () => movers(props.period);
  const rows = (): Mover[] => {
    const cap = measure() === "capacity";
    const up = cap ? m().capacityUp : m().channelsUp;
    const down = cap ? m().capacityDown : m().channelsDown;
    if (direction() === "gained") return up;
    if (direction() === "lost") return down;
    return sorted([...up, ...down], (x, y) => Math.abs(y.change) - Math.abs(x.change)).slice(0, 5);
  };
  const a = () => arrivals(props.period);
  const columns = (): Column<Mover>[] => [
    { header: "Node", cell: (r) => <MockNodeName node={r} /> },
    {
      header: measure() === "capacity" ? "Net change, BTC" : "Net change, channels",
      numeric: true,
      cell: (r) => (
        <span>
          {r.change > 0 ? "+" : "−"}
          {measure() === "capacity"
            ? (Math.abs(r.change) / 1e8).toFixed(2)
            : groupDigits(Math.abs(r.change))}
        </span>
      ),
    },
    {
      header: measure() === "capacity" ? "Now, BTC" : "Now, channels",
      numeric: true,
      cell: (r) =>
        measure() === "capacity" ? <Amount sats={r.now} unit={false} short /> : groupDigits(r.now),
    },
  ];
  const arrivalColumns = (
    word: string,
  ): Column<ReturnType<typeof arrivals>["newest"][number]>[] => [
    { header: "Node", cell: (n) => <MockNodeName node={n} /> },
    { header: word, numeric: true, cell: (n) => <Ago time={n.time} /> },
    { header: "Channels", numeric: true, optional: true, cell: (n) => groupDigits(n.channels) },
  ];
  const pick = (
    choices: readonly { id: string; label: string }[],
    current: string,
    key: string,
  ) => (
    <ul>
      <For each={choices}>
        {(c) => (
          <li>
            <button
              type="button"
              class="ln-picker__item"
              aria-pressed={current === c.id ? "true" : "false"}
              onClick={() => setSearch({ [key]: c.id }, { replace: true })}
            >
              {c.label}
            </button>
          </li>
        )}
      </For>
    </ul>
  );
  return (
    <section aria-labelledby="lnm-movers-title">
      <SectionHeader title="Movers" id="lnm-movers-title">
        Net change, {props.period.words}
      </SectionHeader>
      <div class="lnm-map-controls">
        <div class="ln-picker" role="group" aria-label="Measure">
          {pick(MEASURES, measure(), "measure")}
        </div>
        <div class="ln-picker" role="group" aria-label="Which way">
          {pick(DIRECTIONS, direction(), "moved")}
        </div>
      </div>
      <DataTable
        caption={`Nodes by net change in ${measure()}, ${props.period.words}`}
        columns={columns()}
        rows={rows()}
      />
      <div class="lnm-movers lnm-movers--pair">
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
        {/* One tab stop: the arrow keys move between days. */}
        <div
          class="lnm-bars__plot"
          role="toolbar"
          tabindex="-1"
          aria-label="Days, oldest first"
          onKeyDown={(e) => {
            const step =
              e.key === "ArrowRight"
                ? 1
                : e.key === "ArrowLeft"
                  ? -1
                  : e.key === "Home"
                    ? -99
                    : e.key === "End"
                      ? 99
                      : 0;
            if (step === 0) return;
            e.preventDefault();
            const next = Math.max(0, Math.min(days.length - 1, at() + step));
            setAt(next);
            (e.currentTarget.children[next] as HTMLElement | undefined)?.focus();
          }}
        >
          <For each={days}>
            {(d, i) => (
              <button
                type="button"
                class={["lnm-bars__day", { "lnm-bars__day--at": at() === i() }]}
                aria-label={`${formatDay(d.day)}: ${KINDS.map((k) => `${d[k]} ${KIND_LABEL[k].word.toLowerCase()}`).join(", ")}`}
                aria-pressed={at() === i() ? "true" : "false"}
                tabindex={at() === i() ? 0 : -1}
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
    <section id="history" class="ln-history lnm-neutral-charts" aria-labelledby="lnm-history-title">
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
                format: (v) => (v / 1e8).toFixed(2),
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
