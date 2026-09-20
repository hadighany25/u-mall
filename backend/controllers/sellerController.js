// controllers/sellerController.js
const User = require("../models/User");
const Store = require("../models/Store");
const bcrypt = require("bcryptjs");
const Product = require("../models/Product");
const Order = require("../models/Order");

// 🌟 មុខងារជំនួយសម្រាប់ស្វែងរកហាង ដោយផ្អែកលើអ្នកដែលកំពុងស្នើសុំ (Admin ឬ Seller)
const getStoreQuery = (req) => {
  if (req.user.role === "admin" || req.user.role === "super_admin") {
    if (!req.query.storeId && !req.body.storeId) {
      throw new Error("ត្រូវបញ្ជាក់ storeId សម្រាប់ Admin");
    }
    return { _id: req.query.storeId || req.body.storeId };
  } else {
    return { owner: req.user.id || req.user._id };
  }
};

// ==========================================
// PROFILE & SETTINGS
// ==========================================
exports.getProfile = async (req, res) => {
  try {
    const storeQuery = getStoreQuery(req);
    const store = await Store.findOne(storeQuery);

    if (!store) {
      return res
        .status(404)
        .json({ success: false, message: "រកមិនឃើញហាងទេ!" });
    }
    res.json({ success: true, store });
  } catch (error) {
    const status = error.message.includes("ត្រូវបញ្ជាក់ storeId") ? 400 : 500;
    res
      .status(status)
      .json({ success: false, message: error.message || "មានបញ្ហាបច្ចេកទេស" });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const storeQuery = getStoreQuery(req);
    const {
      storeName,
      logoUrl,
      coverUrl,
      description,
      paymentInfo,
      categories,
    } = req.body;

    const store = await Store.findOneAndUpdate(
      storeQuery,
      { storeName, logoUrl, coverUrl, description, paymentInfo, categories },
      { new: true },
    );
    if (!store)
      return res.status(404).json({ success: false, message: "រកមិនឃើញហាង!" });
    res.json({ success: true, store, message: "បានកែប្រែដោយជោគជ័យ" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { oldPass, newPass } = req.body;
    const user = await User.findById(userId);

    const isMatch = await bcrypt.compare(oldPass, user.password);
    if (!isMatch)
      return res
        .status(400)
        .json({ success: false, message: "លេខសម្ងាត់ចាស់មិនត្រឹមត្រូវ!" });

    user.password = await bcrypt.hash(newPass, 10);
    await user.save();
    res.json({ success: true, message: "ប្ដូរលេខសម្ងាត់ជោគជ័យ!" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// PRODUCTS
// ==========================================
exports.getProducts = async (req, res) => {
  try {
    const storeQuery = getStoreQuery(req);
    const store = await Store.findOne(storeQuery);
    if (!store) return res.json({ success: true, products: [] });

    const products = await Product.find({ store: store._id });
    res.json({ success: true, products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createProduct = async (req, res) => {
  try {
    const storeQuery = getStoreQuery(req);
    const { name, price, stock, imageUrl, category } = req.body;
    const store = await Store.findOne(storeQuery);

    if (!store)
      return res.status(404).json({ success: false, message: "រកមិនឃើញហាង!" });

    const product = new Product({
      name,
      price,
      stock,
      imageUrl,
      category,
      store: store._id,
    });
    await product.save();
    res.status(201).json({ success: true, product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const { name, price, stock, imageUrl, category } = req.body;
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { name, price, stock, imageUrl, category },
      { new: true },
    );
    res.json({ success: true, product, message: "បានកែប្រែដោយជោគជ័យ" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "បានលុបជោគជ័យ" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// ORDERS
// ==========================================
exports.getOrders = async (req, res) => {
  try {
    const storeQuery = getStoreQuery(req);
    const store = await Store.findOne(storeQuery);
    if (!store) return res.json({ success: true, orders: [] });

    const orders = await Order.find({ store: store._id })
      .populate("buyer", "username phone fullName")
      .sort({ createdAt: -1 });
    res.json({ success: true, orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true },
    );
    res.json({ success: true, order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    if (!reason)
      return res
        .status(400)
        .json({ success: false, message: "សូមបញ្ជាក់មូលហេតុ!" });

    const order = await Order.findById(id);
    if (!order)
      return res
        .status(404)
        .json({ success: false, message: "រកមិនឃើញ Order ទេ" });
    if (order.status === "cancelled")
      return res.status(400).json({ success: false, message: "បោះបង់រួចហើយ" });

    order.status = "cancelled";
    order.cancelReason = reason;
    await order.save();
    res.json({ success: true, message: "បោះបង់ជោគជ័យ", order });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "មានបញ្ហាបច្ចេកទេសលើ Server" });
  }
};
