"use strict";

(function normalPocketProducts(root) {
  if (typeof document === "undefined") return;
  const catalog = root.NormalPocketCatalog;
  if (!catalog) throw new Error("NormalPocketCatalog ไม่พร้อมใช้งาน");

  const originalDefaultState = defaultState;
  const originalNormalizeState = normalizeState;
  const originalRenderStore = renderStore;

  function syncStoreStock(target = state) {
    if (!target?.store) return 0;
    catalog.normalizeStore(target.store);
    target.store.stockQty = catalog.catalogStockQty(target.store);
    return target.store.stockQty;
  }

  function productById(id) {
    return (state?.store?.products || []).find(product => product.id === id) || null;
  }

  function activeProducts() {
    return (state?.store?.products || []).filter(product => product.active !== false);
  }

  function optionKey(options = {}) {
    return Object.keys(options).sort().map(key => `${key}:${String(options[key] || "").trim().toLocaleLowerCase("th-TH")}`).join("|");
  }

  function escProduct(value) {
    return typeof esc === "function" ? esc(value) : String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  }

  function splitOptions(value) {
    return String(value || "").split(/[,\n]/).map(item => item.trim()).filter(Boolean);
  }

  function productCostBasis(product) {
    if (!product) return 0;
    if (!product.variants?.length) return Number(product.costSatang || 0);
    const weighted = product.variants.filter(item => item.active !== false).reduce((acc, variant) => {
      const qty = Number(variant.stockQty || 0);
      const cost = catalog.effectiveCostSatang(product, variant) || 0;
      return { qty: acc.qty + qty, value: acc.value + (qty * cost) };
    }, { qty: 0, value: 0 });
    return weighted.qty ? Math.round(weighted.value / weighted.qty) : Number(product.costSatang || 0);
  }

  function priceSummary(product) {
    const prices = product.variants?.length
      ? product.variants.filter(item => item.active !== false).map(item => catalog.effectiveSalePriceSatang(product, item))
      : [Number(product.salePriceSatang || 0)];
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (min === max) return `${money(min)} บาท`;
    return `${money(min)}–${money(max)} บาท`;
  }

  function variantSummary(product) {
    const variants = (product.variants || []).filter(item => item.active !== false);
    if (!variants.length) return "ไม่มีตัวเลือก";
    const colors = new Set(variants.map(item => item.options?.color).filter(Boolean));
    const sizes = new Set(variants.map(item => item.options?.size).filter(Boolean));
    const parts = [];
    if (colors.size) parts.push(`${colors.size} สี`);
    if (sizes.size) parts.push(`${sizes.size} ขนาด`);
    parts.push(`${variants.length} แบบ`);
    return parts.join(" · ");
  }

  function ensureCatalogPanel() {
    const page = byId("storePage");
    if (!page || byId("normalpocketProductPanel")) return;
    const actions = page.querySelector(".action-row");
    const panel = document.createElement("div");
    panel.id = "normalpocketProductPanel";
    panel.className = "card content-card normalpocket-product-panel";
    panel.innerHTML = `
      <div class="normalpocket-product-head">
        <div><h3>รายการสินค้า</h3><small>สินค้าแบบธรรมดา หรือเปิดสี/ขนาดเมื่อจำเป็น</small></div>
        <button type="button" class="secondary-btn" id="normalpocketAddProductBtn">＋ เพิ่มสินค้า</button>
      </div>
      <div id="normalpocketProductList" class="normalpocket-product-list"></div>`;
    if (actions?.nextSibling) page.insertBefore(panel, actions.nextSibling); else page.appendChild(panel);
    byId("normalpocketAddProductBtn").onclick = () => openProductEditor(null);
  }

  function renderProductList() {
    ensureCatalogPanel();
    const target = byId("normalpocketProductList");
    if (!target || !state?.store) return;
    syncStoreStock();
    const products = state.store.products || [];
    if (!products.length) {
      target.innerHTML = '<div class="empty">ยังไม่มีสินค้า กด “เพิ่มสินค้า” เพื่อเริ่มรายการสินค้า</div>';
      return;
    }
    target.innerHTML = products.map(product => `
      <article class="normalpocket-product-card ${product.active === false ? "is-inactive" : ""}">
        <div class="normalpocket-product-main">
          <div><b>${escProduct(product.name)}</b><small>${escProduct(product.category || "ไม่ระบุหมวด")} · ${escProduct(product.unit || "ชิ้น")}</small></div>
          <span>${product.active === false ? "หยุดขาย" : "ขายอยู่"}</span>
        </div>
        <div class="normalpocket-product-metrics">
          <div><small>ราคา</small><b>${priceSummary(product)}</b></div>
          <div><small>คงเหลือ</small><b>${catalog.productStockQty(product).toLocaleString("th-TH")} ${escProduct(product.unit || "ชิ้น")}</b></div>
        </div>
        <div class="normalpocket-option-summary">${escProduct(variantSummary(product))}</div>
        <button type="button" class="text-btn normalpocket-edit-product" data-product-id="${escProduct(product.id)}">แก้ไขสินค้า</button>
      </article>`).join("");
    target.querySelectorAll(".normalpocket-edit-product").forEach(button => {
      button.onclick = () => openProductEditor(productById(button.dataset.productId));
    });
  }

  function variantRowsHtml(variants, product) {
    if (!variants.length) return '<div class="flow-note">เพิ่มสีหรือขนาด แล้วกด “สร้างตัวเลือก”</div>';
    return variants.map(variant => {
      const price = variant.salePriceSatang == null ? "" : satangToBaht(variant.salePriceSatang);
      const cost = variant.costSatang == null ? "" : satangToBaht(variant.costSatang);
      return `
        <div class="normalpocket-variant-row" data-variant-id="${escProduct(variant.id)}" data-options='${escProduct(JSON.stringify(variant.options || {}))}'>
          <b>${escProduct(catalog.optionLabel(variant) || "ตัวเลือก")}</b>
          <div class="normalpocket-variant-grid">
            <div class="field"><label>สต็อก</label><input class="variantStock" type="number" min="0" step="1" value="${Number(variant.stockQty || 0)}"></div>
            <div class="field"><label>ราคาเฉพาะแบบ</label><input class="variantPrice" type="number" min="0" step="0.01" value="${price}" placeholder="ใช้ราคาหลัก"></div>
            <div class="field"><label>ต้นทุนเฉพาะแบบ</label><input class="variantCost" type="number" min="0" step="0.01" value="${cost}" placeholder="ใช้ต้นทุนหลัก"></div>
            <div class="field"><label>SKU</label><input class="variantSku" maxlength="100" value="${escProduct(variant.sku || "")}"></div>
            <div class="field"><label>บาร์โค้ด</label><input class="variantBarcode" maxlength="100" value="${escProduct(variant.barcode || "")}"></div>
          </div>
        </div>`;
    }).join("");
  }

  function buildVariantRows(existingProduct = null) {
    const editor = byId("productVariantEditor");
    if (!editor) return;
    const colors = splitOptions(byId("productColors")?.value);
    const sizes = splitOptions(byId("productSizes")?.value);
    const generated = catalog.generateVariants({ color: colors, size: sizes });
    const existingMap = new Map((existingProduct?.variants || []).map(variant => [optionKey(variant.options), variant]));
    const merged = generated.map(variant => {
      const prior = existingMap.get(optionKey(variant.options));
      return prior ? { ...variant, ...prior, options: variant.options } : variant;
    });
    editor.innerHTML = variantRowsHtml(merged, existingProduct);
  }

  function readVariantRows() {
    return [...(byId("productVariantEditor")?.querySelectorAll(".normalpocket-variant-row") || [])].map(row => {
      const rawOptions = row.dataset.options || "{}";
      const options = JSON.parse(rawOptions.replaceAll("&quot;", '"'));
      const priceText = row.querySelector(".variantPrice").value.trim();
      const costText = row.querySelector(".variantCost").value.trim();
      return {
        id: row.dataset.variantId,
        options,
        stockQty: parseQuantity(row.querySelector(".variantStock").value || "0", { allowZero: true, label: "สต็อกตัวเลือก" }),
        salePriceSatang: priceText ? parseMoneyToSatang(priceText, { allowZero: true, label: "ราคาตัวเลือก" }) : null,
        costSatang: costText ? parseMoneyToSatang(costText, { allowZero: true, label: "ต้นทุนตัวเลือก" }) : null,
        sku: row.querySelector(".variantSku").value.trim(),
        barcode: row.querySelector(".variantBarcode").value.trim(),
        active: true
      };
    });
  }

  function openProductEditor(existingProduct) {
    const product = existingProduct ? structuredClone(existingProduct) : null;
    const hasVariants = Boolean(product?.variants?.length);
    const colors = [...new Set((product?.variants || []).map(item => item.options?.color).filter(Boolean))].join(", ");
    const sizes = [...new Set((product?.variants || []).map(item => item.options?.size).filter(Boolean))].join(", ");
    const baseStock = hasVariants ? catalog.productStockQty(product) : Number(product?.stockQty || 0);
    openModal({
      title: product ? "แก้ไขสินค้า" : "เพิ่มสินค้า",
      text: "ข้อมูลพื้นฐานอยู่ด้านบน เปิดสี/ขนาดเฉพาะสินค้าที่มีหลายแบบ",
      body: `<div class="form-grid">
        <div class="field full"><label>ชื่อสินค้า</label><input id="productName" maxlength="160" value="${escProduct(product?.name || "")}"></div>
        <div class="field"><label>ราคาขาย</label><input id="productSalePrice" type="number" min="0" step="0.01" value="${satangToBaht(product?.salePriceSatang ?? state.settings.defaultPriceSatang)}"></div>
        <div class="field"><label>${hasVariants ? "สต็อกรวม" : "จำนวนคงเหลือ"}</label><input id="productStock" type="number" min="0" step="1" value="${baseStock}" ${hasVariants ? "readonly" : ""}></div>
        <div class="field full normalpocket-variant-toggle"><label><input id="productHasVariants" type="checkbox" ${hasVariants ? "checked" : ""}> สินค้ามีตัวเลือก</label></div>
      </div>
      <section id="productVariantSection" class="${hasVariants ? "" : "hidden"}">
        <div class="form-grid">
          <div class="field"><label>สี</label><input id="productColors" value="${escProduct(colors)}" placeholder="ดำ, ขาว, แดง"></div>
          <div class="field"><label>ขนาด</label><input id="productSizes" value="${escProduct(sizes)}" placeholder="S, M, L, XL"></div>
        </div>
        <button type="button" class="secondary-btn wide" id="productBuildVariants">สร้างตัวเลือก</button>
        <div id="productVariantEditor" class="normalpocket-variant-editor">${variantRowsHtml(product?.variants || [], product)}</div>
      </section>
      <details class="normalpocket-product-advanced">
        <summary>ข้อมูลเพิ่มเติม</summary>
        <div class="form-grid">
          <div class="field"><label>หมวดหมู่</label><input id="productCategory" maxlength="100" value="${escProduct(product?.category || "")}"></div>
          <div class="field"><label>หน่วย</label><input id="productUnit" maxlength="40" value="${escProduct(product?.unit || "ชิ้น")}"></div>
          <div class="field"><label>ต้นทุนต่อหน่วย</label><input id="productCost" type="number" min="0" step="0.01" value="${product?.costSatang == null ? "" : satangToBaht(product.costSatang)}"></div>
          <div class="field"><label>สถานะ</label><select id="productActive"><option value="1" ${product?.active === false ? "" : "selected"}>ขายอยู่</option><option value="0" ${product?.active === false ? "selected" : ""}>หยุดขาย</option></select></div>
          <div class="field"><label>SKU</label><input id="productSku" maxlength="100" value="${escProduct(product?.sku || "")}"></div>
          <div class="field"><label>บาร์โค้ด</label><input id="productBarcode" maxlength="100" value="${escProduct(product?.barcode || "")}"></div>
          <div class="field full"><label>รายละเอียด</label><textarea id="productDescription" maxlength="600">${escProduct(product?.description || "")}</textarea></div>
          <div class="field full"><label>รูปสินค้า / imageRef</label><input id="productImageRef" maxlength="500" value="${escProduct(product?.imageRef || "")}" placeholder="อ้างอิงรูปหรือ URL ภายในระบบ"></div>
        </div>
      </details>`,
      confirm: "บันทึกสินค้า",
      onConfirm: async () => {
        const name = byId("productName").value.trim();
        if (!name) { toast("กรอกชื่อสินค้า"); modalBusy = false; return; }
        const salePriceSatang = parseMoneyToSatang(byId("productSalePrice").value, { allowZero: true, label: "ราคาขาย" });
        const costText = byId("productCost").value.trim();
        const costSatang = costText ? parseMoneyToSatang(costText, { allowZero: true, label: "ต้นทุน" }) : null;
        const useVariants = byId("productHasVariants").checked;
        const variants = useVariants ? readVariantRows() : [];
        if (useVariants && !variants.length) { toast("สร้างตัวเลือกสี/ขนาดอย่างน้อย 1 แบบ"); modalBusy = false; return; }
        const stockQty = useVariants ? 0 : parseQuantity(byId("productStock").value || "0", { allowZero: true, label: "สต็อก" });
        const next = catalog.normalizeProduct({
          ...(product || {}),
          id: product?.id || uid("PRODUCT"),
          name,
          category: byId("productCategory").value.trim(),
          salePriceSatang,
          costSatang,
          unit: byId("productUnit").value.trim() || "ชิ้น",
          stockQty,
          variants,
          active: byId("productActive").value === "1",
          sku: byId("productSku").value.trim(),
          barcode: byId("productBarcode").value.trim(),
          description: byId("productDescription").value.trim(),
          imageRef: byId("productImageRef").value.trim(),
          createdAt: product?.createdAt || nowIso(),
          updatedAt: nowIso(),
          revision: Number(product?.revision || 0) + 1
        });
        const oldQty = product ? catalog.productStockQty(product) : 0;
        const newQty = catalog.productStockQty(next);
        const delta = newQty - oldQty;
        if (delta < 0) takeStockFromPool(state, Math.abs(delta));
        if (delta > 0) {
          const addValue = delta * productCostBasis(next);
          parseSatang(Number(state.store.stockValueSatang || 0) + addValue, { allowZero: true, label: "มูลค่าสต็อกรวม" });
          state.store.stockValueSatang += addValue;
        }
        const index = state.store.products.findIndex(item => item.id === next.id);
        if (index >= 0) state.store.products[index] = next; else state.store.products.push(next);
        syncStoreStock();
        addAudit(product ? "PRODUCT_UPDATED" : "PRODUCT_CREATED", `${next.id} · ${next.name} · สต็อก ${newQty}`);
        closeModal();
        await persistAndRender(product ? "แก้ไขสินค้าแล้ว" : "เพิ่มสินค้าแล้ว");
      }
    });
    const toggle = byId("productHasVariants");
    const section = byId("productVariantSection");
    const stock = byId("productStock");
    toggle.onchange = () => {
      section.classList.toggle("hidden", !toggle.checked);
      stock.readOnly = toggle.checked;
      if (!toggle.checked) stock.value = String(product ? catalog.productStockQty(product) : Number(stock.value || 0));
      else buildVariantRows(product);
    };
    byId("productBuildVariants").onclick = () => {
      buildVariantRows(product);
      stock.value = String([...byId("productVariantEditor").querySelectorAll(".variantStock")].reduce((sum, input) => sum + Number(input.value || 0), 0));
    };
    byId("productVariantEditor")?.addEventListener("input", event => {
      if (!event.target.classList.contains("variantStock")) return;
      stock.value = String([...byId("productVariantEditor").querySelectorAll(".variantStock")].reduce((sum, input) => sum + Number(input.value || 0), 0));
    });
  }

  function productOptionsHtml() {
    return activeProducts().map(product => `<option value="${escProduct(product.id)}">${escProduct(product.name)} · คงเหลือ ${catalog.productStockQty(product)}</option>`).join("");
  }

  function populateVariantSelect(productId, selectId, priceInputId = null) {
    const product = productById(productId);
    const select = byId(selectId);
    if (!product || !select) return;
    const variants = (product.variants || []).filter(item => item.active !== false);
    select.innerHTML = variants.length
      ? '<option value="">เลือกตัวเลือก</option>' + variants.map(variant => `<option value="${escProduct(variant.id)}">${escProduct(catalog.optionLabel(variant))} · คงเหลือ ${Number(variant.stockQty || 0)}</option>`).join("")
      : '<option value="">ไม่มีตัวเลือก</option>';
    select.disabled = !variants.length;
    if (priceInputId) {
      const price = catalog.effectiveSalePriceSatang(product, variants.length ? variants.find(item => item.id === select.value) : null);
      byId(priceInputId).value = satangToBaht(price);
    }
  }

  function resolveSelection(productId, variantId) {
    const product = productById(productId);
    if (!product || product.active === false) throw new Error("กรุณาเลือกสินค้า");
    const owner = catalog.resolveStockOwner(product, variantId || null);
    const snapshot = catalog.snapshotSelection(product, owner === product ? null : owner.id);
    return { product, owner, ...snapshot };
  }

  function selectionFields(prefix, includePrice = false) {
    return `<div class="field full"><label>สินค้า</label><select id="${prefix}Product">${productOptionsHtml()}</select></div>
      <div class="field full"><label>สี / ขนาด</label><select id="${prefix}Variant"></select></div>
      ${includePrice ? `<div class="field"><label>ราคาต่อหน่วย</label><input id="${prefix}UnitPrice" type="number" min="0" step="0.01"></div>` : ""}`;
  }

  function wireSelection(prefix, priceId = null) {
    const productSelect = byId(`${prefix}Product`);
    const variantSelect = byId(`${prefix}Variant`);
    if (!productSelect || !variantSelect) return;
    const refresh = () => populateVariantSelect(productSelect.value, `${prefix}Variant`, priceId);
    productSelect.onchange = refresh;
    variantSelect.onchange = () => {
      if (!priceId) return;
      const product = productById(productSelect.value);
      const variant = product?.variants?.find(item => item.id === variantSelect.value) || null;
      byId(priceId).value = satangToBaht(catalog.effectiveSalePriceSatang(product, variant));
    };
    refresh();
  }

  function requireProducts() {
    if (activeProducts().length) return true;
    toast("เพิ่มสินค้าในรายการสินค้าก่อน");
    return false;
  }

  function openCatalogSale() {
    if (!requireProducts()) return;
    openModal({
      title: "ขายสินค้า",
      text: "เลือกสินค้าก่อน ถ้ามีสี/ขนาดต้องเลือกแบบที่ขายจริง",
      body: `<div class="form-grid">${selectionFields("npSale")}
        <div class="field"><label>จำนวน</label><input id="npSaleQty" type="number" min="1" value="1"></div>
        <div class="field"><label>รับเงินจริงครั้งนี้</label><input id="npSaleReceived" type="number" min="0" step="0.01" value="0"></div>
        <div class="field full"><small>ใช้ราคาขายของสินค้าอัตโนมัติ · ถ้ารับไม่ครบ ระบบจะเก็บยอดค้าง</small></div>
      </div>
      <details class="np-sale-advanced">
        <summary>ข้อมูลเพิ่มเติม</summary>
        <div class="form-grid">
          <div class="field"><label>ราคาต่อหน่วย</label><input id="npSaleUnitPrice" type="number" min="0" step="0.01"></div>
          <div class="field"><label>ลูกค้า</label><input id="npSaleCustomer" maxlength="80"></div>
          <div class="field full"><label>ช่องทางติดต่อ</label><input id="npSaleContact" maxlength="100"></div>
          <div class="field full"><label>วันนัดยอดค้าง</label><input id="npSaleDue" type="date" value="${localISO()}"></div>
          <div class="field full"><label>หมายเหตุ</label><input id="npSaleNote" maxlength="200"></div>
        </div>
      </details>`,
      confirm: "บันทึกขาย",
      onConfirm: async () => {
        let selection;
        try { selection = resolveSelection(byId("npSaleProduct").value, byId("npSaleVariant").value); }
        catch (error) { toast(error.message); modalBusy = false; return; }
        const qty = parseQuantity(byId("npSaleQty").value, { label: "จำนวนขาย" });
        if (qty > Number(selection.owner.stockQty || 0)) { toast("สต็อกตัวเลือกนี้ไม่พอ"); modalBusy = false; return; }
        const unitPriceSatang = parseMoneyToSatang(byId("npSaleUnitPrice").value, { allowZero: true, label: "ราคาต่อหน่วย" });
        const totalSatang = parseSatang(qty * unitPriceSatang, { allowZero: true, label: "ยอดขายรวม" });
        const receivedSatang = parseMoneyToSatang(byId("npSaleReceived").value, { allowZero: true, label: "เงินรับ" });
        if (receivedSatang > totalSatang) { toast("เงินรับเกินยอดขาย"); modalBusy = false; return; }
        const due = byId("npSaleDue").value;
        if (receivedSatang < totalSatang && !validISODate(due)) { toast("รายการค้างต้องมีวันนัด"); modalBusy = false; return; }
        const costSatang = takeStockFromPool(state, qty);
        catalog.adjustStock(selection.product, selection.variantId, -qty);
        syncStoreStock();
        const id = uid("SALE"), createdAt = nowIso();
        const sale = {
          id,
          customer: byId("npSaleCustomer").value.trim() || (receivedSatang < totalSatang ? "ลูกค้าไม่ระบุชื่อ" : "ขายเงินสด"),
          contact: byId("npSaleContact").value.trim(), qty, unitPriceSatang, totalSatang, receivedSatang,
          outstandingSatang: totalSatang - receivedSatang, costSatang,
          status: receivedSatang === totalSatang ? "COMPLETED" : receivedSatang > 0 ? "PARTIAL" : "OPEN",
          note: byId("npSaleNote").value.trim(), date: localISO(), createdAt, updatedAt: createdAt, revision: 1,
          cancelledAt: null, stockRestored: false,
          productId: selection.productId, variantId: selection.variantId, optionSnapshot: selection.options || {}, productName: selection.productName
        };
        state.store.sales.push(sale);
        if (receivedSatang > 0) addTransaction({ direction: "IN", amountSatang: receivedSatang, label: `รับเงินจริงจากบิล ${id}`, source: "STORE", sourceId: id, subtype: "SALE_INITIAL_RECEIPT", actionKey: `${id}:initial` });
        if (sale.outstandingSatang > 0) addQueue({ source: "STORE", sourceId: id, actionType: "RECEIVE_CUSTOMER_PAYMENT", status: sale.status, amountSatang: sale.outstandingSatang, due, effects: { complete: "เพิ่มเงินจริงและลดยอดค้าง", cancel: "ยกเลิกบิล คืนสต็อกไปสินค้าตัวเดิม และย้อนเงิน" } });
        closeModal(); await persistAndRender("สร้างบิลขายแล้ว");
      }
    });
    wireSelection("npSale", "npSaleUnitPrice");
  }

  function openCatalogPurchase() {
    if (!requireProducts()) return;
    openModal({
      title: "รับสินค้าเข้า",
      text: "เลือกสินค้าหรือสี/ขนาดที่รับเข้าจริง",
      body: `<div class="form-grid">${selectionFields("npBuy")}
        <div class="field"><label>จำนวน</label><input id="npBuyQty" type="number" min="1"></div>
        <div class="field"><label>ต้นทุนรวม</label><input id="npBuyCost" type="number" min="0" step="0.01"></div>
        <div class="field full"><label>วันตรวจ/คืนของ (ไม่บังคับ)</label><input id="npBuyDue" type="date"></div>
      </div>`,
      confirm: "ซื้อและรับเข้า",
      onConfirm: async () => {
        let selection;
        try { selection = resolveSelection(byId("npBuyProduct").value, byId("npBuyVariant").value); }
        catch (error) { toast(error.message); modalBusy = false; return; }
        const qty = parseQuantity(byId("npBuyQty").value, { label: "จำนวนรับเข้า" });
        if (catalog.catalogStockQty(state.store) + qty > MAX_QUANTITY) { toast("จำนวนสต็อกรวมเกินขอบเขต"); modalBusy = false; return; }
        const costSatang = parseMoneyToSatang(byId("npBuyCost").value, { allowZero: true, label: "ต้นทุน" });
        parseSatang(Number(state.store.stockValueSatang || 0) + costSatang, { allowZero: true, label: "มูลค่าสต็อกรวม" });
        const due = byId("npBuyDue").value;
        if (due && !validISODate(due)) { toast("วันตรวจ/คืนของไม่ถูกต้อง"); modalBusy = false; return; }
        catalog.adjustStock(selection.product, selection.variantId, qty);
        state.store.stockValueSatang += costSatang;
        syncStoreStock();
        const id = uid("BUY"), createdAt = nowIso();
        const purchase = {
          id, name: selection.productName, qty, costSatang, paidAmountSatang: costSatang, status: "ACTIVE", date: localISO(),
          createdAt, updatedAt: createdAt, revision: 1, cancelledAt: null,
          productId: selection.productId, variantId: selection.variantId, optionSnapshot: selection.options || {}, productName: selection.productName
        };
        state.store.purchases.push(purchase);
        if (costSatang > 0) addTransaction({ direction: "OUT", amountSatang: costSatang, label: `ซื้อสินค้า ${id}`, source: "STORE", sourceId: id, subtype: "PURCHASE_PAYMENT", actionKey: `${id}:purchase` });
        if (due) addQueue({ source: "STORE", sourceId: id, actionType: "PURCHASE_RETURN_WINDOW", amountSatang: costSatang, due, effects: { complete: "ปิดช่วงตรวจและเก็บสินค้า", cancel: "คืนสินค้าตัวเดิมและย้อนเงิน" } });
        closeModal(); await persistAndRender("รับสินค้าเข้าแล้ว");
      }
    });
    wireSelection("npBuy");
  }

  function openCatalogWithdrawal() {
    if (!requireProducts()) return;
    openModal({
      title: "เบิกสินค้า",
      text: "เลือกสินค้าหรือสี/ขนาดที่นำออกจริง",
      body: `<div class="form-grid">${selectionFields("npWithdraw")}
        <div class="field"><label>จำนวน</label><input id="npWithdrawQty" type="number" min="1"></div>
        <div class="field"><label>เหตุผล</label><select id="npWithdrawReason"><option>ใช้เอง</option><option>แจก</option><option>ชำรุด</option><option>ตัวอย่างสินค้า</option><option>อื่น ๆ</option></select></div>
        <div class="field full"><label>หมายเหตุ</label><input id="npWithdrawNote" maxlength="160"></div>
      </div>`,
      confirm: "บันทึกการเบิก",
      onConfirm: async () => {
        let selection;
        try { selection = resolveSelection(byId("npWithdrawProduct").value, byId("npWithdrawVariant").value); }
        catch (error) { toast(error.message); modalBusy = false; return; }
        const qty = parseQuantity(byId("npWithdrawQty").value, { label: "จำนวนเบิก" });
        if (qty > Number(selection.owner.stockQty || 0)) { toast("สต็อกตัวเลือกนี้ไม่พอ"); modalBusy = false; return; }
        const costSatang = takeStockFromPool(state, qty);
        catalog.adjustStock(selection.product, selection.variantId, -qty);
        syncStoreStock();
        const createdAt = nowIso();
        state.store.withdrawals.push({
          id: uid("WD"), qty, costSatang, reason: byId("npWithdrawReason").value, note: byId("npWithdrawNote").value.trim(),
          date: localISO(), createdAt, updatedAt: createdAt, revision: 1,
          productId: selection.productId, variantId: selection.variantId, optionSnapshot: selection.options || {}, productName: selection.productName
        });
        addAudit("STOCK_WITHDRAWN", `${selection.productName} · ${selection.optionLabel || "ไม่มีตัวเลือก"} · ${qty}`);
        closeModal(); await persistAndRender("บันทึกการเบิกแล้ว");
      }
    });
    wireSelection("npWithdraw");
  }

  function restoreSaleStock(source) {
    const product = productById(source?.productId);
    if (!product) {
      state.store.stockQty += Number(source?.qty || 0);
      state.store.stockValueSatang += Number(source?.costSatang || 0);
      source.stockRestored = true;
      return false;
    }
    catalog.adjustStock(product, source.variantId || null, Number(source.qty || 0));
    state.store.stockValueSatang += Number(source.costSatang || 0);
    source.stockRestored = true;
    syncStoreStock();
    return true;
  }

  function canRemovePurchaseStock(source) {
    const product = productById(source?.productId);
    if (!product) return state.store.stockQty >= Number(source?.qty || 0);
    try {
      const owner = catalog.resolveStockOwner(product, source.variantId || null);
      return Number(owner.stockQty || 0) >= Number(source.qty || 0);
    } catch (_) {
      return false;
    }
  }

  function removePurchaseStock(source) {
    const product = productById(source?.productId);
    if (!product) return false;
    catalog.adjustStock(product, source.variantId || null, -Number(source.qty || 0));
    syncStoreStock();
    return true;
  }

  defaultState = function normalPocketDefaultState(...args) {
    const next = originalDefaultState(...args);
    next.store.products = [];
    catalog.normalizeStore(next.store);
    return next;
  };

  normalizeState = function normalPocketNormalizeState(value) {
    const next = originalNormalizeState(value);
    catalog.normalizeStore(next.store);
    validateStateInvariants(next, { quarantine: true });
    return next;
  };

  renderStore = function normalPocketRenderStore() {
    syncStoreStock();
    originalRenderStore();
    renderProductList();
  };

  ensureCatalogPanel();
  const saleButton = byId("addSaleBtn");
  const purchaseButton = byId("addPurchaseBtn");
  const withdrawButton = byId("withdrawStockBtn");
  if (saleButton) saleButton.onclick = openCatalogSale;
  if (purchaseButton) purchaseButton.onclick = openCatalogPurchase;
  if (withdrawButton) withdrawButton.onclick = openCatalogWithdrawal;

  root.NormalPocketProducts = Object.freeze({
    renderProductList,
    resolveSelection,
    restoreSaleStock,
    canRemovePurchaseStock,
    removePurchaseStock,
    syncStoreStock
  });
})(globalThis);
