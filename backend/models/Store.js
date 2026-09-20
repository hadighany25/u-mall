//Store.js
const mongoose = require("mongoose");

const storeSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    storeName: {
      type: String,
      required: true,
      trim: true,
    },
    storeCategory: {
      type: String,
      required: true,
      trim: true,
    },
    description: { type: String, default: "" },
    logoUrl: { type: String, default: "" },
    coverUrl: { type: String, default: "" },
    address: { type: String, default: "" },

    // ==========================================
    // ចំណុចសម្រាប់ Seller Center
    // ==========================================
    categories: {
      type: [String],
      default: [],
    },
    paymentInfo: {
      bankName: { type: String, default: "" },
      accountName: { type: String, default: "" },
      accountNumber: { type: String, default: "" },
    },
    commissionRate: { type: Number, default: 10 },
    walletBalance: { type: Number, default: 0 },

    // ==========================================
    // 🌟 ផ្នែកបន្ថែមថ្មី៖ ប្រព័ន្ធវាយតម្លៃ និងស្ថិតិលក់ (Ratings & Stats)
    // ==========================================
    averageRating: {
      type: Number,
      default: 5, // 👈 ដូរមក 5 ដើម្បីឱ្យហាងបង្កើតថ្មីមានផ្កាយ 5 ពេញភ្លាមៗ
      min: 0,
      max: 5,
    },
    totalRatings: {
      type: Number,
      default: 0,
    },
    totalSales: {
      type: Number,
      default: 0,
    },
    // ==========================================

    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Store", storeSchema);
