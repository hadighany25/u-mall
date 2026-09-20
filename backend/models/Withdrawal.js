const mongoose = require("mongoose");

const withdrawalSchema = new mongoose.Schema(
  {
    // 🌟 បន្ថែមថ្មី៖ ID សម្រាប់ចំណាំ (ឧ. WID-123456)
    withdrawalId: {
      type: String,
      unique: true,
    },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // ឬ Model ឈ្មោះអ្វីដែលបងប្រើសម្រាប់ Seller
      required: true,
    },
    amount: { type: Number, required: true },
    bankName: { type: String, required: true },
    accountName: { type: String, required: true },
    accountNumber: { type: String, required: true },
    status: {
      type: String,
      enum: ["PENDING", "PROCESSING", "COMPLETED", "REJECTED"],
      default: "PENDING",
    },
    upayTransactionId: { type: String }, // ទុកលេខកូដពី U-Pay
    pdfUrl: { type: String }, // ទុក Link វិក្កយបត្រ PDF
    note: { type: String },
  },
  { timestamps: true },
);

// 🌟 ជួសជុលបញ្ហា (next is not a function) ដោយប្រើប្រាស់ async function ធម្មតា
withdrawalSchema.pre("save", async function () {
  if (!this.withdrawalId) {
    // បង្កើតលេខ Random ៦ ខ្ទង់
    const randomNum = Math.floor(100000 + Math.random() * 900000);
    this.withdrawalId = `WID-${randomNum}`;
  }
});

module.exports = mongoose.model("Withdrawal", withdrawalSchema);
