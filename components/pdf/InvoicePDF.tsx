import React from "react";
import {
  Page,
  Text,
  View,
  Document,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import i18next from '../../i18n';

Font.register({
  family: 'Roboto',
  src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-regular-webfont.ttf',
});


const styles = StyleSheet.create({
  page: {
    fontFamily: "Roboto",
    fontSize: 11,
    padding: 32,
    backgroundColor: "#fff",
    color: "#000",
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between" },
  companyBlock: { flex: 1 },
  invoiceBlock: { flex: 1, alignItems: "flex-end" },
  section: { marginBottom: 18 },
  billTo: { marginBottom: 8 },
  table: { display: "table", width: "auto", marginBottom: 16, borderWidth: 1, borderColor: "#000" },
  tableRow: { flexDirection: "row", alignItems: "center", minHeight: 24 },
  tableHeader: { backgroundColor: "#f3f3f3", fontWeight: "bold", borderBottomWidth: 1, borderBottomColor: "#000" },
  cell: { padding: 6, fontSize: 10, borderRightWidth: 1, borderRightColor: "#000", textAlign: "left" },
  cellRight: { textAlign: "right" },
  cellCenter: { textAlign: "center" },
  lastCell: { borderRightWidth: 0 },
  totalsRow: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center" },
  totalsLabel: { width: 110, textAlign: "right", marginRight: 8, fontWeight: "bold" },
  totalsValue: { width: 80, textAlign: "right", fontWeight: "bold" },
  notes: { fontSize: 9, marginTop: 12, color: "#444" },
  footer: { marginTop: 32, textAlign: "center", color: "#888", fontSize: 9 },
});

function formatDate(date: string | Date) {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export const InvoicePDF = ({
  invoiceNumber,
  issueDate,
  dueDate,
  company,
  customer,
  items = [],
  shippingCost = 0,
  subtotalNet = 0,
  subtotalGross = 0,
  vatTotal = 0,
  total = 0,
  paymentMethod,
  currency = "BGN",
  orderReference,
  notes = "Thank you for your business!",
  language = "en",
}) => {
  // Set the language before rendering
  i18next.changeLanguage(language);

  const shippingAndHandling = shippingCost ?? 0;
  const totalBeforeVAT = subtotalGross ?? 0;
  const vatAmount = vatTotal ?? 0;
  const finalTotal = total ?? 0;

  const safeItems = items.map(item => ({
    ...item,
    unit_price: item.unit_price ?? 0,
    line_total_gross: item.line_total_gross ?? 0,
    vat_rate: item.vat_rate ?? 0.2,
    quantity: item.quantity ?? 0,
    brand: item.brand ?? "",
  }));

  // For "FREE" shipping, use a translation if you want, or keep as is
  const shippingText = shippingAndHandling > 0
    ? `${shippingAndHandling.toFixed(2)} ${currency}`
    : "FREE";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={[styles.headerRow, styles.section]}>
          <View style={styles.companyBlock}>
            <Text style={{ fontWeight: "bold", fontSize: 14 }}>{company.name}</Text>
            <Text>{company.address}</Text>
            <Text>{company.city}</Text>
            <Text>VAT: {company.vatNumber}</Text>
          </View>
          <View style={styles.invoiceBlock}>
            <Text style={{ fontWeight: "bold", fontSize: 16 }}>{i18next.t("invoice")}</Text>
            <Text>{i18next.t("invoiceNumber")}: {invoiceNumber}</Text>
            <Text>{i18next.t("date")}: {formatDate(issueDate)}</Text>
            {dueDate && <Text>{i18next.t("dueDate")}: {formatDate(dueDate)}</Text>}
            <Text>{i18next.t("orderReference")}: {orderReference}</Text>
          </View>
        </View>

        <View style={styles.billTo}>
          <Text style={{ fontWeight: "bold" }}>{i18next.t("billTo")}:</Text>
          <Text>{customer.name}</Text>
          <Text>{customer.address}</Text>
          <Text>{customer.city} {customer.postalCode}</Text>
          <Text>{customer.phone}</Text>
        </View>

        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={[styles.cell, { flex: 2 }]}>{i18next.t("item")}</Text>
            <Text style={[styles.cell, styles.cellCenter, { flex: 0.7 }]}>{i18next.t("quantity")}</Text>
            <Text style={[styles.cell, styles.cellRight, { flex: 1 }]}>{i18next.t("price")}</Text>
            <Text style={[styles.cell, styles.cellCenter, { flex: 0.7 }]}>{i18next.t("tax")}</Text>
            <Text style={[styles.cell, styles.cellRight, styles.lastCell, { flex: 1 }]}>{i18next.t("amount")}</Text>
          </View>
          {safeItems.map((item, idx) => (
            <View key={idx} style={styles.tableRow}>
              <Text style={[styles.cell, { flex: 2 }]}>
                {item.brand ? `${item.brand} ${item.name}` : item.name}
              </Text>
              <Text style={[styles.cell, styles.cellCenter, { flex: 0.7 }]}>{item.quantity}</Text>
              <Text style={[styles.cell, styles.cellRight, { flex: 1 }]}>
                {(item.unit_price ?? 0).toFixed(2)} {currency}
              </Text>
              <Text style={[styles.cell, styles.cellCenter, { flex: 0.7 }]}>
                {((item.vat_rate ?? 0) * 100).toFixed(0)}%
              </Text>
              <Text style={[styles.cell, styles.cellRight, styles.lastCell, { flex: 1 }]}>
                {(item.line_total_gross ?? 0).toFixed(2)} {currency}
              </Text>
            </View>
          ))}
        </View>

        <View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>{i18next.t("subtotal")}:</Text>
            <Text style={styles.totalsValue}>
              {(subtotalGross ?? 0).toFixed(2)} {currency}
            </Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>{i18next.t("shippingAndHandling")}:</Text>
            <Text style={styles.totalsValue}>
              {shippingText}
            </Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>{i18next.t("vat")}:</Text>
            <Text style={styles.totalsValue}>
              {(vatAmount ?? 0).toFixed(2)} {currency}
            </Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={[styles.totalsLabel, { fontSize: 13 }]}>{i18next.t("total")}:</Text>
            <Text style={[styles.totalsValue, { fontSize: 13 }]}>
              {(finalTotal ?? 0).toFixed(2)} {currency}
            </Text>
          </View>
        </View>

        <View style={styles.notes}>
          <Text>{i18next.t("notes")}:</Text>
          <Text>{notes}</Text>
        </View>

        <View style={styles.notes}>
          <Text>{i18next.t("paymentMethod")}: {paymentMethod}</Text>
        </View>

        <Text style={styles.footer}>
          {i18next.t("footer")}
        </Text>
      </Page>
    </Document>
  );
};
