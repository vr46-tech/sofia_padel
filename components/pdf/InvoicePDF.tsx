import React from "react";
import {
  Page,
  Text,
  View,
  Document,
  StyleSheet,
  Image,
} from "@react-pdf/renderer";

// You can import your logo or use a URL:
const LOGO_URL = "https://i.postimg.cc/fWr5F6YW/no-Bg-Color-1.png";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 12,
    padding: 32,
    backgroundColor: "#f7f7f7",
    color: "#1a4744",
  },
  logo: {
    width: 100,
    height: 32,
    marginBottom: 10,
  },
  section: { marginBottom: 18 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  header: { fontSize: 22, color: "#20a799", fontWeight: "bold" },
  company: { fontSize: 12, color: "#196c65", marginBottom: 2 },
  infoLabel: { color: "#666666", fontSize: 10 },
  infoValue: { fontWeight: 500, color: "#1a4744", fontSize: 12, marginBottom: 2 },
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
    color: "#1a857c",
    borderBottomWidth: 2,
    borderBottomColor: "#20a799",
  },
  tableCell: { padding: 6, fontSize: 11, flexGrow: 1 },
  imageCell: {
    width: 40,
    height: 40,
    marginRight: 8,
    borderRadius: 4,
    objectFit: "contain",
    backgroundColor: "#fff",
    border: "1px solid #e5e5e5",
  },
  altRow: { backgroundColor: "#fafafa" },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 5,
    alignItems: "center",
  },
  totalsLabel: { width: 140, textAlign: "right", marginRight: 8, color: "#404040" },
  totalsValue: { width: 80, textAlign: "right", fontWeight: "bold", color: "#20a799" },
  grandTotal: {
    fontWeight: "bold",
    fontSize: 15,
    color: "#1a857c",
    borderTopWidth: 2,
    borderTopColor: "#20a799",
    borderTopStyle: "solid",
    marginTop: 8,
    paddingTop: 4,
  },
  footer: { marginTop: 32, textAlign: "center", color: "#818181", fontSize: 10 },
  paymentTerms: { marginTop: 10, color: "#404040", fontSize: 11, textAlign: "center" },
});

type InvoiceItem = {
  name: string;
  brand?: string;
  quantity: number;
  price: number;
  image_url?: string;
};

type InvoiceProps = {
  invoiceNumber: string;
  issueDate: string;
  dueDate?: string;
  company: {
    name: string;
    address: string;
    city: string;
    vatNumber: string;
  };
  customer: {
    name: string;
    address: string;
    city: string;
    postalCode: string;
    phone: string;
  };
  items: InvoiceItem[];
  shippingCost: number;
  basePrice: number;
  paymentMethod: string;
};

export const InvoicePDF: React.FC<InvoiceProps> = ({
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
            <Image src={LOGO_URL} style={styles.logo} />
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
            <Text style={[styles.tableCell, { flexGrow: 2 }]}>Product</Text>
            <Text style={styles.tableCell}>Qty</Text>
            <Text style={styles.tableCell}>Unit Price</Text>
            <Text style={styles.tableCell}>Total</Text>
          </View>
          {items.map((item, idx) => (
            <View
              key={idx}
              style={[
                styles.tableRow,
                idx % 2 === 1 ? styles.altRow : undefined,
              ]}
            >
              <View
                style={[
                  styles.tableCell,
                  { flexGrow: 2, flexDirection: "row", alignItems: "center" },
                ]}
              >
                {item.image_url && (
                  <Image src={item.image_url} style={styles.imageCell} />
                )}
                <View>
                  <Text>{item.name}</Text>
                  {item.brand && (
                    <Text style={{ fontSize: 9, color: "#20a799" }}>{item.brand}</Text>
                  )}
                </View>
              </View>
              <Text style={styles.tableCell}>{item.quantity}</Text>
              <Text style={styles.tableCell}>€{item.price.toFixed(2)}</Text>
              <Text style={styles.tableCell}>€{(item.price * item.quantity).toFixed(2)}</Text>
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
          Thank you for your business! | Sofia Padel | {company.address} | info@sofiapadel.com
        </Text>
      </Page>
    </Document>
  );
};
