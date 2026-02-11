"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type Brand = { id: string; name: string };
type Product = { id: string; name: string };

export default function AddProductPage() {
  const [brands, setBrands] = useState<Brand[]>([]);

  // Form fields
  const [productName, setProductName] = useState("");
  const [brandId, setBrandId] = useState("");
  const [newBrandName, setNewBrandName] = useState("");
  const [sizeValue, setSizeValue] = useState(""); // numeric text
  const [sizeUnit, setSizeUnit] = useState("L");
  const [flavour, setFlavour] = useState("");
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    async function load() {
      const { data: b } = await supabase
        .from("brands")
        .select("id,name")
        .order("name", { ascending: true });

      setBrands(b ?? []);
    }
    load();
  }, []);

  const brandOptions = useMemo(() => brands, [brands]);

  function normalizeName(s: string) {
    return s.trim().replace(/\s+/g, " ");
  }

  async function getOrCreateProduct(name: string) {
    const { data, error } = await supabase
      .from("products")
      .upsert({ name }, { onConflict: "name" })
      .select("id,name")
      .single();

    if (error) throw error;
    return data as Product;
  }

  async function getOrCreateBrand(name: string) {
    const { data, error } = await supabase
      .from("brands")
      .upsert({ name }, { onConflict: "name" })
      .select("id,name")
      .single();

    if (error) throw error;
    return data as Brand;
  }

  async function createVariant(args: {
    product_id: string;
    brand_id: string;
    size_value: number | null;
    size_unit: string | null;
    flavour: string | null;
    notes: string | null;
  }) {
    const { data: inserted, error: insErr } = await supabase
      .from("product_variants")
      .insert(args)
      .select("id")
      .single();

    if (!insErr) return inserted;

    const { data: existing, error: selErr } = await supabase
      .from("product_variants")
      .select("id")
      .eq("product_id", args.product_id)
      .eq("brand_id", args.brand_id)
      .is("size_value", args.size_value)
      .is("size_unit", args.size_unit)
      .is("flavour", args.flavour)
      .single();

    if (selErr) throw insErr;
    return existing;
  }

  async function submit() {
    setStatus("");

    const pName = normalizeName(productName);
    if (!pName) return setStatus("Please enter a product name.");

    const usingNewBrand = normalizeName(newBrandName).length > 0;
    if (!brandId && !usingNewBrand) return setStatus("Pick a brand OR type a new brand.");

    const sizeValNum = normalizeName(sizeValue) === "" ? null : Number(sizeValue);
    if (sizeValNum !== null && (!Number.isFinite(sizeValNum) || sizeValNum <= 0)) {
      return setStatus("Size must be a positive number (or leave it blank).");
    }

    const unit = normalizeName(sizeUnit);
    if (sizeValNum !== null && !unit) return setStatus("Please choose a unit.");

    setSaving(true);

    try {
      const product = await getOrCreateProduct(pName);

      const brand = usingNewBrand
        ? await getOrCreateBrand(normalizeName(newBrandName))
        : brands.find((b) => b.id === brandId);

      if (!brand) throw new Error("Brand not found (try refresh and select again).");

      const variantArgs = {
        product_id: product.id,
        brand_id: brand.id,
        size_value: sizeValNum,
        size_unit: sizeValNum === null ? null : unit,
        flavour: flavour.trim() ? flavour.trim() : null,
        notes: normalizeName(notes) ? normalizeName(notes) : null,
      };

      const variant = await createVariant(variantArgs);

      // Refresh brand list (in case you added a new one)
      const { data: b } = await supabase
        .from("brands")
        .select("id,name")
        .order("name", { ascending: true });
      setBrands(b ?? []);

      setStatus(`Saved! Variant created (id: ${variant.id}). You can now submit a price on /add.`);
      setProductName("");
      setBrandId("");
      setNewBrandName("");
      setSizeValue("");
      setSizeUnit("L");
      setFlavour("");
      setNotes("");
    } catch (e: any) {
      console.error(e);
      setStatus(`Error: ${e?.message ?? "Unknown error"}`);
    }

    setSaving(false);
  }

  return (
    <main
      style={{
        padding: "32px 24px",
        fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
        maxWidth: 900,
        margin: "0 auto",
      }}
    >
      <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: -0.5, marginBottom: 6 }}>
        Add a Product
      </h1>
      <div style={{ color: "#666", marginBottom: 18, lineHeight: 1.4 }}>
        Create a specific item (brand + size + flavour) that people can price.
      </div>

      <div style={{ display: "grid", gap: 12, maxWidth: 520 }}>
        <label>
          Product name (generic)
          <input
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="e.g. Grape Juice"
            style={inputStyle}
          />
          <div style={hintStyle}>This is the general product category.</div>
        </label>

        <label>
          Brand (choose one)
          <select value={brandId} onChange={(e) => setBrandId(e.target.value)} style={inputStyle}>
            <option value="">Select…</option>
            {brandOptions.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Or add a new brand
          <input
            value={newBrandName}
            onChange={(e) => setNewBrandName(e.target.value)}
            placeholder="e.g. Kedem"
            style={inputStyle}
          />
          <div style={hintStyle}>If you type a new brand, you don’t need to select one above.</div>
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label>
            Size / volume (optional)
            <input
              value={sizeValue}
              onChange={(e) => setSizeValue(e.target.value)}
              placeholder="e.g. 1.5"
              style={inputStyle}
              inputMode="decimal"
            />
          </label>

          <label>
            Unit
            <select value={sizeUnit} onChange={(e) => setSizeUnit(e.target.value)} style={inputStyle}>
              <option value="L">L</option>
              <option value="ml">ml</option>
              <option value="kg">kg</option>
              <option value="g">g</option>
              <option value="lb">lb</option>
              <option value="oz">oz</option>
              <option value="pack">pack</option>
              <option value="each">each</option>
            </select>
          </label>
        </div>

        <label>
          Flavour (optional)
          <input
            value={flavour}
            onChange={(e) => setFlavour(e.target.value)}
            placeholder='e.g. “Concord”, “White”, “Vanilla”'
            style={inputStyle}
          />
        </label>

        <label>
          Notes (optional)
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder='e.g. “Family size”, “Frozen”, “Large eggs”'
            style={inputStyle}
          />
        </label>

        <button onClick={submit} disabled={saving} style={buttonStyle}>
          {saving ? "Saving..." : "Create product variant"}
        </button>

        {status ? (
          <div style={{ color: status.startsWith("Error") ? "crimson" : "#166534" }}>{status}</div>
        ) : null}

        <div style={{ display: "flex", gap: 14 }}>
          <a href="/add" style={{ textDecoration: "underline" }}>Submit a price</a>
          <a href="/" style={{ textDecoration: "underline" }}>Back to homepage</a>
        </div>
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
  fontWeight: 800,
  cursor: "pointer",
};

const hintStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#777",
  marginTop: 6,
};
