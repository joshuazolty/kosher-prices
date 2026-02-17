"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type PendingSubmission = {
  id: string;
  created_at: string;
  price_cents: number;
  price_type: "regular" | "sale";
  store_name: string;
  product_label: string;
};

export default function ModeratePage() {
  const [items, setItems] = useState<PendingSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("price_submissions")
        .select(`
          id,
          created_at,
          price_cents,
          price_type,
          stores(name),
          product_variants(
            size_value,
            size_unit,
            flavour,
            products(name),
            brands(name)
          )
        `)
        .eq("is_approved", false)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) {
        console.error(error);
        setLoading(false);
        return;
      }

      const mapped: PendingSubmission[] = (data ?? []).map((r: any) => {
        const size =
          r.product_variants?.size_value && r.product_variants?.size_unit
            ? ` — ${r.product_variants.size_value}${r.product_variants.size_unit}`
            : "";
        const flavour = r.product_variants?.flavour
          ? ` — ${r.product_variants.flavour}`
          : "";

        return {
          id: r.id,
          created_at: r.created_at,
          price_cents: r.price_cents,
          price_type: r.price_type,
          store_name: r.stores?.name ?? "",
          product_label: `${r.product_variants?.brands?.name ?? ""} — ${
            r.product_variants?.products?.name ?? ""
          }${size}${flavour}`,
        };
      });

      setItems(mapped);
      setLoading(false);
    }

    load();
  }, []);

  async function approve(id: string) {
  const { error } = await supabase
    .from("price_submissions")
    .update({ is_approved: true })
    .eq("id", id);

  if (error) {
    alert("Approve failed: " + error.message);
    return;
  }

  // only remove from UI if DB update succeeded
setItems((prev) => prev.filter((x) => x.id !== id));
}


  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 12 }}>
        Moderate Prices
      </h1>

      {loading ? (
        <div>Loading…</div>
      ) : items.length === 0 ? (
        <div>No pending submissions 🎉</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left">Product</th>
              <th align="left">Store</th>
              <th align="right">Price</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} style={{ borderTop: "1px solid #eee" }}>
                <td>{i.product_label}</td>
                <td>{i.store_name}</td>
                <td align="right">
                  ${(i.price_cents / 100).toFixed(2)}{" "}
                  {i.price_type === "sale" ? "(sale)" : ""}
                </td>
                <td>
                  <button onClick={() => approve(i.id)}>Approve</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: 20 }}>
        <a href="/" style={{ textDecoration: "underline" }}>
          Back to homepage
        </a>
      </div>
    </main>
  );
}
