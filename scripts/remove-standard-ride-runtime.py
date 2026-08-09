from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path, old, new):
    file = ROOT / path
    text = file.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly 1 match, found {count}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "highway-gate.js",
    '''    "PURCHASE_PAYMENT",\n    "SALE_INITIAL_RECEIPT",\n    "SALE_RECEIPT",\n    "RECEIVABLE_RECLASSIFICATION",\n    "RIDE_CASH_INCOME",\n    "RIDE_CREDIT_WITHDRAWAL",\n    "RIDE_INCOME",\n    "OBLIGATION_PAYMENT"\n''',
    '''    "PURCHASE_PAYMENT",\n    "SALE_INITIAL_RECEIPT",\n    "SALE_RECEIPT",\n    "RECEIVABLE_RECLASSIFICATION",\n    "OBLIGATION_PAYMENT"\n'''
)

replace_once(
    "flow-era.js",
    '''      "PURCHASE_PAYMENT", "SALE_INITIAL_RECEIPT", "SALE_RECEIPT", "RECEIVABLE_RECLASSIFICATION",\n      "RIDE_CASH_INCOME", "RIDE_CREDIT_WITHDRAWAL", "RIDE_INCOME", "OBLIGATION_PAYMENT"\n''',
    '''      "PURCHASE_PAYMENT", "SALE_INITIAL_RECEIPT", "SALE_RECEIPT", "RECEIVABLE_RECLASSIFICATION",\n      "OBLIGATION_PAYMENT"\n'''
)

replace_once(
    "app.js",
    '''function actionLabel(type) { return ({ RECEIVE_CUSTOMER_PAYMENT: "รับเงินลูกค้า", PURCHASE_RETURN_WINDOW: "ตรวจ/คืนสินค้า", SETTLE_RIDE_JOB: "ยืนยันรายได้งานเดิม", CONFIRM_RIDE_CREDIT_WITHDRAWAL: "ยืนยันเงินเครดิตเข้า", PAY_OBLIGATION: "จ่ายภาระ", PAY_OBLIGATION_INSTALLMENT: "จ่ายงวดภาระ", VERIFY_SOURCE: "ตรวจข้อมูลต้นทาง" })[type] || type; }\n''',
    '''function actionLabel(type) { return ({ RECEIVE_CUSTOMER_PAYMENT: "รับเงินลูกค้า", PURCHASE_RETURN_WINDOW: "ตรวจ/คืนสินค้า", PAY_OBLIGATION: "จ่ายภาระ", PAY_OBLIGATION_INSTALLMENT: "จ่ายงวดภาระ", VERIFY_SOURCE: "ตรวจข้อมูลต้นทาง" })[type] || type; }\n'''
)
replace_once(
    "app.js",
    '''function queueDirection(item) { if (["RECEIVE_CUSTOMER_PAYMENT", "SETTLE_RIDE_JOB", "CONFIRM_RIDE_CREDIT_WITHDRAWAL"].includes(item.actionType)) return "IN"; if (["PAY_OBLIGATION", "PAY_OBLIGATION_INSTALLMENT"].includes(item.actionType)) return "OUT"; if (item.actionType === "VERIFY_SOURCE") return "VERIFY"; return "OTHER"; }\n''',
    '''function queueDirection(item) { if (item.actionType === "RECEIVE_CUSTOMER_PAYMENT") return "IN"; if (["PAY_OBLIGATION", "PAY_OBLIGATION_INSTALLMENT"].includes(item.actionType)) return "OUT"; if (item.actionType === "VERIFY_SOURCE") return "VERIFY"; return "OTHER"; }\n'''
)
replace_once(
    "app.js",
    '''    const label = item.actionType === "PURCHASE_RETURN_WINDOW" ? "เก็บสินค้าไว้" : item.actionType === "VERIFY_SOURCE" ? "ตรวจแล้ว" : item.actionType === "CONFIRM_RIDE_CREDIT_WITHDRAWAL" ? "ยืนยันเงินเข้า" : "ยืนยันรายได้";\n''',
    '''    const label = item.actionType === "PURCHASE_RETURN_WINDOW" ? "เก็บสินค้าไว้" : item.actionType === "VERIFY_SOURCE" ? "ตรวจแล้ว" : "ยืนยัน";\n'''
)
replace_once(
    "app.js",
    '''  if (["SALE", "PURCHASE", "STOCK_WITHDRAWAL", "RIDE_JOB", "CREDIT_WITHDRAWAL", "OBLIGATION"].includes(record.type)) return ["title", "detail"].includes(field);\n''',
    '''  if (["SALE", "PURCHASE", "STOCK_WITHDRAWAL", "OBLIGATION"].includes(record.type)) return ["title", "detail"].includes(field);\n'''
)

print("Removed executable STANDARD RIDE contracts")
