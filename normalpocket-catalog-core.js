"use strict";

(function attachNormalPocketCatalog(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && typeof root === "object") root.NormalPocketCatalog = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createNormalPocketCatalog() {
  const MAX_QUANTITY = 1_000_000;
  const MAX_SATANG = 10_000_000_000;
  const LEGACY_PRODUCT_ID = "PRODUCT-LEGACY-STOCK";

  function cleanText(value, maximum = 160) {
    return String(value ?? "").trim().slice(0, maximum);
  }

  function integer(value, { allowNull = false, maximum = Number.MAX_SAFE_INTEGER, label = "จำนวน" } = {}) {
    if (allowNull && (value === null || value === undefined || value === "")) return null;
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 0 || number > maximum) {
      throw new Error(`${label}ไม่ถูกต้อง`);
    }
    return number;
  }

  function normalizeMoney(value, allowNull = true) {
    return integer(value, { allowNull, maximum: MAX_SATANG, label: "จำนวนเงิน" });
  }

  function normalizeQuantity(value) {
    return integer(value ?? 0, { maximum: MAX_QUANTITY, label: "จำนวนสินค้า" });
  }

  function uniqueValues(values) {
    const result = [];
    const seen = new Set();
    for (const raw of Array.isArray(values) ? values : []) {
      const value = cleanText(raw, 80);
      if (!value) continue;
      const key = value.toLocaleLowerCase("th-TH");
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(value);
    }
    return result;
  }

  function slug(value) {
    const encoded = encodeURIComponent(cleanText(value, 120))
      .replaceAll("%", "")
      .replace(/[^A-Za-z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    return encoded || "option";
  }

  function combinationKey(options) {
    return Object.keys(options || {})
      .sort()
      .map(key => `${key}:${cleanText(options[key], 80).toLocaleLowerCase("th-TH")}`)
      .join("|");
  }

  function generateVariants(optionValues = {}) {
    const orderedKeys = ["color", "size", ...Object.keys(optionValues).filter(key => !["color", "size"].includes(key))]
      .filter((key, index, keys) => keys.indexOf(key) === index)
      .filter(key => uniqueValues(optionValues[key]).length > 0);
    if (!orderedKeys.length) return [];

    let combinations = [{}];
    for (const key of orderedKeys) {
      const values = uniqueValues(optionValues[key]);
      combinations = combinations.flatMap(existing => values.map(value => ({ ...existing, [key]: value })));
    }

    return combinations.map((options, index) => ({
      id: `VARIANT-${index + 1}-${orderedKeys.map(key => slug(options[key])).join("-")}`,
      options,
      sku: "",
      barcode: "",
      salePriceSatang: null,
      costSatang: null,
      stockQty: 0,
      active: true
    }));
  }

  function normalizeVariant(input, fallbackId) {
    const variant = input && typeof input === "object" ? input : {};
    const options = {};
    for (const [key, raw] of Object.entries(variant.options && typeof variant.options === "object" ? variant.options : {})) {
      const normalizedKey = cleanText(key, 40);
      const normalizedValue = cleanText(raw, 80);
      if (normalizedKey && normalizedValue) options[normalizedKey] = normalizedValue;
    }
    return {
      ...variant,
      id: cleanText(variant.id, 160) || fallbackId,
      options,
      sku: cleanText(variant.sku, 100),
      barcode: cleanText(variant.barcode, 100),
      salePriceSatang: normalizeMoney(variant.salePriceSatang, true),
      costSatang: normalizeMoney(variant.costSatang, true),
      stockQty: normalizeQuantity(variant.stockQty),
      active: variant.active !== false
    };
  }

  function normalizeProduct(input, index = 0) {
    const product = input && typeof input === "object" ? input : {};
    const variants = Array.isArray(product.variants)
      ? product.variants.map((variant, variantIndex) => normalizeVariant(variant, `VARIANT-${index + 1}-${variantIndex + 1}`))
      : [];

    const seen = new Set();
    for (const variant of variants) {
      const key = combinationKey(variant.options);
      if (!key) throw new Error(`ตัวเลือกสินค้า ${variant.id} ต้องมีค่าอย่างน้อยหนึ่งรายการ`);
      if (seen.has(key)) throw new Error("ตัวเลือกสินค้าซ้ำกัน");
      seen.add(key);
    }

    const normalized = {
      ...product,
      id: cleanText(product.id, 160) || `PRODUCT-${index + 1}`,
      name: cleanText(product.name, 160) || "สินค้า",
      category: cleanText(product.category, 100),
      salePriceSatang: normalizeMoney(product.salePriceSatang, false) ?? 0,
      costSatang: normalizeMoney(product.costSatang, true),
      unit: cleanText(product.unit, 40) || "ชิ้น",
      sku: cleanText(product.sku, 100),
      barcode: cleanText(product.barcode, 100),
      description: cleanText(product.description, 600),
      imageRef: cleanText(product.imageRef, 500),
      variants,
      active: product.active !== false,
      legacyImported: Boolean(product.legacyImported)
    };
    normalized.stockQty = variants.length ? 0 : normalizeQuantity(product.stockQty);
    return normalized;
  }

  function productStockQty(product) {
    const variants = Array.isArray(product?.variants) ? product.variants : [];
    if (variants.length) {
      return variants
        .filter(variant => variant && variant.active !== false)
        .reduce((sum, variant) => sum + normalizeQuantity(variant.stockQty), 0);
    }
    return normalizeQuantity(product?.stockQty);
  }

  function catalogStockQty(store) {
    return (Array.isArray(store?.products) ? store.products : [])
      .reduce((sum, product) => sum + productStockQty(product), 0);
  }

  function normalizeStore(store) {
    if (!store || typeof store !== "object") throw new Error("ข้อมูลร้านค้าไม่ถูกต้อง");
    const legacyQty = normalizeQuantity(store.stockQty);
    store.products = Array.isArray(store.products)
      ? store.products.map((product, index) => normalizeProduct(product, index))
      : [];

    if (store.products.length === 0 && legacyQty > 0) {
      store.products.push(normalizeProduct({
        id: LEGACY_PRODUCT_ID,
        name: "สินค้าคงเหลือเดิม",
        category: "",
        salePriceSatang: 0,
        costSatang: null,
        unit: "ชิ้น",
        stockQty: legacyQty,
        variants: [],
        active: true,
        legacyImported: true
      }, 0));
    }

    store.stockQty = catalogStockQty(store);
    return store;
  }

  function resolveStockOwner(product, variantId) {
    if (!product || typeof product !== "object") throw new Error("ไม่พบสินค้า");
    const variants = Array.isArray(product.variants) ? product.variants.filter(variant => variant.active !== false) : [];
    if (!variants.length) return product;
    const requested = cleanText(variantId, 160);
    if (!requested) throw new Error("กรุณาเลือกตัวเลือกสินค้า");
    const variant = variants.find(item => item.id === requested);
    if (!variant) throw new Error("ไม่พบตัวเลือกสินค้า");
    return variant;
  }

  function effectiveSalePriceSatang(product, variant) {
    const override = variant && variant.salePriceSatang !== null && variant.salePriceSatang !== undefined && variant.salePriceSatang !== ""
      ? normalizeMoney(variant.salePriceSatang, false)
      : null;
    if (override !== null) return override;
    return normalizeMoney(product?.salePriceSatang, false) ?? 0;
  }

  function effectiveCostSatang(product, variant) {
    const override = variant && variant.costSatang !== null && variant.costSatang !== undefined && variant.costSatang !== ""
      ? normalizeMoney(variant.costSatang, true)
      : null;
    if (override !== null) return override;
    return normalizeMoney(product?.costSatang, true);
  }

  function adjustStock(product, variantId, delta) {
    if (!Number.isSafeInteger(Number(delta))) throw new Error("จำนวนปรับสต็อกไม่ถูกต้อง");
    const change = Number(delta);
    const owner = resolveStockOwner(product, variantId);
    const before = normalizeQuantity(owner.stockQty);
    const after = before + change;
    if (!Number.isSafeInteger(after) || after < 0) throw new Error("สต็อกไม่พอ");
    if (after > MAX_QUANTITY) throw new Error("จำนวนสินค้าเกินขอบเขตที่ระบบรองรับ");
    owner.stockQty = after;
    if (Array.isArray(product.variants) && product.variants.length) product.stockQty = 0;
    return owner;
  }

  function optionLabel(variant) {
    const options = variant?.options && typeof variant.options === "object" ? variant.options : {};
    return Object.values(options).filter(Boolean).join(" / ");
  }

  function snapshotSelection(product, variantId) {
    const owner = resolveStockOwner(product, variantId);
    const isVariant = owner !== product;
    return {
      productId: product.id,
      productName: product.name,
      variantId: isVariant ? owner.id : null,
      options: isVariant ? { ...owner.options } : {},
      optionLabel: isVariant ? optionLabel(owner) : "",
      unit: product.unit || "ชิ้น",
      salePriceSatang: effectiveSalePriceSatang(product, isVariant ? owner : null)
    };
  }

  return Object.freeze({
    LEGACY_PRODUCT_ID,
    normalizeStore,
    normalizeProduct,
    generateVariants,
    productStockQty,
    catalogStockQty,
    resolveStockOwner,
    effectiveSalePriceSatang,
    effectiveCostSatang,
    adjustStock,
    optionLabel,
    snapshotSelection
  });
});
