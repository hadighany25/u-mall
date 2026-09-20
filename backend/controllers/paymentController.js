// paymentController.js
const Order = require("../models/Order");
const crypto = require("crypto");
const axios = require("axios");

// ============================================================================
// ១. មុខងារសម្រាប់ស្នើសុំ QR Code ពី U-Pay Bank
// ============================================================================
const createUPayQR = async (req, res) => {
  try {
    const { orderId, amount: frontendAmount } = req.body;

    // ប្រើ Regex ដើម្បីចាប់យក Order គ្រប់ហាងទាំងអស់ (ORD-123456, ORD-123456-1, -2...)
    const orderIdRegex = new RegExp("^" + orderId + "(?:-|$)");

    const orders = await Order.find({ orderId: orderIdRegex });
    if (!orders || orders.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "រកមិនឃើញវិក័យប័ត្រនេះទេ!" });
    }

    const merchantId = process.env.UPAY_MERCHANT_ID;
    const apiKey = process.env.UPAY_API_KEY;
    const apiSecret = process.env.UPAY_API_SECRET;
    const baseUrl = process.env.UPAY_BASE_URL;

    let finalAmount = frontendAmount;

    // បើ Frontend អត់មានបោះតម្លៃមកទេ ត្រូវបូកសរុបតម្លៃ Order គ្រប់ហាងដោយស្វ័យប្រវត្តិ
    if (!finalAmount) {
      const subTotal = orders.reduce((sum, ord) => sum + ord.totalAmount, 0);
      finalAmount = subTotal + 1.5; // បូក 1.5 ថ្លៃដឹកជញ្ជូន
    }

    const amount = Number(finalAmount).toFixed(2);
    const remark = `ទូទាត់សម្រាប់វិក័យប័ត្រលេខ: ${orderId}`;
    const reqTime = Date.now().toString();

    const rawSignature = `${merchantId}${orderId}${amount}${apiKey}${reqTime}`;
    const hashSignature = crypto
      .createHmac("sha256", apiSecret)
      .update(rawSignature)
      .digest("hex");

    const response = await axios.post(
      `${baseUrl}/api/merchants/qr/create`,
      {
        merchant_id: merchantId,
        order_id: orderId,
        amount: amount,
        remark: remark,
        // 🔥 ជួសជុលទី១៖ ប្ដូរលីងទៅជា U-Mall ថ្មី
        notify_url: "https://u-mall-kh.fly.dev/api/payment/webhook",
        req_time: reqTime,
        sign: hashSignature,
      },
      { headers: { "Content-Type": "application/json" } },
    );

    if (response.data && response.data.code === "SUCCESS") {
      res.status(200).json({
        success: true,
        qrData: response.data.data.qr_code_data,
        deepLink: response.data.data.deeplink,
      });
    } else {
      res.status(400).json({
        success: false,
        message: "ធនាគារបដិសេធសំណើ",
        error: response.data,
      });
    }
  } catch (error) {
    const errorMsg = error.response ? error.response.data : error.message;
    console.error("❌ Error creating U-Pay QR:", errorMsg);
    res.status(500).json({
      success: false,
      message: "បញ្ហាបច្ចេកទេសតភ្ជាប់ទៅធនាគារ U-Pay",
      detail: errorMsg,
    });
  }
};

// មុខងារស្នើសុំកាត់លុយពីកាត U-Pay
const processCardPayment = async (req, res) => {
  try {
    const { orderId, amount, cardNumber, expiry, cvv } = req.body;

    const merchantId = process.env.UPAY_MERCHANT_ID;
    const apiSecret = process.env.UPAY_API_SECRET;
    const baseUrl = process.env.UPAY_BASE_URL;

    const timestamp = Date.now().toString();
    const currency = "USD";

    const dataToSign = `${merchantId}${orderId}${amount}${currency}${cardNumber}${timestamp}`;
    const hash = crypto
      .createHmac("sha256", apiSecret)
      .update(dataToSign)
      .digest("hex");

    const response = await axios.post(`${baseUrl}/api/gateway/charge-card`, {
      merchantId,
      orderId,
      amount,
      currency,
      cardNumber,
      expiry,
      cvv,
      timestamp,
      hash,
    });

    if (response.data.success) {
      res.status(200).json({ success: true, message: response.data.message });
    } else {
      res.status(400).json({ success: false, message: response.data.message });
    }
  } catch (error) {
    const errorMsg =
      error.response && error.response.data && error.response.data.message
        ? error.response.data.message
        : error.message;

    const statusCode = error.response ? error.response.status : 500;
    res.status(statusCode).json({ success: false, message: errorMsg });
  }
};

// ============================================================================
// ២. មុខងារ Webhook ទទួលដំណឹងពីធនាគារ
// ============================================================================
const handleWebhook = async (req, res) => {
  try {
    const { orderId, amount, status, upayTransactionId } = req.body;

    const orderIdRegex = new RegExp("^" + orderId + "(?:-|$)");

    // 🔥 ជួសជុលទី២៖ បន្ថែម status: "pending" ដើម្បីឱ្យ Seller ឃើញ
    const result = await Order.updateMany(
      { orderId: orderIdRegex },
      {
        $set: {
          status: "pending", // 👈 រុញវិក័យប័ត្រចូលប្រអប់ Pending វិញ
          paymentStatus: status || "PAID", // 👈 បញ្ជាក់ថាលុយបង់រួចរាល់
          upayTransactionId: upayTransactionId,
          paidAt: new Date(),
        },
      },
    );

    if (result.matchedCount === 0) {
      return res
        .status(404)
        .json({ success: false, message: "រកមិនឃើញវិក័យប័ត្រនេះទេ" });
    }

    res.status(200).json({
      success: true,
      message:
        "Webhook received and all multi-store orders updated successfully",
    });
  } catch (error) {
    console.error("Webhook Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ============================================================================
// ៣. មុខងារ Polling ឆែកស្ថានភាពលុយ
// ============================================================================
const checkOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;

    const orderIdRegex = new RegExp("^" + orderId + "(?:-|$)");
    const order = await Order.findOne({ orderId: orderIdRegex });

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "រកមិនឃើញវិក័យប័ត្រនេះទេ" });
    }

    res.status(200).json({
      success: true,
      status: order.paymentStatus,
    });
  } catch (error) {
    console.error("Error checking order status:", error);
    res.status(500).json({ success: false, message: "បញ្ហាបច្ចេកទេស" });
  }
};

module.exports = {
  createUPayQR,
  processCardPayment,
  handleWebhook,
  checkOrderStatus,
};
