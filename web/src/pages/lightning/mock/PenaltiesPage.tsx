// Mockup: every revoked-state sweep this server has seen, newest first: a short table, cards on a
// phone with the channel, both ends, when and what was swept.
import { For, Show } from "solid-js";
import { type Column, DataTable } from "../../../components/DataTable";
import { formatDay } from "../../../components/chart/scale";
import { More } from "../../../components/More";
import { SectionHeader } from "../../../components/SectionHeader";
import { groupDigits } from "../../../lib/format";
import { usePageTitle } from "../../../lib/page";
import { type Penalty, penalties } from "./overview";
import { MockChannelLink, MockFrame, MockNodeName, sats, usePhone } from "./parts";

export default function MockPenaltiesPage() {
  usePageTitle(() => "Mockup: Lightning penalties");
  const phone = usePhone();
  const columns: Column<Penalty>[] = [
    { header: "Channel", cell: (p) => <MockChannelLink id={p.id} /> },
    {
      header: "Between",
      cell: (p) => (
        <span class="ln-ends">
          <MockNodeName node={p.one} />
          <MockNodeName node={p.two} />
        </span>
      ),
    },
    { header: "Capacity, sats", numeric: true, cell: (p) => groupDigits(p.capacity) },
    { header: "Swept, sats (sample)", numeric: true, cell: (p) => groupDigits(p.swept) },
    {
      header: "When",
      numeric: true,
      cell: (p) => (
        <span class="ln-ends lnm-right">
          <span>{formatDay(p.time)}</span>
          <span class="ln-row-when">Block {groupDigits(p.height)}</span>
        </span>
      ),
    },
  ];
  return (
    <MockFrame>
      <header class="ln-head">
        <h1>Penalties</h1>
      </header>
      <section aria-labelledby="lnm-pen-title">
        <SectionHeader title="Revoked states swept" id="lnm-pen-title">
          Newest first
        </SectionHeader>
        <p class="ln-aside lnm-lead">Seen on chain; who broadcast them is unknown.</p>
        <Show
          when={!phone()}
          fallback={
            <ol class="lnm-cards">
              <For each={penalties()}>
                {(p) => (
                  <li class="lnm-card">
                    <p class="lnm-card__id">
                      <MockChannelLink id={p.id} />
                      <span class="lnm-card__chan num">{formatDay(p.time)}</span>
                    </p>
                    <p class="lnm-card__state">
                      <MockNodeName node={p.one} />
                      <MockNodeName node={p.two} />
                    </p>
                    <p class="lnm-card__state num">
                      <span>
                        Swept <strong>{sats(p.swept)}</strong> <span class="muted">(sample)</span>
                      </span>
                      <span class="muted">block {groupDigits(p.height)}</span>
                    </p>
                  </li>
                )}
              </For>
            </ol>
          }
        >
          <DataTable
            caption="Revoked states swept, newest first"
            columns={columns}
            rows={penalties()}
          />
        </Show>
        <More label="How penalties are identified">
          <p>
            Each is a force close whose commitment was a revoked state: an output of it was later
            spent with the revocation key. The chain cannot tell which node broadcast it, or why;
            the keys in a commitment are made for it, not the nodes' own. "Swept" is the value the
            sweep spent.
          </p>
        </More>
      </section>
    </MockFrame>
  );
}
