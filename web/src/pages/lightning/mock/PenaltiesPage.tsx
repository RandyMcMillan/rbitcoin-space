// Mockup: every penalty this server has seen, newest first: a short table.
import { Amount } from "../../../components/Amount";
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
      header: "Capacity, BTC",
      numeric: true,
      cell: (p) => <Amount sats={p.capacity} unit={false} short />,
    },
    {
      header: "Swept",
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
        <SectionHeader title="Seen on the chain" id="lnm-pen-title">
          Newest first
        </SectionHeader>
        <DataTable caption="Penalties, newest first" columns={columns} rows={penalties()} />
        <p class="ln-aside">
          A penalty is a force close of an old, revoked state, swept by the other end with its
          revocation key. The chain does not say which of the two nodes cheated: the keys in a
          commitment are made for it, not the nodes' own.
        </p>
      </section>
    </MockFrame>
  );
}
