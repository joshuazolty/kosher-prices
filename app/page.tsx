"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Mode = "best" | "regular" | "sale";

type Store = { id: string; name: string; sort_order: number };

type Variant = {
  id: string;
  product_name: string;
  brand_name: string;
  size_value: number | null;
  size_unit: string | null;
  flavour: string | null;
};

type Submission = {
  id: string;
  store_id: string;
  variant_id: string;
  price_cents: number;
  price_type: "regular" | "sale";
  sale_end_date: string | null;
  created_at: string;
};

export default function Home() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<Mode>("best");


  const [stores, setStores] = useState<Store[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyWithPrices, setOnlyWithPrices] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);

      const { data: storeData, error: storeErr } = await supabase
        .from("stores")
        .select("id,name,sort_order")
        .order("sort_order", { ascending: true });

      const { data: vData, error: vErr } = await supabase
        .from("product_variants")
        .select("id, size_value, size_unit, flavour, products(name), brands(name)")
        .limit(5000);

      const { data: subData, error: subErr } = await supabase
  .from("price_submissions")
  .select("id,store_id,variant_id,price_cents,price_type,sale_end_date,created_at")
  .eq("is_approved", true)
  .order("created_at", { ascending: false })
  .limit(5000);

      if (storeErr) console.error(storeErr);
      if (vErr) console.error(vErr);
      if (subErr) console.error(subErr);

      const mappedVariants: Variant[] = (vData ?? []).map((v: any) => ({
        id: v.id,
        product_name: v.products?.name ?? "",
        brand_name: v.brands?.name ?? "",
        size_value: v.size_value,
        size_unit: v.size_unit,
        flavour: v.flavour,
      }));

      mappedVariants.sort((a, b) => {
        const keyA =
          `${a.product_name} ${a.brand_name} ${a.size_value ?? ""}${a.size_unit ?? ""} ${a.flavour ?? ""}`.toLowerCase();
        const keyB =
          `${b.product_name} ${b.brand_name} ${b.size_value ?? ""}${b.size_unit ?? ""} ${b.flavour ?? ""}`.toLowerCase();
        return keyA.localeCompare(keyB);
      });

      setStores(storeData ?? []);
      setVariants(mappedVariants);
      setSubmissions(subData ?? []);
      setLoading(false);
    }

    load();
  }, []);

  const filteredVariants = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return variants;

    return variants.filter((v) => {
      const label =
        `${v.brand_name} ${v.product_name} ${v.size_value ?? ""}${v.size_unit ?? ""} ${v.flavour ?? ""}`.toLowerCase();
      return label.includes(q);
    });
  }, [query, variants]);

  // Build “latest regular + latest sale” map per (variant, store)
  const latest = useMemo(() => {
    const map: Record<string, Record<string, { regular?: Submission; sale?: Submission }>> = {};

    for (const s of submissions) {
      if (!s.variant_id) continue;

      map[s.variant_id] ||= {};
      map[s.variant_id][s.store_id] ||= {};

      const slot = map[s.variant_id][s.store_id];

      // Only set if empty because submissions is already ordered newest-first
      if (s.price_type === "regular" && !slot.regular) slot.regular = s;
      if (s.price_type === "sale" && !slot.sale) slot.sale = s;
    }

    return map;
  }, [submissions]);

  function daysAgo(iso: string) {
    const ms = Date.now() - new Date(iso).getTime();
    return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
  }

  function isSaleStillValid(sale: Submission | undefined) {
    if (!sale) return false;
    if (!sale.sale_end_date) return true; // no end date => assume active
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(sale.sale_end_date + "T00:00:00");
    return end >= today;
  }

  function getDisplayPrice(variantId: string, storeId: string) {
    const slot = latest[variantId]?.[storeId];
    if (!slot) return {} as any;

    const regular = slot.regular ? slot.regular.price_cents / 100 : undefined;
    const saleOk = isSaleStillValid(slot.sale);
    const sale = slot.sale && saleOk ? slot.sale.price_cents / 100 : undefined;

    if (mode === "regular") {
      return slot.regular
        ? { price: regular, isSale: false, created_at: slot.regular.created_at }
        : {};
    }

    if (mode === "sale") {
      return slot.sale && saleOk
        ? { price: sale, isSale: true, created_at: slot.sale.created_at }
        : {};
    }

    // best
    if (sale != null && regular != null) {
      return sale <= regular
        ? { price: sale, isSale: true, created_at: slot.sale!.created_at }
        : { price: regular, isSale: false, created_at: slot.regular!.created_at };
    }
    if (sale != null) return { price: sale, isSale: true, created_at: slot.sale!.created_at };
    if (regular != null) return { price: regular, isSale: false, created_at: slot.regular!.created_at };
    return {};
  }

  function getCheapestInfo(variantId: string) {
    const vals: { storeId: string; price: number }[] = [];


    for (const s of stores) {
      const cell = getDisplayPrice(variantId, s.id);
      if (cell.price != null) vals.push({ storeId: s.id, price: cell.price });
    }

    vals.sort((a, b) => a.price - b.price);

    const cheapest = vals[0];
    const second = vals[1];

    if (!cheapest) return { cheapestStoreId: null as string | null, savePct: null as number | null };
    if (!second) return { cheapestStoreId: cheapest.storeId, savePct: null };

    const savePct = ((second.price - cheapest.price) / second.price) * 100;
    return { cheapestStoreId: cheapest.storeId, savePct: Math.round(savePct * 10) / 10 };
  }

  function variantLabel(v: Variant) {
    const size = v.size_value != null && v.size_unit ? ` — ${v.size_value}${v.size_unit}` : "";
    const flav = v.flavour ? ` — ${v.flavour}` : "";
    return `${v.brand_name} — ${v.product_name}${size}${flav}`;
  }
const hasAnyPrice = (variantId: string) => {
  for (const s of stores) {
    const cell = getDisplayPrice(variantId, s.id);
    if (cell.price != null) return true;
  }
  return false;
};

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Kosher Prices (Toronto)</h1>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products…"
          style={{
            width: "100%",
            maxWidth: 520,
            padding: 10,
            border: "1px solid #ddd",
            borderRadius: 8,
          }}
        />

        <div style={{ display: "flex", gap: 8 }}>
          <ToggleButton active={mode === "best"} onClick={() => setMode("best")}>
            Best
          </ToggleButton>
          <ToggleButton active={mode === "regular"} onClick={() => setMode("regular")}>
            Regular
          </ToggleButton>
          <ToggleButton active={mode === "sale"} onClick={() => setMode("sale")}>
            Sale
          </ToggleButton>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#444" }}>
  <input
    type="checkbox"
    checked={onlyWithPrices}
    onChange={(e) => setOnlyWithPrices(e.target.checked)}
  />
  Only show items with prices
</label>
<a
  href="/moderate"
  style={{
    display: "inline-block",
    marginLeft: 10,
    padding: "10px 16px",
    border: "1px solid #111",
    borderRadius: 10,
    textDecoration: "none",
    fontWeight: 700,
  }}
>
  Moderate
</a>

      </div>

      <a
        href="/add"
        style={{
          display: "inline-block",
          marginBottom: 12,
          padding: "10px 16px",
          background: "#16a34a",
          color: "white",
          borderRadius: 10,
          textDecoration: "none",
          fontWeight: 700,
        }}
      >
        + Submit a Price
      </a>

      <a
        href="/add-product"
        style={{
          display: "inline-block",
          marginLeft: 10,
          marginBottom: 12,
          padding: "10px 16px",
          border: "1px solid #111",
          color: "#111",
          borderRadius: 10,
          textDecoration: "none",
          fontWeight: 700,
          background: "white",
        }}
      >
        + Add a Product
      </a>

      <div style={{ color: "#666", fontSize: 13, marginBottom: 16 }}>
        Prices are crowd-submitted and time-stamped. Always double-check in store.
      </div>

      {loading ? (
        <div style={{ color: "#666" }}>Loading…</div>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid #eee", borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1000 }}>
            <thead>
              <tr>
                <th style={thStyle}>Product</th>
                {stores.map((s) => (
                  <th key={s.id} style={thStyle}>
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {filteredVariants
  .filter((v) => (onlyWithPrices ? hasAnyPrice(v.id) : true))
  .map((v) => {

                const { cheapestStoreId, savePct } = getCheapestInfo(v.id);
                return (
                  <tr key={v.id}>
                    <td style={tdStyleStrong}>{variantLabel(v)}</td>

                    {stores.map((s) => {
                      const cell = getDisplayPrice(v.id, s.id);
                      const isCheapest = cheapestStoreId === s.id && cell.price != null;

                      return (
                        <td
                          key={s.id}
                          style={{
                            ...tdStyle,
                            background: isCheapest ? "#eaf7ee" : undefined,
                          }}
                        >
                          {cell.price == null ? (
                            <span style={{ color: "#888" }}>—</span>
                          ) : (
                            <div>
                              <div style={{ fontWeight: isCheapest ? 700 : 600 }}>
                                ${cell.price.toFixed(2)}
                                {cell.isSale ? <span style={pillStyle}>SALE</span> : null}
                              </div>

                              <div style={{ fontSize: 12, color: "#777" }}>
                                {cell.created_at ? `${daysAgo(cell.created_at)}d ago` : ""}
                                {isCheapest && savePct != null ? (
                                  <span style={{ marginLeft: 8, color: "#1f7a3a" }}>Save {savePct}%</span>
                                ) : null}
                              </div>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function ToggleButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "10px 12px",
        borderRadius: 8,
        border: "1px solid #ddd",
        background: active ? "#111" : "#fff",
        color: active ? "#fff" : "#111",
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  fontWeight: 600,
  fontSize: 13,
  padding: 12,
  borderBottom: "1px solid #eee",
  background: "#fafafa",
  whiteSpace: "nowrap",
};

const tdStyleStrong: React.CSSProperties = {
  padding: 12,
  borderBottom: "1px solid #f2f2f2",
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: 12,
  borderBottom: "1px solid #f2f2f2",
  whiteSpace: "nowrap",
  verticalAlign: "top",
};

const pillStyle: React.CSSProperties = {
  fontSize: 11,
  border: "1px solid #ddd",
  borderRadius: 999,
  padding: "2px 8px",
  marginLeft: 6,
};
