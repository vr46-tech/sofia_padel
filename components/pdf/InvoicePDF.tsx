import React from "react";
import {
  Page,
  Text,
  View,
  Document,
  StyleSheet,
  Font,
  Image,
} from "@react-pdf/renderer";

// Register a clean, professional font (Roboto)
Font.register({
  family: "Roboto",
  fonts: [
    { src: "https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxP.ttf" }, // Regular
    { src: "https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmWUlfBBc9.ttf", fontWeight: 700 }, // Bold
  ],
});

const styles = StyleSheet.create({
  page: {
    fontFamily: "Roboto",
    fontSize: 12,
    padding: 32,
    backgroundColor: "#f7f7f7",
    color: "#000",
  },
  logo: {
    width: 100,
    height: 32,
    marginBottom: 10,
  },
  section: { marginBottom: 18 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  header: { fontSize: 22, fontWeight: "bold" },
  company: { fontSize: 12, fontWeight: "bold", marginBottom: 2 },
  infoLabel: { color: "#222", fontSize: 10 },
  infoValue: { fontWeight: 500, color: "#000", fontSize: 12, marginBottom: 2 },
  table: { display: "table", width: "auto", marginBottom: 16, borderRadius: 6, overflow: "hidden" },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 32,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
    borderBottomStyle: "solid",
  },
  tableHeader: {
    backgroundColor: "#f0fdfb",
    fontWeight: "bold",
    color: "#000",
    borderBottomWidth: 2,
    borderBottomColor: "#000",
  },
  cellProduct: { padding: 6, fontSize: 11, flexBasis: "45%", textAlign: "left" },
  cellQty: { padding: 6, fontSize: 11, flexBasis: "15%", textAlign: "center" },
  cellPrice: { padding: 6, fontSize: 11, flexBasis: "20%", textAlign: "right" },
  cellTotal: { padding: 6, fontSize: 11, flexBasis: "20%", textAlign: "right" },
  altRow: { backgroundColor: "#fafafa" },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 5,
    alignItems: "center",
  },
  totalsLabel: { width: 140, textAlign: "right", marginRight: 8, color: "#222" },
  totalsValue: { width: 80, textAlign: "right", fontWeight: "bold", color: "#000" },
  grandTotal: {
    fontWeight: "bold",
    fontSize: 15,
    color: "#000",
    borderTopWidth: 2,
    borderTopColor: "#000",
    borderTopStyle: "solid",
    marginTop: 8,
    paddingTop: 4,
  },
  footer: { marginTop: 32, textAlign: "center", color: "#555", fontSize: 10 },
  paymentTerms: { marginTop: 10, color: "#222", fontSize: 11, textAlign: "center" },
});

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
}) => {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalBeforeVAT = subtotal + shippingCost + basePrice;
  const vatAmount = totalBeforeVAT * 0.2;
  const total = totalBeforeVAT + vatAmount;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header with logo and invoice info */}
        <View style={[styles.section, styles.headerRow]}>
          <View>
            {/* <Image src={LOGO_URL} style={styles.logo} /> */}
            <Text style={styles.company}>{company.name}</Text>
            <Text style={styles.infoLabel}>VAT: {company.vatNumber}</Text>
            <Text style={styles.infoLabel}>{company.address}, {company.city}</Text>
          </View>
          <View>
            <Text style={styles.header}>INVOICE</Text>
            <Text style={styles.infoLabel}>Invoice #: <Text style={styles.infoValue}>{invoiceNumber}</Text></Text>
            <Text style={styles.infoLabel}>Issue Date: <Text style={styles.infoValue}>{issueDate}</Text></Text>
            {dueDate && (
              <Text style={styles.infoLabel}>Due Date: <Text style={styles.infoValue}>{dueDate}</Text></Text>
            )}
          </View>
        </View>

        {/* Customer Info */}
        <View style={styles.section}>
          <Text style={styles.infoLabel}>Billed To:</Text>
          <Text style={styles.infoValue}>{customer.name}</Text>
          <Text style={styles.infoValue}>{customer.address}, {customer.city} {customer.postalCode}</Text>
          <Text style={styles.infoValue}>Phone: {customer.phone}</Text>
        </View>

        {/* Items Table */}
        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={styles.cellProduct}>Product</Text>
            <Text style={styles.cellQty}>Qty</Text>
            <Text style={styles.cellPrice}>Unit Price</Text>
            <Text style={styles.cellTotal}>Total</Text>
          </View>
          {items.map((item, idx) => (
            <View
              key={idx}
              style={[
                styles.tableRow,
                idx % 2 === 1 ? styles.altRow : undefined,
              ]}
            >
              <Text style={styles.cellProduct}>{item.name}</Text>
              <Text style={styles.cellQty}>{item.quantity}</Text>
              <Text style={styles.cellPrice}>€{item.price.toFixed(2)}</Text>
              <Text style={styles.cellTotal}>€{(item.price * item.quantity).toFixed(2)}</Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Subtotal:</Text>
            <Text style={styles.totalsValue}>€{subtotal.toFixed(2)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Shipping & Handling:</Text>
            <Text style={styles.totalsValue}>
              {shippingCost + basePrice > 0 ? `€${(shippingCost + basePrice).toFixed(2)}` : "FREE"}
            </Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>VAT (20%):</Text>
            <Text style={styles.totalsValue}>€{vatAmount.toFixed(2)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={[styles.totalsLabel, styles.grandTotal]}>Total:</Text>
            <Text style={[styles.totalsValue, styles.grandTotal]}>
              €{total.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Payment Method */}
        <View style={styles.paymentTerms}>
          <Text>Payment Method: {paymentMethod}</Text>
          <Text>Payment due within 7 days of invoice date.</Text>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          Thank you for your business! | Sofia Padel | 123 Avenue Padel, Sofia | info@sofiapadel.com
        </Text>
      </Page>
    </Document>
  );
};
