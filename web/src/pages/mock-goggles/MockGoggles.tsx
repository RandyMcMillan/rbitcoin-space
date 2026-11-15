// MOCKUP (GG5), never merged: the goggles over sample blocks, with no server. Query parameters set
// a state for screenshots: sample=inscriptions, kinds=taproot,inscription, mode=all, open=1, more=1.
import { For } from "solid-js";
import { FeeKey } from "../../components/FeeRate";
import TxGrid from "../../components/txgrid/TxGrid";
import { formatFeeRate, groupDigits } from "../../lib/format";
import { usePageTitle } from "../../lib/page";
import { createGoggles, type Goggles, GogglesControl, resultLine } from "./Goggles";
import { fakeTxid, type FlaggedTx, KINDS, type Mode, sample } from "./kinds";
import "./MockGoggles.css";

const query = () => new URLSearchParams(window.location.search);
const preset = (): { kinds?: string[]; mode?: Mode } => {
  const q = query();
  const kinds = q.get("kinds");
  const mode = q.get("mode");
  return {
    ...(kinds === null
      ? {}
      : { kinds: kinds.split(",").filter((k) => KINDS.some((x) => x.key === k)) }),
    ...(mode === "all" || mode === "any" ? { mode } : {}),
  };
};

const txid = (tx: { id: number | string }) => Promise.resolve(fakeTxid(tx.id));

/** The canvas's text alternative, with what is lit. */
const label = (g: Goggles, txs: readonly FlaggedTx[]) => {
  const lit =
    g.picked().length === 0
      ? ""
      : ` Highlighted: ${g
          .picked()
          .map((k) => k.label)
          .join(g.mode() === "any" ? " or " : " and ")}, ${resultLine(g, txs)}.`;
  return `Map of the block's ${groupDigits(txs.length)} transactions, one rectangle each, the highest fee rate at the top left.${lit}`;
};

function MockNav(props: { here: string }) {
  const links = [
    ["/mock/goggles", "Block"],
    ["/mock/goggles?sample=inscriptions", "Block, 2023"],
    ["/mock/goggles/home", "Home strip"],
    ["/mock/goggles/inline", "Alternative: inline"],
  ] as const;
  return (
    <nav class="ggm-nav" aria-label="Mockup pages">
      <span class="ggm-nav__tag">Mockup</span>
      <For each={links}>
        {([href, name]) => (
          <a
            href={href}
            rel="external"
            class="ggm-nav__link"
            aria-current={props.here === name ? "page" : undefined}
          >
            {name}
          </a>
        )}
      </For>
    </nav>
  );
}

const median = (txs: readonly FlaggedTx[]) => {
  const rates = txs.filter((t) => t.coinbase !== true).map((t) => t.fee / t.vsize);
  rates.sort((a, b) => a - b);
  return rates[Math.floor(rates.length / 2)] ?? 0;
};

/** A block page's facts and map, with the goggles bar under the map. */
function BlockMock(props: { dock: "beside" | "inline"; here: string }) {
  const inscriptions = query().get("sample") === "inscriptions";
  const txs = sample(inscriptions ? "inscriptions" : "recent");
  const g = createGoggles(preset());
  let frame: HTMLDivElement | undefined;
  const height = inscriptions ? "790 000" : "975 411";
  usePageTitle(() => `Mockup: goggles, block ${height}`);
  const size = txs.reduce((s, t) => s + t.vsize, 0);
  return (
    <main class="ggm wrap" id="main">
      <MockNav here={inscriptions ? "Block, 2023" : props.here} />
      <h1 class="ggm-title">
        Block <span class="num">{height}</span>
      </h1>
      <div class="ggm-layout">
        <section class="ggm-facts panel" aria-label="Facts">
          <dl>
            <div>
              <dt>Transactions</dt>
              <dd class="num">{groupDigits(txs.length)}</dd>
            </div>
            <div>
              <dt>Size</dt>
              <dd class="num">{(size / 1e6).toFixed(2)} MvB</dd>
            </div>
            <div>
              <dt>Median fee</dt>
              <dd class="num">{formatFeeRate(median(txs))} sat/vB</dd>
            </div>
            <div>
              <dt>Sample</dt>
              <dd>{inscriptions ? "A third inscriptions" : "Recent, lopsided"}</dd>
            </div>
          </dl>
        </section>
        <figure class="ggm-core panel">
          <div class="ggm-frame" ref={frame}>
            <div class="ggm-grid">
              <TxGrid
                txs={txs}
                capacity={1_000_000}
                label={label(g, txs)}
                txid={txid}
                lit={g.lit()}
              />
            </div>
          </div>
          <GogglesControl
            goggles={g}
            txs={txs}
            dock={props.dock}
            frame={() => frame}
            startOpen={query().get("open") === "1"}
            startMore={query().get("more") === "1"}
          />
          <figcaption class="ggm-caption">
            One rectangle a transaction, by size and fee rate.
          </figcaption>
          <FeeKey />
        </figure>
      </div>
    </main>
  );
}

export function BlockPage() {
  return <BlockMock dock="beside" here="Block" />;
}
export function InlinePage() {
  return <BlockMock dock="inline" here="Alternative: inline" />;
}

/** The home page's strip, its next block drawn as a grid. */
export function HomePage() {
  const txs = sample("recent");
  const g = createGoggles(preset());
  usePageTitle(() => "Mockup: goggles, home");
  let frame: HTMLDivElement | undefined;
  return (
    <main id="main">
      <section class="ggm-strip" aria-labelledby="ggm-strip-title">
        <div class="wrap">
          <MockNav here="Home strip" />
          <div class="ggm-strip__head">
            <h1 id="ggm-strip-title" class="ggm-strip__title">
              Blocks
            </h1>
            <GogglesControl
              goggles={g}
              txs={txs}
              dock="below"
              frame={() => frame}
              startOpen={query().get("open") === "1"}
              startMore={query().get("more") === "1"}
            />
          </div>
          <div class="ggm-strip__track">
            <div class="ggm-tile ggm-tile--next">
              <span class="ggm-tile__title">Next block</span>
              <div class="ggm-tile__grid" ref={frame}>
                <TxGrid
                  txs={txs}
                  capacity={1_000_000}
                  label={label(g, txs)}
                  txid={txid}
                  lit={g.lit()}
                />
              </div>
              <span class="ggm-tile__foot num">
                ~{formatFeeRate(median(txs))} sat/vB · {groupDigits(txs.length)} txs
              </span>
            </div>
            <div class="ggm-now" aria-hidden="true" />
            <div class="ggm-tile ggm-tile--mined" aria-hidden="true">
              <span class="num">975 410</span>
            </div>
            <div class="ggm-tile ggm-tile--mined" aria-hidden="true">
              <span class="num">975 409</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
