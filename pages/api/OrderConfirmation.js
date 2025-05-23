// Dependencies
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const handlebars = require('handlebars');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin SDK (do this only once in your app)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(), // or use serviceAccount
  });
}
const db = admin.firestore();

// Load the HTML template (save your template as 'orderConfirmationTemplate.html' in the same directory)
const templateSource = fs.readFileSync(path.join(__dirname, 'orderConfirmationTemplate.html'), 'utf8');
const template = handlebars.compile(templateSource);

// Configure Nodemailer SMTP transport
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: true, // true for 465, false for 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Send order confirmation email for a given orderId
 * @param {string} orderId - Firestore document ID for the order
 */
async function sendOrderConfirmationEmail(orderId) {
  try {
    // Fetch order data from Firestore
    const orderDoc = await db.collection('orders').doc(orderId).get();
    if (!orderDoc.exists) throw new Error('Order not found');
    const order = orderDoc.data();

    // Prepare items array for template
    const items = (order.items || []).map(item => ({
      brand: item.name, // Your DB uses 'name' for brand in the first item
      name: item.name === 'Bullpadel' ? '' : item.name, // If name is 'Bullpadel', it's a brand, else it's a product name
      quantity: item.quantity,
      itemTotal: (item.price * item.quantity).toFixed(2),
    }));

    // If you want to display both brand and model, you may need to adjust your data model

    // Prepare template data
    const templateData = {
      customerName: `${order.first_name} ${order.last_name}`,
      items: items,
      subtotal: order.total_amount ? order.total_amount.toFixed(2) : '0.00',
      shippingCostDisplay: order.shipping_cost > 0 ? '€' + order.shipping_cost.toFixed(2) : 'FREE',
      total: order.total_amount ? order.total_amount.toFixed(2) : '0.00',
      address: order.address,
      city: order.city,
      postalCode: order.postal_code,
      phone: order.phone,
      deliveryOptionDisplay: order.delivery_option === 'delivery' ? 'Delivery to address' : 'Pick up from address',
      paymentMethodDisplay: order.payment_method === 'card' ? 'Pay by Card on Delivery' : 'Cash on Delivery'
    };

    // Generate the HTML email content
    const htmlContent = template(templateData);

    // Send the email
    await transporter.sendMail({
      from: `"Sofia Padel" <${process.env.SMTP_USER}>`,
      to: order.user_email,
      subject: 'Order Confirmation - Sofia Padel',
      html: htmlContent,
    });

    console.log(`Order confirmation email sent to ${order.user_email}`);
    return true;
  } catch (error) {
    console.error('Error sending order confirmation email:', error);
    throw error;
  }
}

// Example usage (for testing):
// sendOrderConfirmationEmail('dxfFfyev83WXxRVU4IEk');

module.exports = { sendOrderConfirmationEmail };
