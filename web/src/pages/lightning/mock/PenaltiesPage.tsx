// Mockup: every penalty this server has seen, newest first: a short table.
import { type Column, DataTable } from "../../../components/DataTable";
import { formatDay } from "../../../components/chart/scale";
import { SectionHeader } from "../../../components/SectionHeader";
import { groupDigits } from "../../../lib/format";
import { usePageTitle } from "../../../lib/page";
import { type Penalty, penalties } from "./overview";
import { MockChannelLink, MockFrame, MockNodeName } from "./parts";

export default function MockPenaltiesPage() {
  usePageTitle(() => "Mockup: Lightning penalties");
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
    {
      header: "Capacity, sats",
      numeric: true,
      cell: (p) => groupDigits(p.capacity),
    },
    {
      header: "Swept, sats (sample)",
      numeric: true,
      cell: (p) => groupDigits(p.swept),
    },
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
          Seen on the chain, newest first
        </SectionHeader>
        <DataTable caption="Penalties, newest first" columns={columns} rows={penalties()} />
        <p class="ln-aside">
          Each row is a force close whose commitment was a revoked state: an output of it was later
          spent with the revocation key. The chain cannot tell which of the two nodes broadcast the
          revoked state, or why; the keys in a commitment are made for it, not the nodes' own.
          "Swept" is the value that sweep spent.
        </p>
      </section>
    </MockFrame>
  );
}
