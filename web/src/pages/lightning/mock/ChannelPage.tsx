// Mockup: a Lightning channel page for operators. For an open channel: the two lanes that say
// whose fee is whose, the advertised fee for this hop, the policies side by side, its life and each
// direction's fee over time. For a closed one, how it ended comes first and the policies follow as
// history.
import { useParams } from "@solidjs/router";
import { createMemo, createSignal, For, lazy, Loading as Pending, onSettled, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import { formatDay, formatMoment } from "../../../components/chart/scale";
import "../../../components/chart/Chart.css";
import { CopyButton } from "../../../components/CopyButton";
import { Link } from "../../../components/Link";
import { More } from "../../../components/More";
import { SectionHeader } from "../../../components/SectionHeader";
import { Empty } from "../../../components/States";
import { formatUtc, groupDigits } from "../../../lib/format";
import { paths } from "../../../lib/network";
import { usePageTitle } from "../../../lib/page";
import { CLOSE_WORDS, cleanAlias, cut } from "../lightning";
import { Alias } from "../parts";
import {
  CHANNEL_SAMPLES,
  type ChannelEnd,
  KEPT_CHANGES,
  type SampleChannel,
  sampleChannel,
} from "./channels";
import { inbound } from "./NodeChannels";
import {
  Ago,
  days,
  ENABLED_MEANS,
  Icon,
  KindTag,
  MockChannelLink,
  MockFrame,
  MockNodeName,
  msatAsSats,
  sats,
  STATE_LABEL,
  StateTag,
  TxLink,
} from "./parts";
import { MOCK_NOW, type OpState, type Policy } from "./sample";

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

/** The headline for a closed channel: what was observed, in a few words. */
function closedWords(c: SampleChannel): string {
  if (c.penalty) return "Closed: revoked state swept";
  if (c.continued) return "Closed: continued as a new channel";
  return `Closed: ${CLOSE_WORDS[c.closed?.kind ?? "other"].name.toLowerCase()}`;
}

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
              <StateTag state={c().state === "closed" ? "inactive" : (c().state as OpState)} />
            }
          >
            <span class="lnm-tag lnm-tag--muted lnm-closedtag">
              <Icon name="stop" />
              {closedWords(c())}
            </span>
          </Show>
        </div>
        <p class="lnm-chanline">
          <span class="lnm-between">
            <span>Between</span>
            <MockNodeName node={c().one.node} />
            <span>and</span>
            <MockNodeName node={c().two.node} />
          </span>
        </p>
        <p class="lnm-chanline">
          <span>
            <strong class="num">{sats(c().capacity)}</strong>
          </span>
          <span class="num">
            {c().closed ? "Lived" : "Open for"}{" "}
            {groupDigits(days((c().closed?.time ?? MOCK_NOW) - c().funded.time))} days, funded{" "}
            {formatDay(c().funded.time)}
          </span>
          <Show when={c().funded.continues}>
            {(id) => (
              <span>
                Continues <MockChannelLink id={id()} /> (inferred splice)
              </span>
            )}
          </Show>
        </p>
        <dl class="lnm-idforms">
          <IdForm label="Id" value={c().id} />
          <IdForm label="As one number" value={c().scid} />
          <IdForm label="lnd's form" value={`${h ?? ""}:${i ?? ""}:${o ?? ""}`} />
        </dl>
      </header>
      <Show
        when={c().closed}
        fallback={
          <>
            <Lanes channel={c()} />
            <Cost channel={c()} />
            <Policies channel={c()} />
            <Life channel={c()} />
            <FeeHistory channel={c()} />
          </>
        }
      >
        <Outcome channel={c()} />
        <Life channel={c()} />
        <Lanes channel={c()} />
        <Policies channel={c()} />
        <FeeHistory channel={c()} />
      </Show>
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

/** A closed channel's answer first: what happened, when, the transactions, what came next. */
function Outcome(props: { channel: SampleChannel }) {
  const c = () => props.channel;
  return (
    <Show when={c().closed}>
      {(x) => (
        <section aria-labelledby="lnm-outcome-title">
          <SectionHeader title="How it ended" id="lnm-outcome-title" />
          <div class="lnm-outcome">
            <div class="lnm-outcome__item">
              <p class="lnm-outcome__what">
                <KindTag kind={x().kind} long />
                <span class="num">
                  {formatMoment(x().time)}, block{" "}
                  <Link class="num" href={paths.block(x().height)}>
                    {groupDigits(x().height)}
                  </Link>
                </span>
              </p>
              <p>
                {x().kind === "force"
                  ? "One end broadcast a commitment transaction on its own. The chain does not say which end, or why."
                  : CLOSE_WORDS[x().kind].why}
              </p>
              <p class="lnm-outcome__tx">
                Closing transaction <TxLink txid={x().txid} label="Copy closing transaction ID" />
                <span class="muted">, closing fee {sats(x().fee)}</span>
              </p>
            </div>
            <Show when={c().penalty}>
              {(p) => (
                <div class="lnm-outcome__item">
                  <p class="lnm-outcome__what">
                    <KindTag kind="penalty" />
                    <span class="num">
                      {formatMoment(p().time)}, block{" "}
                      <Link class="num" href={paths.block(p().height)}>
                        {groupDigits(p().height)}
                      </Link>
                    </span>
                  </p>
                  <p>
                    An output of that commitment was spent with its revocation key, so the state it
                    broadcast had been revoked. The sweep took{" "}
                    <strong class="num">{sats(p().swept)}</strong>{" "}
                    <span class="muted">(sample figure)</span>. The chain cannot tell which of the
                    two nodes broadcast the revoked state.
                  </p>
                  <p class="lnm-outcome__tx">
                    Sweeping transaction{" "}
                    <TxLink txid={p().txid} label="Copy sweeping transaction ID" />
                  </p>
                </div>
              )}
            </Show>
            <Show when={c().continued}>
              {(id) => (
                <div class="lnm-outcome__item">
                  <p class="lnm-outcome__what">
                    <span class="lnm-tag lnm-tag--muted">
                      <Icon name="branch" />
                      Continued as <MockChannelLink id={id()} />
                    </span>
                  </p>
                  <p>
                    Observed: its closing transaction also funds channel{" "}
                    <MockChannelLink id={id()} /> between the same two nodes.
                  </p>
                  <p class="muted">
                    Inferred: a splice, the same channel going on under a new id. A close and a
                    fresh open in one transaction would look the same on the chain.
                  </p>
                </div>
              )}
            </Show>
          </div>
        </section>
      )}
    </Show>
  );
}

/**
 * The two lanes: one per direction, each saying in words which end charges and what. An end's
 * policy is what it charges to forward a payment out over this channel, towards the other end.
 */
function Lanes(props: { channel: SampleChannel }) {
  const c = () => props.channel;
  const closed = () => c().closed !== null;
  return (
    <section aria-labelledby="lnm-lanes-title">
      <SectionHeader
        title={closed() ? "Last advertised policies, before it closed" : "Who charges what"}
        id="lnm-lanes-title"
      >
        {closed()
          ? "Historical: no longer in force"
          : "Each end sets the fee for its own direction"}
      </SectionHeader>
      <div class={["lnm-lanes", { "lnm-lanes--closed": closed() }]}>
        <div class="lnm-end lnm-end--one">
          <span class="lnm-end__tag">Node one</span>
          <MockNodeName node={c().one.node} />
        </div>
        <div class="lnm-end lnm-end--two">
          <span class="lnm-end__tag">Node two</span>
          <MockNodeName node={c().two.node} />
        </div>
        <ol class="lnm-lanes__list">
          <Lane from={c().one} to={c().two} tone={1} closed={closed()} />
          <Lane from={c().two} to={c().one} tone={2} closed={closed()} />
        </ol>
      </div>
      <Show when={!closed()}>
        <p class="ln-aside">{ENABLED_MEANS}</p>
      </Show>
      <More label="Why this matters">
        <p>
          A payment pays the fee of the node that forwards it. On this channel{" "}
          <bdi>{name(c().one.node)}</bdi> sets the price of sending towards{" "}
          <bdi>{name(c().two.node)}</bdi>, and <bdi>{name(c().two.node)}</bdi> the price of the
          other way. So the fee a node "charges" on a channel is never what it pays to receive over
          it. An inbound discount is the exception that goes the other way: an end takes it off for
          a payment arriving over the channel.
        </p>
      </More>
    </section>
  );
}

function Lane(props: { from: ChannelEnd; to: ChannelEnd; tone: 1 | 2; closed: boolean }) {
  const p = () => props.from.policy;
  const open = () => !props.closed && p()?.enabled === true;
  return (
    <li
      class={[
        "lnm-lane",
        `lnm-lane--${props.tone}`,
        { "lnm-lane--shut": !open() && !props.closed, "lnm-lane--closed": props.closed },
      ]}
    >
      <div class="lnm-lane__track" aria-hidden="true">
        <span class="lnm-lane__line" />
        <span class="lnm-lane__head" />
        <Show when={!open()}>
          <span class="lnm-lane__gate">
            <Icon name={props.closed ? "stop" : "pause"} />
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
              {msatAsSats(pol().base_fee_msat)}
            </p>
            <p class="lnm-lane__note">
              <Show
                when={!props.closed}
                fallback={
                  <span class="lnm-tag lnm-tag--muted">
                    <Icon name="stop" />
                    Channel closed
                  </span>
                }
              >
                <Show
                  when={open()}
                  fallback={
                    <span class="lnm-tag lnm-tag--caution">
                      <Icon name="pause" />
                      Disabled: it advertises no forwarding this way
                    </span>
                  }
                >
                  Time lock {groupDigits(pol().cltv_delta)} blocks; advertised maximum HTLC{" "}
                  {msatAsSats(pol().max_htlc_msat)}
                </Show>
              </Show>
            </p>
            <Show when={pol().inbound_rate !== 0 || pol().inbound_base_msat !== 0}>
              <p class="lnm-lane__note">
                Inbound discount for payments arriving from <bdi>{name(props.to.node)}</bdi>:{" "}
                {inbound(pol())}
              </p>
            </Show>
          </>
        )}
      </Show>
    </li>
  );
}

/** Whole sats, as typed: digits with optional grouping spaces; null with the reason otherwise. */
export function parseSats(text: string): { sats: number } | { error: string } {
  const t = text.trim();
  if (t === "") return { error: "Type an amount in whole sats, such as 100 000." };
  if (/^[-−]/.test(t))
    return { error: "An amount cannot be negative. Type a whole number of sats." };
  const digits = t.replaceAll(/[\s  ,_]/g, "");
  if (/^\d+[.]\d*$/.test(digits))
    return { error: "Whole sats only: a forwarding fee is worked out on whole sats here." };
  if (!/^\d+$/.test(digits))
    return { error: "That is not an amount. Type a whole number of sats." };
  const n = Number(digits);
  if (n === 0) return { error: "Zero sats forwards nothing. Type an amount above zero." };
  if (n > 2_100_000_000_000_000)
    return { error: "That is more than all the bitcoin there will be." };
  return { sats: n };
}

function Cost(props: { channel: SampleChannel }) {
  const [text, setText] = createSignal("100 000");
  const amount = () => parseSats(text());
  const ways = () => [
    { from: props.channel.one, to: props.channel.two, tone: 1 },
    { from: props.channel.two, to: props.channel.one, tone: 2 },
  ];
  return (
    <section aria-labelledby="lnm-cost-title">
      <SectionHeader title="Advertised forwarding fee for this hop" id="lnm-cost-title" />
      <p class="lnm-explain">
        What each end advertises it would charge to forward an amount across this one channel. It is
        not a quote for a payment: the channel's balance, and whether a payment would get through,
        are not known from gossip.
      </p>
      <div class="lnm-cost">
        <label class="lnm-cost__field">
          <span>Amount, sats</span>
          <input
            class="lnm-input num"
            type="text"
            inputmode="numeric"
            value={text()}
            aria-describedby="lnm-cost-formula lnm-cost-error"
            aria-invalid={"error" in amount() ? "true" : "false"}
            onInput={(e) => setText(e.currentTarget.value)}
          />
        </label>
        <p class="lnm-cost__error" id="lnm-cost-error" role="status">
          {"error" in amount() ? (amount() as { error: string }).error : ""}
        </p>
        <p class="lnm-cost__formula" id="lnm-cost-formula">
          Fee = base fee + amount × fee rate ÷ 1 000 000, worked in millisatoshis and rounded down
          to a whole one, as nodes do.
        </p>
        <ul class="lnm-cost__ways" aria-live="polite">
          <For each={ways()}>
            {(w) => (
              <li class={`lnm-cost__way lnm-lane--${w.tone}`}>
                <span class="lnm-cost__dir">
                  <bdi>{name(w.from.node)}</bdi> → <bdi>{name(w.to.node)}</bdi>
                </span>
                <WayFee policy={w.from.policy} amount={amount()} />
              </li>
            )}
          </For>
        </ul>
      </div>
    </section>
  );
}

function WayFee(props: { policy: Policy | null; amount: { sats: number } | { error: string } }) {
  const ok = () => ("sats" in props.amount ? props.amount.sats : null);
  return (
    <Show when={ok()} fallback={<span class="muted">No figure until the amount is valid</span>}>
      {(n) => (
        <Show
          when={props.policy?.enabled ? props.policy : undefined}
          fallback={
            <span class="muted">Not forwarded: this end advertises no forwarding this way</span>
          }
        >
          {(p) => {
            const exact = () => p().base_fee_msat + (n() * 1000 * p().fee_rate) / 1_000_000;
            const msat = () => Math.floor(exact());
            const over = () => n() * 1000 > p().max_htlc_msat;
            const under = () => n() * 1000 < p().min_htlc_msat;
            return (
              <Show
                when={!over() && !under()}
                fallback={
                  <>
                    <span class="lnm-tag lnm-tag--caution lnm-cost__limit">
                      <Icon name="warn" />
                      {over()
                        ? `Over the advertised maximum HTLC of ${msatAsSats(p().max_htlc_msat)}: this end would not forward it as one HTLC.`
                        : `Under the advertised minimum HTLC of ${msatAsSats(p().min_htlc_msat)}.`}
                    </span>
                    <span class="lnm-cost__work num">
                      Its rate would come to {msatAsSats(msat())}, for reference only.
                    </span>
                  </>
                }
              >
                <strong class="lnm-cost__fee num">{msatAsSats(msat())}</strong>
                <span class="lnm-cost__work num">
                  {msatAsSats(p().base_fee_msat)} + {groupDigits(n())} × {groupDigits(p().fee_rate)}{" "}
                  ÷ 1 000 000
                  {msat() === exact()
                    ? ""
                    : `; rounded down from ${Number(exact().toFixed(3))} msat`}
                </span>
              </Show>
            );
          }}
        </Show>
      )}
    </Show>
  );
}

interface Term {
  label: string;
  cell: (p: Policy) => JSX.Element;
  diff: (a: Policy, b: Policy, one: string, two: string) => string;
  /** Left out for a closed channel, whose policies are no longer in force. */
  openOnly?: boolean;
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
    cell: (p) => <span class="num">{msatAsSats(p.base_fee_msat)}</span>,
    diff: (a, b, one, two) => higher(a.base_fee_msat, b.base_fee_msat, one, two, msatAsSats),
  },
  {
    label: "Inbound discount",
    cell: (p) => (
      <span class="num">
        {p.inbound_rate === 0 && p.inbound_base_msat === 0 ? "None" : inbound(p)}
      </span>
    ),
    diff: (a, b, one, two) =>
      a.inbound_rate === b.inbound_rate && a.inbound_base_msat === b.inbound_base_msat
        ? "Same"
        : `${a.inbound_rate < b.inbound_rate ? one : two} gives more`,
  },
  {
    label: "CLTV delta",
    cell: (p) => <span class="num">{groupDigits(p.cltv_delta)} blocks</span>,
    diff: (a, b, one, two) =>
      higher(a.cltv_delta, b.cltv_delta, one, two, (n) => `${groupDigits(n)} blocks`),
  },
  {
    label: "Min HTLC",
    cell: (p) => <span class="num">{msatAsSats(p.min_htlc_msat)}</span>,
    diff: (a, b, one, two) => higher(a.min_htlc_msat, b.min_htlc_msat, one, two, msatAsSats),
  },
  {
    label: "Max HTLC",
    cell: (p) => <span class="num">{msatAsSats(p.max_htlc_msat)}</span>,
    diff: (a, b, one, two) => higher(a.max_htlc_msat, b.max_htlc_msat, one, two, msatAsSats),
  },
  {
    label: "Forwarding",
    cell: (p) => (p.enabled ? "Enabled" : "Disabled"),
    diff: (a, b) => (a.enabled === b.enabled ? (a.enabled ? "Both" : "Neither") : "One way only"),
    openOnly: true,
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
  const closed = () => props.channel.closed !== null;
  const diff = (t: Term) => {
    const a = one().policy;
    const b = two().policy;
    return a && b ? t.diff(a, b, name(one().node), name(two().node)) : "–";
  };
  return (
    <section aria-labelledby="lnm-policies-title">
      <SectionHeader
        title={closed() ? "Last policies side by side" : "Policies side by side"}
        id="lnm-policies-title"
      >
        {closed() ? "Historical" : ""}
      </SectionHeader>
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
            <For each={TERMS.filter((t) => !(closed() && t.openOnly === true))}>
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
            , on-chain fee <span class="num">{sats(c().funded.fee)}</span>
          </span>
          <TxLink txid={c().funded.txid} label="Copy funding transaction ID" />
          <Show when={c().funded.batch > 0}>
            <span>
              Opened with {c().funded.batch}{" "}
              {c().funded.batch === 1 ? "other channel" : "other channels"} in one transaction
            </span>
          </Show>
          <Show when={c().funded.continues}>
            {(id) => (
              <span>
                Its funding transaction is the closing transaction of <MockChannelLink id={id()} />,
                between the same two nodes (inferred splice)
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
                {groupDigits(days(MOCK_NOW - c().funded.time))} days old;{" "}
                {STATE_LABEL[
                  c().state === "closed" ? "inactive" : (c().state as OpState)
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
                , closing fee <span class="num">{sats(x().fee)}</span>
              </span>
              <TxLink txid={x().txid} label="Copy closing transaction ID" />
            </Step>
          )}
        </Show>
        <Show when={c().penalty}>
          {(p) => (
            <Step title="Revoked state swept" time={p().time} last>
              <KindTag kind="penalty" />
              <span>
                Block{" "}
                <Link class="num" href={paths.block(p().height)}>
                  {groupDigits(p().height)}
                </Link>
                : an output spent with the revocation key,{" "}
                <span class="num">{sats(p().swept)}</span> <span class="muted">(sample)</span>
              </span>
              <TxLink txid={p().txid} label="Copy sweeping transaction ID" />
            </Step>
          )}
        </Show>
        <Show when={c().continued}>
          {(id) => (
            <Step title="Continued as a new channel" time={c().closed?.time ?? null} last>
              <span>
                Its closing transaction also funds <MockChannelLink id={id()} /> between the same
                two nodes; that this was a splice is inferred
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
  const end = () => c().closed?.time ?? MOCK_NOW;
  const start = () =>
    Math.min(...[...c().one.changes, ...c().two.changes].map((x) => x.time), end() - 86_400);
  return (
    <section aria-labelledby="lnm-feehist-title">
      <SectionHeader title="Fee rate over time" id="lnm-feehist-title">
        The last {KEPT_CHANGES} changes each way are kept
      </SectionHeader>
      <p class="lnm-explain">
        One panel per direction, each on its own scale, over the same time, so a 1 ppm side's
        changes show beside a 2 499 ppm side's. A step is a policy update gossip carried; "Show the
        figures" under each lists its changes.
      </p>
      <div class="lnm-twocharts">
        <For each={[c().one, c().two]}>
          {(e, k) => (
            <div class={`lnm-feepanel lnm-lane--${k() + 1}`}>
              <h3>
                <bdi>{name(e.node)}</bdi> charges, towards{" "}
                <bdi>{name(k() === 0 ? c().two.node : c().one.node)}</bdi>
              </h3>
              <Show
                when={e.changes.length > 0}
                fallback={<p class="muted">No change kept for this direction.</p>}
              >
                <div class="ln-chart lnm-chart--small">
                  <Pending>
                    <Chart
                      label={`${name(e.node)}'s fee rate on this channel over time`}
                      x={[...e.changes.map((x) => x.time), end()]}
                      domain={[start(), end()]}
                      height={140}
                      left={{ format: groupDigits }}
                      series={[
                        {
                          name: `${name(e.node)} charges`,
                          values: [...e.changes.map((x) => x.rate), e.changes.at(-1)?.rate ?? null],
                          draw: "step",
                          tone: k() === 0 ? 1 : 2,
                          format: (v) => `${groupDigits(v)} ppm`,
                        },
                      ]}
                      time={formatMoment}
                    />
                  </Pending>
                </div>
              </Show>
            </div>
          )}
        </For>
      </div>
    </section>
  );
}
