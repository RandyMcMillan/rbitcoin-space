// Mockup: a Lightning channel page for operators. Its id in every written form, the two lanes that
// say whose fee is whose, what a payment costs each way, the two policies side by side, the
// channel's life as a timeline, and each direction's fee over time.
import { sorted } from "../../../components/chart/geometry";
import { useParams } from "@solidjs/router";
import { createMemo, createSignal, For, lazy, Loading as Pending, onSettled, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import { Amount, Sats } from "../../../components/Amount";
import { formatDay, formatMoment } from "../../../components/chart/scale";
import "../../../components/chart/Chart.css";
import { CopyButton } from "../../../components/CopyButton";
import { Hash } from "../../../components/Hash";
import { Link } from "../../../components/Link";
import { More } from "../../../components/More";
import { SectionHeader } from "../../../components/SectionHeader";
import { Empty } from "../../../components/States";
import { formatUtc, groupDigits } from "../../../lib/format";
import { paths } from "../../../lib/network";
import { usePageTitle } from "../../../lib/page";
import { CLOSE_WORDS, cleanAlias, cut, msatShort } from "../lightning";
import { Alias, Msat } from "../parts";
import {
  CHANNEL_SAMPLES,
  type ChannelEnd,
  KEPT_CHANGES,
  type SampleChannel,
  sampleChannel,
} from "./channels";
import {
  Ago,
  duration,
  Icon,
  KindTag,
  MockChannelLink,
  MockFrame,
  MockNodeName,
  STATE_LABEL,
  StateTag,
} from "./parts";
import { MOCK_NOW, type Policy } from "./sample";

const Chart = lazy(() => import("../../../components/chart/Chart"));

export default function MockChannelPage() {
  const params = useParams<{ id: string }>();
  const channel = createMemo(() => sampleChannel(params.id ?? ""));
  usePageTitle(() => `Mockup: channel ${params.id ?? ""}`);
  return (
    <MockFrame>
      <Show
        when={channel()}
        fallback={
          <>
            <h1>Lightning channel</h1>
            <Empty title="Not one of the sample channels">
              Every channel of the two sample nodes opens here; the three made to show a channel's
              life are{" "}
              <For each={CHANNEL_SAMPLES}>
                {(id, i) => (
                  <>
                    {i() > 0 ? ", " : ""}
                    <MockChannelLink id={id} />
                  </>
                )}
              </For>
              . On the real site this is the page for a channel the server does not hold.
            </Empty>
          </>
        }
      >
        {(c) => <Body channel={c()} />}
      </Show>
    </MockFrame>
  );
}

const name = (n: { alias: string | null }) => cut(cleanAlias(n.alias) ?? "Unnamed node", 24).text;

function Body(props: { channel: SampleChannel }) {
  const c = () => props.channel;
  const [h, i, o] = c().id.split("x");
  return (
    <>
      <header class="ln-identity lnm-head">
        <div class="lnm-head__title">
          <h1>
            Channel <span class="num">{c().id}</span>
          </h1>
          <Show
            when={c().closed}
            fallback={
              <StateTag
                state={
                  c().state === "closed"
                    ? "inactive"
                    : (c().state as Exclude<SampleChannel["state"], "closed">)
                }
              />
            }
          >
            {(x) => (
              <span class="ln-badge ln-badge--closed">
                {c().penalty
                  ? "Closed by a penalty"
                  : x().kind === "cooperative" && c().continued
                    ? "Spliced"
                    : `Closed, ${CLOSE_WORDS[x().kind].name.toLowerCase()}`}
              </span>
            )}
          </Show>
        </div>
        <dl class="ln-stats lnm-chanfacts">
          <div class="ln-stat">
            <dt class="ln-stat__label">Capacity</dt>
            <dd class="ln-stat__value">
              <Amount sats={c().capacity} short />
            </dd>
          </div>
          <div class="ln-stat">
            <dt class="ln-stat__label">{c().closed ? "Lived" : "Age"}</dt>
            <dd class="ln-stat__value">
              <span class="num">{duration((c().closed?.time ?? MOCK_NOW) - c().funded.time)}</span>
              <span class="ln-stat__sub">Funded {formatDay(c().funded.time)}</span>
            </dd>
          </div>
        </dl>
        <dl class="lnm-ids lnm-ids--three">
          <IdForm label="Block, transaction, output" value={c().id} />
          <IdForm label="As one number" value={c().scid} />
          <IdForm label="Colon form (lnd)" value={`${h ?? ""}:${i ?? ""}:${o ?? ""}`} />
        </dl>
      </header>
      <Lanes channel={c()} />
      <Show when={!c().closed}>
        <Cost channel={c()} />
      </Show>
      <Policies channel={c()} />
      <Life channel={c()} />
      <FeeHistory channel={c()} />
    </>
  );
}

function IdForm(props: { label: string; value: string }) {
  return (
    <div>
      <dt>{props.label}</dt>
      <dd>
        <span class="lnm-connect">
          <span class="mono">{props.value}</span>
          <CopyButton
            value={props.value}
            label={`Copy the channel id, ${props.label.toLowerCase()}`}
          />
        </span>
      </dd>
    </div>
  );
}

/**
 * The two lanes: one per direction, each saying in words which end charges and what. An end's
 * policy is what it charges to forward a payment out over this channel, towards the other end.
 */
function Lanes(props: { channel: SampleChannel }) {
  const c = () => props.channel;
  return (
    <section aria-labelledby="lnm-lanes-title">
      <SectionHeader title="Who charges what" id="lnm-lanes-title">
        <Show when={c().closed} fallback="Each end sets the fee for its own direction">
          The last policies before it closed
        </Show>
      </SectionHeader>
      <div class="lnm-lanes">
        <div class="lnm-end lnm-end--one">
          <span class="lnm-end__tag">Node one</span>
          <MockNodeName node={c().one.node} />
        </div>
        <div class="lnm-end lnm-end--two">
          <span class="lnm-end__tag">Node two</span>
          <MockNodeName node={c().two.node} />
        </div>
        <ol class="lnm-lanes__list">
          <Lane from={c().one} to={c().two} tone={1} closed={c().closed !== null} />
          <Lane from={c().two} to={c().one} tone={2} closed={c().closed !== null} />
        </ol>
      </div>
      <More label="Why this matters">
        <p>
          A payment pays the fee of the node that forwards it. On this channel{" "}
          <bdi>{name(c().one.node)}</bdi> sets the price of sending towards{" "}
          <bdi>{name(c().two.node)}</bdi>, and <bdi>{name(c().two.node)}</bdi> the price of the
          other way. So the fee a node "charges" on a channel is never what it pays to receive over
          it.
        </p>
      </More>
    </section>
  );
}

function Lane(props: { from: ChannelEnd; to: ChannelEnd; tone: 1 | 2; closed: boolean }) {
  const p = () => props.from.policy;
  const open = () => !props.closed && p()?.enabled === true;
  return (
    <li class={["lnm-lane", `lnm-lane--${props.tone}`, { "lnm-lane--shut": !open() }]}>
      <div class="lnm-lane__track" aria-hidden="true">
        <span class="lnm-lane__line" />
        <span class="lnm-lane__head" />
        <Show when={!open()}>
          <span class="lnm-lane__gate">
            <Icon name="pause" />
          </span>
        </Show>
      </div>
      <p class="lnm-lane__who">
        <strong>
          <bdi>{name(props.from.node)}</bdi>
        </strong>{" "}
        {props.closed ? "charged" : "charges"} to forward towards <bdi>{name(props.to.node)}</bdi>
      </p>
      <Show when={p()} fallback={<p class="lnm-lane__fee muted">No policy: it has not said</p>}>
        {(pol) => (
          <>
            <p class="lnm-lane__fee num">
              {groupDigits(pol().fee_rate)} ppm
              <span class="lnm-lane__plus"> + </span>
              <Msat msat={pol().base_fee_msat} what="base fee" />
            </p>
            <p class="lnm-lane__note">
              <Show
                when={open()}
                fallback={
                  <span class="lnm-tag lnm-tag--caution">
                    <Icon name="pause" />
                    {props.closed ? "Closed" : `Disabled: it forwards nothing this way`}
                  </span>
                }
              >
                Time lock {groupDigits(pol().cltv_delta)} blocks, up to{" "}
                {msatShort(pol().max_htlc_msat)} a payment
              </Show>
            </p>
          </>
        )}
      </Show>
    </li>
  );
}

const fee = (p: Policy, sats: number) => p.base_fee_msat / 1000 + (sats * p.fee_rate) / 1_000_000;
const formatFeeSats = (sats: number) =>
  sats >= 100 ? `${groupDigits(Math.round(sats))} sats` : `${Number(sats.toFixed(3))} sats`;

function Cost(props: { channel: SampleChannel }) {
  const [amount, setAmount] = createSignal(100_000);
  const valid = () => Number.isFinite(amount()) && amount() > 0;
  const ways = () => [
    { from: props.channel.one, to: props.channel.two, tone: 1 },
    { from: props.channel.two, to: props.channel.one, tone: 2 },
  ];
  return (
    <section aria-labelledby="lnm-cost-title">
      <SectionHeader title="What it costs to send" id="lnm-cost-title" />
      <div class="lnm-cost">
        <label class="lnm-cost__field">
          <span>Amount</span>
          <span class="lnm-cost__input">
            <input
              class="lnm-input num"
              type="text"
              inputmode="numeric"
              value={groupDigits(amount())}
              aria-describedby="lnm-cost-formula"
              onInput={(e) => setAmount(Number(e.currentTarget.value.replaceAll(/[^\d]/g, "")))}
            />
            <span class="unit">sats</span>
          </span>
        </label>
        <p class="lnm-cost__formula" id="lnm-cost-formula">
          Fee = base fee + amount × fee rate ÷ 1 000 000
        </p>
        <ul class="lnm-cost__ways" aria-live="polite">
          <For each={ways()}>
            {(w) => (
              <li class={`lnm-cost__way lnm-lane--${w.tone}`}>
                <span class="lnm-cost__dir">
                  <bdi>{name(w.from.node)}</bdi> → <bdi>{name(w.to.node)}</bdi>
                </span>
                <Show
                  when={valid() && w.from.policy?.enabled ? w.from.policy : undefined}
                  fallback={
                    <span class="muted">
                      {valid() ? "Not forwarded: disabled" : "Type an amount"}
                    </span>
                  }
                >
                  {(p) => (
                    <>
                      <strong class="lnm-cost__fee num">{formatFeeSats(fee(p(), amount()))}</strong>
                      <span class="lnm-cost__work num">
                        {Number((p().base_fee_msat / 1000).toFixed(3))} + {groupDigits(amount())} ×{" "}
                        {groupDigits(p().fee_rate)} ÷ 1 000 000
                      </span>
                      <Show when={amount() * 1000 > p().max_htlc_msat}>
                        <span class="lnm-tag lnm-tag--caution">
                          <Icon name="warn" />
                          Over its largest payment, {msatShort(p().max_htlc_msat)}
                        </span>
                      </Show>
                    </>
                  )}
                </Show>
              </li>
            )}
          </For>
        </ul>
      </div>
    </section>
  );
}

interface Term {
  label: string;
  cell: (p: Policy) => JSX.Element;
  diff: (a: Policy, b: Policy, one: string, two: string) => string;
}

const higher = (a: number, b: number, one: string, two: string, f: (n: number) => string) =>
  a === b ? "Same" : `${a > b ? one : two} +${f(Math.abs(a - b))}`;

const TERMS: Term[] = [
  {
    label: "Fee rate",
    cell: (p) => <span class="num">{groupDigits(p.fee_rate)} ppm</span>,
    diff: (a, b, one, two) =>
      higher(a.fee_rate, b.fee_rate, one, two, (n) => `${groupDigits(n)} ppm`),
  },
  {
    label: "Base fee",
    cell: (p) => <Msat msat={p.base_fee_msat} what="base fee" />,
    diff: (a, b, one, two) => higher(a.base_fee_msat, b.base_fee_msat, one, two, msatShort),
  },
  {
    label: "CLTV delta",
    cell: (p) => <span class="num">{groupDigits(p.cltv_delta)} blocks</span>,
    diff: (a, b, one, two) =>
      higher(a.cltv_delta, b.cltv_delta, one, two, (n) => `${groupDigits(n)} blocks`),
  },
  {
    label: "Min HTLC",
    cell: (p) => <Msat msat={p.min_htlc_msat} what="smallest payment" />,
    diff: (a, b, one, two) => higher(a.min_htlc_msat, b.min_htlc_msat, one, two, msatShort),
  },
  {
    label: "Max HTLC",
    cell: (p) => <Msat msat={p.max_htlc_msat} what="largest payment" />,
    diff: (a, b, one, two) => higher(a.max_htlc_msat, b.max_htlc_msat, one, two, msatShort),
  },
  {
    label: "Enabled",
    cell: (p) => (p.enabled ? "Yes" : "No"),
    diff: (a, b) => (a.enabled === b.enabled ? (a.enabled ? "Both" : "Neither") : "One way only"),
  },
  {
    label: "Last update",
    cell: (p) => <Ago time={p.last_update} />,
    diff: (a, b, one, two) =>
      a.last_update === b.last_update
        ? "Same"
        : `${a.last_update > b.last_update ? one : two} newer`,
  },
];

function Policies(props: { channel: SampleChannel }) {
  const one = () => props.channel.one;
  const two = () => props.channel.two;
  const diff = (t: Term) => {
    const a = one().policy;
    const b = two().policy;
    return a && b ? t.diff(a, b, name(one().node), name(two().node)) : "–";
  };
  return (
    <section aria-labelledby="lnm-policies-title">
      <SectionHeader title="Policies side by side" id="lnm-policies-title" />
      <div class="table-scroll">
        <table class="table lnm-table lnm-policies">
          <caption class="visually-hidden">
            Each end's forwarding policy, and how they differ
          </caption>
          <thead>
            <tr>
              <th scope="col">Term</th>
              <th scope="col" class="table__num">
                <Alias alias={one().node.alias} max={16} />
              </th>
              <th scope="col" class="table__num">
                <Alias alias={two().node.alias} max={16} />
              </th>
              <th scope="col" class="table__num table__optional">
                Difference
              </th>
            </tr>
          </thead>
          <tbody>
            <For each={TERMS}>
              {(t) => (
                <tr>
                  <th scope="row">
                    {t.label}
                    {/* A phone has no room for the fourth column: the difference sits under the term. */}
                    <span class="lnm-diff-under">{diff(t)}</span>
                  </th>
                  <td class="table__num">{one().policy ? t.cell(one().policy as Policy) : "–"}</td>
                  <td class="table__num">{two().policy ? t.cell(two().policy as Policy) : "–"}</td>
                  <td class="table__num table__optional lnm-diff">{diff(t)}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Life(props: { channel: SampleChannel }) {
  const c = () => props.channel;
  const changes = () => c().one.changeCount + c().two.changeCount;
  return (
    <section aria-labelledby="lnm-life-title">
      <SectionHeader title="Life of the channel" id="lnm-life-title" />
      <ol class="lnm-life">
        <Step title="Funded" time={c().funded.time}>
          <span>
            Block{" "}
            <Link class="num" href={paths.block(c().funded.height)}>
              {groupDigits(c().funded.height)}
            </Link>
            , on-chain fee <Sats sats={c().funded.fee} />
          </span>
          <Hash value={c().funded.txid} copyLabel="Copy funding transaction ID" />
          <Show when={c().funded.batch > 0}>
            <span>
              Opened with {c().funded.batch}{" "}
              {c().funded.batch === 1 ? "other channel" : "other channels"} in one transaction
            </span>
          </Show>
          <Show when={c().funded.continues}>
            {(id) => (
              <span>
                Funded by the close of <MockChannelLink id={id()} />: a splice
              </span>
            )}
          </Show>
        </Step>
        <Step title="Checked by this server" time={c().verified}>
          <span>
            Its funding output found unspent, six blocks deep, paying the two announced keys
          </span>
        </Step>
        <Step title={`${groupDigits(changes())} fee changes`} time={null}>
          <span>
            <bdi>{name(c().one.node)}</bdi> {groupDigits(c().one.changeCount)},{" "}
            <bdi>{name(c().two.node)}</bdi> {groupDigits(c().two.changeCount)}; the latest{" "}
            <Ago
              time={Math.max(c().one.policy?.last_update ?? 0, c().two.policy?.last_update ?? 0)}
            />
          </span>
        </Step>
        <Show
          when={c().closed}
          fallback={
            <Step title="Open now" time={null} current>
              <span>
                {duration(MOCK_NOW - c().funded.time)} old,{" "}
                {STATE_LABEL[
                  c().state === "closed" ? "inactive" : (c().state as "active")
                ].word.toLowerCase()}
              </span>
            </Step>
          }
        >
          {(x) => (
            <Step title="Closed" time={x().time} last={!c().penalty && !c().continued}>
              <KindTag kind={x().kind} long />
              <span>
                Block{" "}
                <Link class="num" href={paths.block(x().height)}>
                  {groupDigits(x().height)}
                </Link>
                , closing fee <Sats sats={x().fee} />
              </span>
              <Hash value={x().txid} copyLabel="Copy closing transaction ID" />
            </Step>
          )}
        </Show>
        <Show when={c().penalty}>
          {(p) => (
            <Step title="Penalty swept" time={p().time} last>
              <KindTag kind="penalty" />
              <span>
                Three blocks later, in block{" "}
                <Link class="num" href={paths.block(p().height)}>
                  {groupDigits(p().height)}
                </Link>
                : the cheated end, whichever it was, took the whole channel with its revocation key
              </span>
              <Hash value={p().txid} copyLabel="Copy penalty transaction ID" />
            </Step>
          )}
        </Show>
        <Show when={c().continued}>
          {(id) => (
            <Step title="Continued as a new channel" time={c().closed?.time ?? null} last>
              <span>
                The closing transaction funded <MockChannelLink id={id()} /> between the same two
                nodes: the channel was spliced, not ended
              </span>
            </Step>
          )}
        </Show>
      </ol>
    </section>
  );
}

function Step(props: {
  title: string;
  time: number | null;
  children: JSX.Element;
  current?: boolean;
  last?: boolean;
}) {
  return (
    <li
      class={[
        "lnm-step",
        { "lnm-step--current": props.current === true, "lnm-step--last": props.last === true },
      ]}
    >
      <p class="lnm-step__title">
        <strong>{props.title}</strong>
        <Show when={props.time}>
          {(t) => (
            <time class="num lnm-step__time" title={formatUtc(t())}>
              {formatMoment(t())}
            </time>
          )}
        </Show>
      </p>
      <div class="lnm-step__body">{props.children}</div>
    </li>
  );
}

function FeeHistory(props: { channel: SampleChannel }) {
  onSettled(() => void Chart.preload());
  const c = () => props.channel;
  // One time axis for both directions: every change, then now (or the close); each direction holds
  // its rate until its next change, and is empty before its first kept change.
  const x = () => {
    const end = c().closed?.time ?? MOCK_NOW;
    const times = [...c().one.changes, ...c().two.changes].map((ch) => ch.time);
    return sorted(new Set([...times, end]), (a, b) => a - b);
  };
  const values = (e: ChannelEnd) =>
    x().map((t) => {
      const before = e.changes.filter((ch) => ch.time <= t);
      return before.length === 0 ? null : (before.at(-1)?.rate ?? null);
    });
  return (
    <section aria-labelledby="lnm-feehist-title">
      <SectionHeader title="Fee rate over time" id="lnm-feehist-title">
        The last {KEPT_CHANGES} changes each way are kept
      </SectionHeader>
      <Show
        when={x().length > 1}
        fallback={
          <Empty title="No change yet">
            Neither end has changed its fee since this server started watching.
          </Empty>
        }
      >
        <div class="ln-chart ln-chart--node">
          <Pending>
            <Chart
              label="Each direction's fee rate over time"
              x={x()}
              height={200}
              left={{ zero: true, format: groupDigits }}
              series={[
                {
                  name: `${name(c().one.node)} charges`,
                  values: values(c().one),
                  draw: "step",
                  format: (v) => `${groupDigits(v)} ppm`,
                },
                {
                  name: `${name(c().two.node)} charges`,
                  values: values(c().two),
                  draw: "step",
                  tone: 2,
                  format: (v) => `${groupDigits(v)} ppm`,
                },
              ]}
              time={formatMoment}
            />
          </Pending>
        </div>
      </Show>
      <p class="ln-aside">
        A step is a policy update gossip carried. The colours follow the lanes above: blue is{" "}
        <bdi>{name(c().one.node)}</bdi>'s direction, ochre <bdi>{name(c().two.node)}</bdi>'s.
      </p>
    </section>
  );
}
