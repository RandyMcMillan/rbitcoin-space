// Mockup: a pasted invoice, read. Only BOLT 11's published example with route hints decodes here
// (the specification's "fallback address and extra routing info" example); its fields below are as
// the specification's own breakdown gives them. A real build would decode any invoice in the page.
import { createSignal, For, Show } from "solid-js";
import { CopyButton } from "../../../components/CopyButton";
import { Hash } from "../../../components/Hash";
import { formatDay } from "../../../components/chart/scale";
import { formatUtc, groupDigits } from "../../../lib/format";
import { Icon, MockChannelLink, MockNodeName } from "./parts";

export const SAMPLE_INVOICE =
  "lnbc20m1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqhp58yjmdan79s6qqdhdzgynm4zwqd5d7xmw5fk98klysy043l2ahrqsfpp3qjmp7lwpagxun9pygexvgpjdc4jdj85fr9yq20q82gphp2nflc7jtzrcazrra7wwgzxqc8u7754cdlpfrmccae92qgzqvzq2ps8pqqqqqqpqqqqq9qqqvpeuqafqxu92d8lr6fvg0r5gv0heeeqgcrqlnm6jhphu9y00rrhy4grqszsvpcgpy9qqqqqqgqqqqq7qqzq9qrsgqdfjcdk6w3ak5pca9hwfwfh63zrrz06wwfya0ydlzpgzxkn5xagsqz7x9j4jwe7yj7vaf2k9lqsdk45kts2fd0fkr28am0u4w95tt2nsq76cqw0";

const DECODED = {
  network: "Bitcoin mainnet",
  amount: 2_000_000,
  created: 1_496_314_658,
  expiry: 3600,
  // The description is given only as its hash (the `h` field); the payer's wallet holds the text.
  descriptionHash: "3925b6f67e2c340036ed12093dd44e0368df1b6ea26c53dbe4811f58fd5db8c1",
  paymentHash: "0001020304050607080900010203040506070809000102030405060708090102",
  payee: "03e7156ae33b0a208d0744199163177e909e80176e55d97a2f221ede0f934dd9ad",
  fallback: "1RustyRX2oai4EYYDpQGWvEL62BBGqN9T",
  hints: [
    {
      node: "029e03a901b85534ff1e92c43c74431f7ce72046060fcf7a95c37e148f78c77255",
      channel: "66051x263430x1800",
      base: 1,
      rate: 20,
      cltv: 3,
    },
    {
      node: "039e03a901b85534ff1e92c43c74431f7ce72046060fcf7a95c37e148f78c77255",
      channel: "197637x395016x2314",
      base: 2,
      rate: 30,
      cltv: 4,
    },
  ],
};

/**
 * The overview's search field. In this mockup it reads one thing, a pasted invoice; the card
 * appears only then, under the field. The site's own search finds nodes and channels.
 */
export function InvoiceSearch() {
  const [text, setText] = createSignal("");
  const clean = () =>
    text()
      .trim()
      .replace(/^lightning:/i, "")
      .toLowerCase();
  const isSample = () => clean() === SAMPLE_INVOICE;
  const looksLikeInvoice = () => /^ln(bc|tb|bcrt|tbs)\d*[munp]?1/.test(clean());
  return (
    <div class="lnm-search">
      <div class="lnm-invoice__field">
        <label class="lnm-filter">
          <span class="visually-hidden">Search, or paste a Lightning invoice to read it</span>
          <input
            class="lnm-input"
            type="search"
            placeholder="Search, or paste an invoice"
            spellcheck="false"
            autocomplete="off"
            value={text()}
            onInput={(e) => setText(e.currentTarget.value)}
          />
        </label>
        <button class="btn lnm-quiet" type="button" onClick={() => setText(SAMPLE_INVOICE)}>
          Paste the specification's example
        </button>
      </div>
      <Show when={text().trim() !== ""}>
        <Show
          when={isSample()}
          fallback={
            <p class="ln-aside" role="status">
              {looksLikeInvoice()
                ? "This mockup reads only the specification's example; the real field would read any invoice, in the browser, without sending it anywhere."
                : "In this mockup the field reads invoices only; the site's search in the header finds nodes and channels."}
            </p>
          }
        >
          <Card />
        </Show>
      </Show>
    </div>
  );
}

function Card() {
  const expires = DECODED.created + DECODED.expiry;
  return (
    <article class="lnm-invoice" aria-label="The invoice, read">
      <div class="lnm-invoice__top">
        <div>
          <p class="lnm-invoice__label">Asks for</p>
          <p class="lnm-invoice__amount num">{groupDigits(DECODED.amount)} sats</p>
          <p class="muted num">On {DECODED.network}</p>
        </div>
        <span class="lnm-tag lnm-tag--negative">
          <Icon name="cross" />
          Expired {formatDay(expires)}
        </span>
      </div>
      <dl class="ln-facts lnm-invoice__facts">
        <div class="ln-fact">
          <dt>Description</dt>
          <dd>
            Only its hash: the payer's wallet must hold the text
            <span class="ln-fact__sub">
              <Hash value={DECODED.descriptionHash} copyLabel="Copy description hash" />
            </span>
          </dd>
        </div>
        <div class="ln-fact">
          <dt>Created</dt>
          <dd class="num">{formatUtc(DECODED.created)}</dd>
        </div>
        <div class="ln-fact">
          <dt>Expiry</dt>
          <dd>One hour (the default), so {formatUtc(expires)}</dd>
        </div>
        <div class="ln-fact">
          <dt>Payee</dt>
          <dd>
            <MockNodeName node={{ id: DECODED.payee, alias: null }} />
            <span class="ln-fact__sub">Recovered from the signature</span>
          </dd>
        </div>
        <div class="ln-fact">
          <dt>Payment hash</dt>
          <dd>
            <Hash value={DECODED.paymentHash} copyLabel="Copy payment hash" />
          </dd>
        </div>
        <div class="ln-fact">
          <dt>On-chain fallback</dt>
          <dd>
            <span class="lnm-connect">
              <span class="mono">{DECODED.fallback}</span>
              <CopyButton value={DECODED.fallback} label="Copy fallback address" />
            </span>
          </dd>
        </div>
      </dl>
      <h3 class="lnm-invoice__hints">Route hints: the last hops to a private node</h3>
      <p class="ln-aside">
        These come from the invoice, as its maker wrote them; the public graph does not confirm
        them, and the page looks nothing up.
      </p>
      <ol class="lnm-hints">
        <For each={DECODED.hints}>
          {(h) => (
            <li>
              <MockNodeName node={{ id: h.node, alias: null }} />
              <span>
                over <MockChannelLink id={h.channel} />
              </span>
              <span class="num muted">
                {h.rate} ppm + {h.base} msat, time lock {h.cltv} blocks
              </span>
            </li>
          )}
        </For>
      </ol>
    </article>
  );
}
