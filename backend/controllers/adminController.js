// controllers/adminController.js
const User = require("../models/User");
const Store = require("../models/Store");
const Withdrawal = require("../models/Withdrawal");
const Order = require("../models/Order");
const Product = require("../models/Product");
const bcrypt = require("bcryptjs");

// ==========================================
// ១. ទាញយកអ្នកប្រើប្រាស់ទាំងអស់
// ==========================================
exports.getUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 });
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// ២. បង្កើតគណនី និងហាងព្រមគ្នា
// ==========================================
exports.createUserAndStore = async (req, res) => {
  try {
    const {
      username,
      password,
      role,
      fullName,
      phone,
      email,
      gender,
      address,
      profileImage,
      storeName,
      storeCategory,
      commissionRate,
      status,
      logoUrl,
      coverUrl,
      storeAddress,
      paymentInfo, // 🌟 ទទួលយក paymentInfo & coverUrl ពី Front-end
    } = req.body;

    const existingUser = await User.findOne({ username });
    if (existingUser)
      return res
        .status(400)
        .json({ success: false, message: "Username នេះមានគេប្រើរួចហើយ!" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      username,
      password: hashedPassword,
      role: role || "buyer",
      fullName: fullName || "",
      phone: phone || undefined,
      email: email || undefined,
      gender: gender || "",
      address: address || "",
    });

    if (profileImage && profileImage.trim() !== "")
      newUser.profileImage = profileImage.trim();

    await newUser.save();

    if (newUser.role === "seller") {
      if (!storeName || !storeCategory) {
        await User.findByIdAndDelete(newUser._id);
        return res.status(400).json({
          success: false,
          message: "ត្រូវតែមានឈ្មោះហាង និងប្រភេទហាងសម្រាប់ Seller!",
        });
      }

      const newStore = new Store({
        owner: newUser._id,
        storeName,
        storeCategory,
        commissionRate: commissionRate !== undefined ? commissionRate : 10,
        status: status || "active",
        address: storeAddress || "",
      });

      if (logoUrl && logoUrl.trim() !== "") newStore.logoUrl = logoUrl.trim();
      // 🌟 រក្សាទុករូប Cover និង Payment Info ចូល Database
      if (coverUrl && coverUrl.trim() !== "")
        newStore.coverUrl = coverUrl.trim();
      if (paymentInfo) newStore.paymentInfo = paymentInfo;

      await newStore.save();
    }

    res
      .status(201)
      .json({ success: true, message: "បង្កើតគណនីបានជោគជ័យ!", user: newUser });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// ៣. លុបគណនី
// ==========================================
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "រកមិនឃើញគណនីនេះទេ!" });

    if (user.role === "seller") {
      await Store.findOneAndDelete({ owner: user._id });
    }
    await User.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: "លុបបានជោគជ័យ!" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// ៤. ទាញយកហាង និងសំណើដកប្រាក់
// ==========================================
exports.getStores = async (req, res) => {
  try {
    const stores = await Store.find()
      .populate("owner", "username phone email status")
      .sort({ createdAt: -1 });
    res.json({ success: true, stores });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAllWithdrawals = async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, withdrawals });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "មានបញ្ហាក្នុងការទាញយកទិន្នន័យ!" });
  }
};

exports.getGlobalOrders = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const orders = await Order.find()
      .populate("store", "storeName")
      .populate("buyer", "username")
      .sort({ createdAt: -1 })
      .limit(limit);
    res.status(200).json({ success: true, orders });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ==========================================
// ៥. ទាញយកទិន្នន័យស្ថិតិ Dashboard
// ==========================================
exports.getDashboardStats = async (req, res) => {
  try {
    const filter = req.query.filter || "month";
    const now = new Date();
    let startDate = new Date(0),
      previousStartDate = new Date(0),
      previousEndDate = new Date(0);

    if (filter === "today") {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      previousStartDate = new Date(startDate);
      previousStartDate.setDate(previousStartDate.getDate() - 1);
      previousEndDate = new Date(startDate);
    } else if (filter === "week") {
      const firstDay = now.getDate() - now.getDay();
      startDate = new Date(now.getFullYear(), now.getMonth(), firstDay);
      previousStartDate = new Date(startDate);
      previousStartDate.setDate(previousStartDate.getDate() - 7);
      previousEndDate = new Date(startDate);
    } else if (filter === "month") {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      previousStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      previousEndDate = new Date(startDate);
    }

    const totalBuyers = await User.countDocuments({
      role: "buyer",
      createdAt: { $gte: startDate },
    });
    const totalSellers = await User.countDocuments({
      role: "seller",
      createdAt: { $gte: startDate },
    });
    const totalAdmins = await User.countDocuments({
      role: { $in: ["admin", "super_admin"] },
    });
    const bannedUsers = await User.countDocuments({
      status: { $in: ["banned", "suspended"] },
    });
    const inactiveStores = await Store.countDocuments({
      status: { $ne: "active" },
    });
    const newUsersMonth = await User.countDocuments({
      createdAt: { $gte: startDate },
    });

    const prevBuyers = await User.countDocuments({
      role: "buyer",
      createdAt: { $gte: previousStartDate, $lt: previousEndDate },
    });
    const prevSellers = await User.countDocuments({
      role: "seller",
      createdAt: { $gte: previousStartDate, $lt: previousEndDate },
    });

    const totalProducts = await Product.countDocuments();
    const outOfStock = await Product.countDocuments({ stock: { $lte: 0 } });
    const flashSaleItems = await Product.countDocuments({ isFlashSale: true });

    const totalOrders = await Order.countDocuments({
      createdAt: { $gte: startDate },
    });
    const pendingOrders = await Order.countDocuments({
      status: { $in: ["unpaid", "pending"] },
      createdAt: { $gte: startDate },
    });
    const completedOrders = await Order.countDocuments({
      status: "completed",
      createdAt: { $gte: startDate },
    });
    const cancelledOrders = await Order.countDocuments({
      status: "cancelled",
      createdAt: { $gte: startDate },
    });
    const prevOrders = await Order.countDocuments({
      createdAt: { $gte: previousStartDate, $lt: previousEndDate },
    });

    const revenueData = await Order.aggregate([
      { $match: { status: "completed", createdAt: { $gte: startDate } } },
      { $group: { _id: null, totalGross: { $sum: "$totalAmount" } } },
    ]);
    const grossRevenue = revenueData.length > 0 ? revenueData[0].totalGross : 0;
    const totalCommission = grossRevenue * 0.1;
    const netRevenue = grossRevenue - totalCommission;

    const prevRevenueData = await Order.aggregate([
      {
        $match: {
          status: "completed",
          createdAt: { $gte: previousStartDate, $lt: previousEndDate },
        },
      },
      { $group: { _id: null, totalGross: { $sum: "$totalAmount" } } },
    ]);
    const prevGrossRevenue =
      prevRevenueData.length > 0 ? prevRevenueData[0].totalGross : 0;

    const payoutData = await Withdrawal.aggregate([
      { $match: { status: "COMPLETED", createdAt: { $gte: startDate } } },
      { $group: { _id: null, totalPayout: { $sum: "$amount" } } },
    ]);
    const totalPayout = payoutData.length > 0 ? payoutData[0].totalPayout : 0;

    const refundData = await Order.aggregate([
      { $match: { status: "refunded", createdAt: { $gte: startDate } } },
      { $group: { _id: null, totalRefund: { $sum: "$totalAmount" } } },
    ]);
    const totalRefunds = refundData.length > 0 ? refundData[0].totalRefund : 0;

    const pendingWithdrawalsCount = await Withdrawal.countDocuments({
      status: "PENDING",
    });

    res.status(200).json({
      success: true,
      stats: {
        totalBuyers,
        prevBuyers,
        totalSellers,
        prevSellers,
        totalAdmins,
        inactiveStores,
        newUsersMonth,
        bannedUsers,
        grossRevenue,
        prevGrossRevenue,
        netRevenue,
        totalCommission,
        pendingWithdrawalsCount,
        totalPayout,
        totalRefunds,
        totalProducts,
        outOfStock,
        flashSaleItems,
        totalOrders,
        prevOrders,
        pendingOrders,
        completedOrders,
        cancelledOrders,
      },
    });
  } catch (error) {
    console.error("Dashboard Stats Error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server Error មិនអាចទាញទិន្នន័យបានទេ" });
  }
};

// ==========================================
// ៦. កែប្រែព័ត៌មានគណនី (Edit User)
// ==========================================
exports.updateUser = async (req, res) => {
  try {
    const {
      username,
      password,
      fullName,
      phone,
      email,
      gender,
      address,
      profileImage,
      storeName,
      storeCategory,
      commissionRate,
      status,
      logoUrl,
      coverUrl,
      storeAddress,
      paymentInfo, // 🌟 ទទួលយក paymentInfo & coverUrl
    } = req.body;

    const user = await User.findById(req.params.id);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "រកមិនឃើញគណនីនេះទេ!" });

    if (username) user.username = username;
    if (fullName !== undefined) user.fullName = fullName;
    if (phone !== undefined) user.phone = phone;
    if (email !== undefined) user.email = email;
    if (gender !== undefined) user.gender = gender;
    if (address !== undefined) user.address = address;
    if (profileImage !== undefined) user.profileImage = profileImage;

    if (password && password.trim() !== "") {
      user.password = await bcrypt.hash(password, 10);
    }
    await user.save();

    if (user.role === "seller") {
      const store = await Store.findOne({ owner: user._id });
      if (store) {
        if (storeName) store.storeName = storeName;
        if (storeCategory) store.storeCategory = storeCategory;
        if (commissionRate !== undefined) store.commissionRate = commissionRate;
        if (status) store.status = status;

        // 🌟 អាប់ដេត Logo, Cover, ទីតាំង និង Payment Info ចូល Database
        if (storeAddress !== undefined) store.address = storeAddress;
        if (logoUrl !== undefined) store.logoUrl = logoUrl;
        if (coverUrl !== undefined) store.coverUrl = coverUrl;
        if (paymentInfo) store.paymentInfo = paymentInfo;

        await store.save();
      }
    }

    res.json({ success: true, message: "ព័ត៌មានត្រូវបានកែប្រែជោគជ័យ!" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// ៧. បិទ/បើកគណនី (Ban / Unban User)
// ==========================================
exports.toggleUserStatus = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "រកមិនឃើញគណនីនេះទេ!" });

    if (user.role === "super_admin")
      return res
        .status(403)
        .json({ success: false, message: "មិនអាចបិទគណនី Super Admin បានទេ!" });

    user.status = req.body.status;
    await user.save();

    res.json({
      success: true,
      message: `គណនីត្រូវបាន ${req.body.status === "banned" ? "បិទ" : "បើកដំណើរការវិញ"}!`,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// ៨. កែប្រែព័ត៌មានហាងរហ័ស (Quick Update Store)
// ==========================================
exports.updateStoreQuick = async (req, res) => {
  try {
    const store = await Store.findById(req.params.id);
    if (!store)
      return res
        .status(404)
        .json({ success: false, message: "រកមិនឃើញហាងនេះទេ!" });

    if (req.body.status !== undefined) store.status = req.body.status;
    if (req.body.commissionRate !== undefined)
      store.commissionRate = Number(req.body.commissionRate);

    await store.save();
    res.json({ success: true, message: "កែប្រែព័ត៌មានហាងបានជោគជ័យ!" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
