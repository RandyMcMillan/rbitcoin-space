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
  dayCount,
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

/** An axis tick in ppm: whole numbers, and one decimal where a small range needs halves. */
const tick = (v: number) => (Number.isInteger(v) ? groupDigits(v) : v.toFixed(1));

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
  // Read from the current channel every time: a link to the successor reuses this component.
  const colon = () => c().id.replaceAll("x", ":");
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
            {dayCount(days((c().closed?.time ?? MOCK_NOW) - c().funded.time))}, funded{" "}
            {formatDay(c().funded.time)}
          </span>
        </p>
        <Show when={c().funded.continues}>
          {(id) => (
            <p class="lnm-chanline">
              <span>
                Continues <MockChannelLink id={id()} /> (splice, inferred)
              </span>
            </p>
          )}
        </Show>
        <dl class="lnm-idforms">
          <IdForm label="Id" value={c().id} />
          <IdForm label="As one number" value={c().scid} />
          <IdForm label="lnd's form" value={colon()} />
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
              <p class="lnm-outcome__tx">
                <TxLink txid={x().txid} label="Copy closing transaction ID" />
                <span class="muted num">fee {sats(x().fee)}</span>
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
                  <p class="lnm-outcome__tx">
                    <span>
                      Swept <strong class="num">{sats(p().swept)}</strong>{" "}
                      <span class="muted">(sample)</span>
                    </span>
                  </p>
                  <p class="lnm-outcome__tx">
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
                    <span class="muted">splice, inferred</span>
                  </p>
                </div>
              )}
            </Show>
          </div>
          <More label="What the chain shows">
            <p>
              A force close is a commitment one end broadcast alone; the chain does not say which
              end, or why. A penalty sweep spends an output of that commitment with its revocation
              key, so the broadcast state had been revoked; the chain cannot tell which node
              broadcast it. "Continued as" means the closing transaction also funds a new channel
              between the same nodes; that it was a splice is inferred, since a close and a fresh
              open in one transaction look the same.
            </p>
          </More>
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
      <SectionHeader title={closed() ? "Last policies" : "Who charges what"} id="lnm-lanes-title">
        {closed() ? "Historical" : "Advertised; balances unknown"}
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
      <More label="Whose fee is whose">
        <p>
          Each end sets the fee for forwarding out over the channel: <bdi>{name(c().one.node)}</bdi>{" "}
          towards <bdi>{name(c().two.node)}</bdi>, and the other way. An inbound discount is taken
          off for a payment arriving over the channel. {ENABLED_MEANS}
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
                      Disabled
                    </span>
                  }
                >
                  CLTV {groupDigits(pol().cltv_delta)}, max HTLC {msatAsSats(pol().max_htlc_msat)}
                </Show>
              </Show>
            </p>
            <Show when={pol().inbound_rate !== 0 || pol().inbound_base_msat !== 0}>
              <p class="lnm-lane__note">Inbound discount {inbound(pol())}</p>
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
  if (t === "") return { error: "Type an amount in sats." };
  if (/^[-−]/.test(t)) return { error: "Not negative: whole sats only." };
  const digits = t.replaceAll(/[\s  ,_]/g, "");
  if (/^\d+[.]\d*$/.test(digits)) return { error: "Whole sats only." };
  if (!/^\d+$/.test(digits)) return { error: "Not an amount: whole sats only." };
  const n = Number(digits);
  if (n === 0) return { error: "Above zero, please." };
  if (n > 2_100_000_000_000_000) return { error: "More than all bitcoin." };
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
      <SectionHeader title="Fee for this hop" id="lnm-cost-title">
        Advertised, not a quote
      </SectionHeader>
      <div class="lnm-cost">
        <label class="lnm-cost__field">
          <span>Amount, sats</span>
          <input
            class="lnm-input num"
            type="text"
            inputmode="numeric"
            value={text()}
            aria-describedby="lnm-cost-error"
            aria-invalid={"error" in amount() ? "true" : "false"}
            onInput={(e) => setText(e.currentTarget.value)}
          />
        </label>
        <p class="lnm-cost__error" id="lnm-cost-error" role="status">
          {"error" in amount() ? (amount() as { error: string }).error : ""}
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
      <More label="How it is worked out">
        <p>
          Fee = base fee + amount × fee rate ÷ 1 000 000, in millisatoshis, rounded down as nodes
          do. It is what each end advertises for this one channel: the channel's balance, and
          whether a payment would get through, are not known from gossip.
        </p>
      </More>
    </section>
  );
}

function WayFee(props: { policy: Policy | null; amount: { sats: number } | { error: string } }) {
  const ok = () => ("sats" in props.amount ? props.amount.sats : null);
  return (
    <Show when={ok()} fallback={<span class="muted">–</span>}>
      {(n) => (
        <Show
          when={props.policy?.enabled ? props.policy : undefined}
          fallback={
            <span class="lnm-tag lnm-tag--caution">
              <Icon name="pause" />
              Disabled
            </span>
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
                        ? `Over max HTLC (${msatAsSats(p().max_htlc_msat)})`
                        : `Under min HTLC (${msatAsSats(p().min_htlc_msat)})`}
                    </span>
                    <span class="lnm-cost__work num">Would be {msatAsSats(msat())}</span>
                  </>
                }
              >
                <strong class="lnm-cost__fee num">{msatAsSats(msat())}</strong>
                <span class="lnm-cost__work num">
                  {msatAsSats(p().base_fee_msat)} + {groupDigits(n())} × {groupDigits(p().fee_rate)}{" "}
                  ÷ 1 000 000
                  {msat() === exact() ? "" : ", rounded down"}
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
                From the close of <MockChannelLink id={id()} /> (splice, inferred)
              </span>
            )}
          </Show>
        </Step>
        <Step title="Checked by this server" time={c().verified}>
          <span>Funding output found on the chain</span>
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
                {dayCount(days(MOCK_NOW - c().funded.time))} old;{" "}
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
            </Step>
          )}
        </Show>
        <Show when={c().penalty}>
          {(p) => (
            <Step title="Revoked state swept" time={p().time} last>
              <span class="num">{sats(p().swept)}</span>
            </Step>
          )}
        </Show>
        <Show when={c().continued}>
          {(id) => (
            <Step title="Continued as a new channel" time={c().closed?.time ?? null} last>
              <MockChannelLink id={id()} />
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
        Last {KEPT_CHANGES} changes each way
      </SectionHeader>
      <div class="lnm-twocharts">
        <For each={[c().one, c().two]}>
          {(e, k) => (
            <div class={`lnm-feepanel lnm-lane--${k() + 1}`}>
              <h3>
                <bdi>{name(e.node)}</bdi> →{" "}
                <bdi>{name(k() === 0 ? c().two.node : c().one.node)}</bdi>
              </h3>
              <Show when={e.changes.length > 0} fallback={<p class="muted">No change kept</p>}>
                <div class="ln-chart lnm-chart--small">
                  <Pending>
                    <Chart
                      label={`${name(e.node)}'s fee rate on this channel over time`}
                      x={[...e.changes.map((x) => x.time), end()]}
                      domain={[start(), end()]}
                      height={160}
                      left={{ format: tick }}
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
