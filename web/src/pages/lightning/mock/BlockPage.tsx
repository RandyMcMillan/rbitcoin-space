// Mockup: the panel a block's page would carry when the block opened or closed channels. One line
// says what happened; it opens to the list. Block 975 572's three recorded opens, the rest invented.
import { For } from "solid-js";
import { groupDigits } from "../../../lib/format";
import { usePageTitle } from "../../../lib/page";
import type { CloseKind } from "../lightning";
import { Icon, KindTag, MockChannelLink, MockFrame, MockNodeName, shortBtc } from "./parts";
import { rankings, recordedOverview, rng } from "./sample";

const HEIGHT = 975_572;

interface Row {
  id: string;
  capacity: number;
  one: { id: string; alias: string | null };
  two: { id: string; alias: string | null };
  closed: CloseKind | null;
}

function rows(): Row[] {
  const r = rng(HEIGHT);
  const recorded: Row[] = recordedOverview.opened
    .filter((c) => c.opened?.height === HEIGHT)
    .map((c) => ({
      id: c.id,
      capacity: c.capacity,
      one: c.node_one,
      two: c.node_two,
      closed: null,
    }));
  const node = () => {
    const n = rankings[r.int(0, rankings.length - 1)];
    return { id: n?.id ?? "", alias: n?.alias ?? null };
  };
  const sizes = [
    40_000_000, 30_000_000, 25_000_000, 20_000_000, 20_000_000, 10_000_000, 10_000_000, 5_000_000,
    5_000_000,
  ];
  const opened: Row[] = sizes.map((capacity, k) => ({
    id: `${HEIGHT}x${r.int(100, 3600)}x${k % 2}`,
    capacity,
    one: node(),
    two: node(),
    closed: null,
  }));
  const closed: Row[] = (["cooperative", "force", "cooperative"] as const).map((kind) => ({
    id: `${r.int(880_000, 970_000)}x${r.int(1, 3600)}x${r.int(0, 1)}`,
    capacity: r.int(4, 60) * 500_000,
    one: node(),
    two: node(),
    closed: kind,
  }));
  return [...recorded, ...opened, ...closed];
}

export default function MockBlockPage() {
  usePageTitle(() => `Mockup: block ${groupDigits(HEIGHT)}, Lightning panel`);
  const all = rows();
  const opened = all.filter((x) => x.closed === null);
  const closed = all.filter((x) => x.closed !== null);
  const forced = closed.filter((x) => x.closed === "force").length;
  const openedCap = opened.reduce((s, x) => s + x.capacity, 0);
  return (
    <MockFrame>
      <header class="ln-head">
        <h1>Block {groupDigits(HEIGHT)}</h1>
      </header>
      <div class="lnm-placeholder" aria-hidden="true">
        <span>The block page's facts, map and transactions, as they are today</span>
      </div>
      <details class="panel lnm-blockpanel">
        <summary class="lnm-blockpanel__summary">
          <Icon name="swap" />
          <span>
            <strong>Lightning in this block:</strong> {groupDigits(opened.length)} channels opened (
            {shortBtc(openedCap)}), {groupDigits(closed.length)} closed ({forced} forced)
          </span>
        </summary>
        <div class="table-scroll">
          <table class="table lnm-table">
            <caption class="visually-hidden">Channels this block opened and closed</caption>
            <thead>
              <tr>
                <th scope="col">What</th>
                <th scope="col">Channel and ends</th>
                <th scope="col" class="table__num">
                  Capacity, sats
                </th>
              </tr>
            </thead>
            <tbody>
              <For each={all}>
                {(x) => (
                  <tr>
                    <td>
                      {x.closed === null ? (
                        <span class="lnm-tag lnm-tag--plain">
                          <Icon name="plus" />
                          Opened
                        </span>
                      ) : (
                        <KindTag kind={x.closed} />
                      )}
                    </td>
                    <td>
                      <span class="ln-ends">
                        <MockChannelLink id={x.id} />
                        <MockNodeName node={x.one} />
                        <MockNodeName node={x.two} />
                      </span>
                    </td>
                    <td class="table__num">{groupDigits(x.capacity)}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
        <p class="ln-aside">
          Opens are channels funded in this block that this server later checked; closes are funding
          outputs this block spent. Private channels are not counted.
        </p>
      </details>
    </MockFrame>
  );
}
