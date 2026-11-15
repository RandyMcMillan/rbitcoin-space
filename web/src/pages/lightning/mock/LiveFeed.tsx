// Mockup: the network as it changes, a canned loop. Rows arrive at the top, at most one batch a
// second, about 30 kept; paused by the button, or while the pointer or focus is in the list.
import { createSignal, For, onSettled, Show } from "solid-js";
import { SectionHeader } from "../../../components/SectionHeader";
import { TimeAgo } from "../../../components/Time";
import { formatUtc, groupDigits } from "../../../lib/format";
import { feedEvents, type FeedEvent } from "./overview";
import { Icon, type IconName, KIND_LABEL, MockChannelLink, MockNodeName, sats } from "./parts";
import { TIP } from "./sample";

const KEEP = 30;

interface Row {
  key: number;
  at: number;
  event: FeedEvent;
}

const WORDS: Record<FeedEvent["kind"], { word: string; icon: IconName; tone: string }> = {
  opened: { word: "Opened", icon: "plus", tone: "plain" },
  cooperative: { word: "Closed, cooperative", icon: KIND_LABEL.cooperative.icon, tone: "muted" },
  force: { word: "Force closed", icon: KIND_LABEL.force.icon, tone: "caution" },
  penalty: { word: "Penalty", icon: KIND_LABEL.penalty.icon, tone: "negative" },
  other: { word: "Closed, other", icon: KIND_LABEL.other.icon, tone: "muted" },
  splice: { word: "Continued", icon: "branch", tone: "plain" },
};

export function LiveFeed() {
  const events = feedEvents();
  let cursor = 0;
  let key = 0;
  const take = (n: number, at: number): Row[] =>
    Array.from({ length: n }, () => {
      const event = events[cursor % events.length] as FeedEvent;
      cursor += 1;
      key += 1;
      return { key, at, event };
    });
  const start = Date.now() / 1000;
  // The list starts with a few rows already there, a few seconds apart.
  const [rows, setRows] = createSignal<Row[]>(
    Array.from({ length: 8 }, (_, k) => take(1, start - 6 - k * 9)[0] as Row),
  );
  const [fresh, setFresh] = createSignal(new Set<number>());
  // Under reduced motion the list starts paused: rows arriving by themselves are motion.
  const [held, setHeld] = createSignal(
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [waiting, setWaiting] = createSignal(0);
  const [pausedAt, setPausedAt] = createSignal(Date.now() / 1000);
  const [hover, setHover] = createSignal(false);
  const [focus, setFocus] = createSignal(false);
  const [updates, setUpdates] = createSignal(512);
  const [tip, setTip] = createSignal(TIP);
  const paused = () => held() || hover() || focus();
  let wait = 2;
  let ticks = 0;

  onSettled(() => {
    const timer = setInterval(() => {
      ticks += 1;
      setUpdates((n) =>
        Math.max(
          180,
          Math.min(900, n + Math.round((Math.sin(ticks / 5) + Math.cos(ticks / 3)) * 18)),
        ),
      );
      if (ticks % 47 === 0) setTip((t) => t + 1);
      wait -= 1;
      if (wait > 0) return;
      // One batch at most each second: one to three events, then a pause of one to three seconds.
      wait = 1 + (ticks % 3);
      const n = 1 + (ticks % 5 === 0 ? 2 : ticks % 2);
      if (paused()) {
        setWaiting((w) => w + n);
        return;
      }
      const batch = take(n + waiting(), Date.now() / 1000);
      setWaiting(0);
      setRows((rs) => [...batch, ...rs].slice(0, KEEP));
      setFresh(new Set(batch.map((b) => b.key)));
    }, 1000);
    return () => clearInterval(timer);
  });

  return (
    <section aria-labelledby="lnm-feed-title">
      <SectionHeader title="As it happens" id="lnm-feed-title">
        <span class="lnm-live">
          <span
            class={["lnm-live__dot", { "lnm-live__dot--paused": paused() }]}
            aria-hidden="true"
          />
          {paused()
            ? `List paused${
                held()
                  ? ` at ${formatUtc(pausedAt())
                      .replace(/^.*, /, "")
                      .replace(/:\d\d UTC$/, " UTC")}`
                  : ""
              }${waiting() > 0 ? `, ${waiting()} waiting` : ""}`
            : "Live"}
        </span>
        <button
          class="btn"
          type="button"
          aria-pressed={held() ? "true" : "false"}
          onClick={() => {
            if (!held()) setPausedAt(Date.now() / 1000);
            setHeld((h) => !h);
          }}
        >
          {held() ? "Resume the list" : "Pause the list"}
        </button>
      </SectionHeader>
      <dl class="lnm-server">
        <div>
          <dt>Fee updates in the last minute</dt>
          <dd class="num">{groupDigits(updates())}</dd>
        </div>
        <div>
          <dt>This server's watcher</dt>
          <dd>
            <span class="lnm-tag lnm-tag--positive">
              <Icon name="check" />
              Caught up to block {groupDigits(tip())}
            </span>
          </dd>
        </div>
        <div>
          <dt>Gossip peers</dt>
          <dd class="num">3 of 6 connected</dd>
        </div>
      </dl>
      <Show when={paused()}>
        <p class="ln-aside">Counters stay live while the list is paused.</p>
      </Show>
      <ol
        class="lnm-feed"
        aria-label="Newest changes first"
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
        onFocusIn={() => setFocus(true)}
        onFocusOut={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocus(false);
        }}
      >
        <For each={rows()}>
          {(row) => {
            const w = () => WORDS[row.event.kind];
            return (
              <li class={["lnm-feed__row", { "lnm-feed__row--new": fresh().has(row.key) }]}>
                <span class={`lnm-tag lnm-tag--${w().tone} lnm-feed__kind`}>
                  <Icon name={w().icon} />
                  {w().word}
                </span>
                <span class="lnm-feed__what">
                  <MockChannelLink id={row.event.id} />
                  <Show when={row.event.into}>
                    {(into) => (
                      <span class="muted">
                        {" "}
                        into <span class="num">{into()}</span>
                      </span>
                    )}
                  </Show>
                </span>
                <span class="lnm-feed__cap">
                  <span class="num">{sats(row.event.capacity)}</span>
                </span>
                <span class="lnm-feed__ends">
                  <MockNodeName node={row.event.one} />
                  <span class="muted" aria-hidden="true">
                    ↔
                  </span>
                  <span class="visually-hidden">and</span>
                  <MockNodeName node={row.event.two} />
                </span>
                <span class="lnm-feed__time">
                  <TimeAgo time={row.at} />
                </span>
              </li>
            );
          }}
        </For>
      </ol>
    </section>
  );
}
