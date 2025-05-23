import React from "react";
import {
  Page,
  Text,
  View,
  Document,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";

// Register a professional font (Lato)
Font.register({
  family: "Lato",
  fonts: [
    { src: "https://fonts.gstatic.com/s/lato/v24/S6uyw4BMUTPHjx4wWw.ttf" }, // Regular
    { src: "https://fonts.gstatic.com/s/lato/v24/S6u9w4BMUTPHh6UVSwiPHA.ttf", fontWeight: 700 }, // Bold
  ],
});

const styles = StyleSheet.create({
  page: {
    fontFamily: "Lato",
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

function formatDate(date) {
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
  items,
  shippingCost,
  basePrice,
  paymentMethod,
  currency = "BGN",
  orderReference,
  notes = "Thank you for your business!",
}) => {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalBeforeVAT = subtotal + shippingCost + basePrice;
  const vatAmount = totalBeforeVAT * 0.2;
  const total = totalBeforeVAT + vatAmount;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={[styles.headerRow, styles.section]}>
          <View style={styles.companyBlock}>
            <Text style={{ fontWeight: "bold", fontSize: 14 }}>{company.name}</Text>
            <Text>{company.address}</Text>
            <Text>{company.city}</Text>
            <Text>VAT: {company.vatNumber}</Text>
          </View>
          <View style={styles.invoiceBlock}>
            <Text style={{ fontWeight: "bold", fontSize: 16 }}>INVOICE</Text>
            <Text>Invoice #: {invoiceNumber}</Text>
            <Text>Date: {formatDate(issueDate)}</Text>
            {dueDate && <Text>Due Date: {formatDate(dueDate)}</Text>}
            <Text>Order Ref: {orderReference}</Text>
          </View>
        </View>

        {/* Bill To */}
        <View style={styles.billTo}>
          <Text style={{ fontWeight: "bold" }}>BILL TO:</Text>
          <Text>{customer.name}</Text>
          <Text>{customer.address}</Text>
          <Text>{customer.city} {customer.postalCode}</Text>
          <Text>{customer.phone}</Text>
        </View>

        {/* Items Table (Description column removed) */}
        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={[styles.cell, { flex: 2 }]}>ITEM</Text>
            <Text style={[styles.cell, styles.cellCenter, { flex: 0.7 }]}>QUANTITY</Text>
            <Text style={[styles.cell, styles.cellRight, { flex: 1 }]}>PRICE</Text>
            <Text style={[styles.cell, styles.cellCenter, { flex: 0.7 }]}>TAX</Text>
            <Text style={[styles.cell, styles.cellRight, styles.lastCell, { flex: 1 }]}>AMOUNT</Text>
          </View>
          {items.map((item, idx) => (
            <View key={idx} style={styles.tableRow}>
              <Text style={[styles.cell, { flex: 2 }]}>{item.name}</Text>
              <Text style={[styles.cell, styles.cellCenter, { flex: 0.7 }]}>{item.quantity}</Text>
              <Text style={[styles.cell, styles.cellRight, { flex: 1 }]}>{item.price.toFixed(2)} {currency}</Text>
              <Text style={[styles.cell, styles.cellCenter, { flex: 0.7 }]}>20%</Text>
              <Text style={[styles.cell, styles.cellRight, styles.lastCell, { flex: 1 }]}>{(item.price * item.quantity).toFixed(2)} {currency}</Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Subtotal:</Text>
            <Text style={styles.totalsValue}>{subtotal.toFixed(2)} {currency}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Shipping & Handling:</Text>
            <Text style={styles.totalsValue}>
              {shippingCost + basePrice > 0 ? `${(shippingCost + basePrice).toFixed(2)} ${currency}` : "FREE"}
            </Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>VAT (20%):</Text>
            <Text style={styles.totalsValue}>{vatAmount.toFixed(2)} {currency}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={[styles.totalsLabel, { fontSize: 13 }]}>TOTAL:</Text>
            <Text style={[styles.totalsValue, { fontSize: 13 }]}>{total.toFixed(2)} {currency}</Text>
          </View>
        </View>

        {/* Notes */}
        <View style={styles.notes}>
          <Text>NOTES:</Text>
          <Text>{notes}</Text>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          Powered by Sofia Padel | This invoice was generated electronically.
        </Text>
      </Page>
    </Document>
  );
};
