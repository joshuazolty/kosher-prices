"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type Store = { id: string; name: string; sort_order: number };

type Variant = {
  id: string;
  product_name: string;
  brand_name: string;
  size_value: number | null;
  size_unit: string | null;
  flavour: string | null;
};

export default function AddPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);

  const [storeId, setStoreId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [price, setPrice] = useState("");

  const [priceType, setPriceType] = useState<"regular" | "sale">("regular");
  const [saleEndDate, setSaleEndDate] = useState(""); // optional YYYY-MM-DD

  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    async function load() {
      const { data: s } = await supabase
        .from("stores")
        .select("id,name,sort_order")
        .order("sort_order", { ascending: true });

      const { data: vData, error: vErr } = await supabase
        .from("product_variants")
        .select("id, size_value, size_unit, flavour, products(name), brands(name)")
        .limit(5000);

      if (vErr) console.error(vErr);

      const mapped: Variant[] = (vData ?? []).map((v: any) => ({
        id: v.id,
        product_name: v.products?.name ?? "",
        brand_name: v.brands?.name ?? "",
        size_value: v.size_value,
        size_unit: v.size_unit,
        flavour: v.flavour,
      }));

      mapped.sort((a, b) => {
        const keyA = `${a.product_name} ${a.brand_name} ${a.size_value ?? ""}${a.size_unit ?? ""} ${a.flavour ?? ""}`.toLowerCase();
        const keyB = `${b.product_name} ${b.brand_name} ${b.size_value ?? ""}${b.size_unit ?? ""} ${b.flavour ?? ""}`.toLowerCase();
        return keyA.localeCompare(keyB);
      });

      setStores(s ?? []);
      setVariants(mapped);
    }

    load();
  }, []);

  const variantOptions = useMemo(() => variants, [variants]);

  async function submit() {
    setStatus("");

    if (!storeId) return setStatus("Pick a store.");
    if (!variantId) return setStatus("Pick a product (brand/size/flavour).");

    const dollars = Number(price);
    if (!Number.isFinite(dollars) || dollars <= 0) return setStatus("Enter a valid price like 12.99.");

    const cents = Math.round(dollars * 100);

    const { error } = await supabase.from("price_submissions").insert({
      store_id: storeId,
      variant_id: variantId,
      price_cents: cents,
      price_type: priceType,
      sale_end_date: priceType === "sale" && saleEndDate ? saleEndDate : null,
    });

    if (error) return setStatus("Error: " + error.message);

    setStatus("Saved! If it doesn’t appear right away, it may be pending approval.");
    setPrice("");
  }

  return (
    <main
      style={{
        padding: "32px 24px",
        fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
        maxWidth: 1400,
        margin: "0 auto",
      }}
    >
      <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: -0.5, marginBottom: 6 }}>
        Submit a Price
      </h1>

      <div style={{ color: "#666", marginBottom: 16, fontSize: 16, lineHeight: 1.4 }}>
        Enter what you paid. Submissions are time-stamped.
      </div>

      <div style={{ display: "grid", gap: 12, maxWidth: 560 }}>
        <label>
          Store
          <select value={storeId} onChange={(e) => setStoreId(e.target.value)} style={inputStyle}>
            <option value="">Select…</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Product (brand + size + flavour)
          <select value={variantId} onChange={(e) => setVariantId(e.target.value)} style={inputStyle}>
            <option value="">Select…</option>
            {variantOptions.map((v) => {
              const size =
                v.size_value != null && v.size_unit ? ` — ${v.size_value}${v.size_unit}` : "";
              const flav = v.flavour ? ` — ${v.flavour}` : "";
              return (
                <option key={v.id} value={v.id}>
                  {v.brand_name} — {v.product_name}
                  {size}
                  {flav}
                </option>
              );
            })}
          </select>

          <div style={{ fontSize: 12, marginTop: 6 }}>
            Missing an item?{" "}
            <a href="/add-product" style={{ textDecoration: "underline" }}>
              Add a product
            </a>
          </div>
        </label>

        <label>
          Type
          <select
            value={priceType}
            onChange={(e) => setPriceType(e.target.value as "regular" | "sale")}
            style={inputStyle}
          >
            <option value="regular">Regular</option>
            <option value="sale">Sale</option>
          </select>
        </label>

        <label>
          Price (CAD)
          <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="12.99" style={inputStyle} />
        </label>

        {priceType === "sale" ? (
          <label>
            Sale end date (optional)
            <input
              type="date"
              value={saleEndDate}
              onChange={(e) => setSaleEndDate(e.target.value)}
              style={inputStyle}
            />
          </label>
        ) : null}

        <button onClick={submit} style={buttonStyle}>
          Submit
        </button>

        {status ? <div>{status}</div> : null}

        <a href="/" style={{ textDecoration: "underline" }}>
          Back to homepage
        </a>
      </div>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 6,
  padding: 10,
  border: "1px solid #ddd",
  borderRadius: 8,
};

const buttonStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #111",
  background: "#111",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};
