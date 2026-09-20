// routes/adminRoutes.js
const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const upload = require("../config/cloudinary");

// ទី១៖ ត្រូវថែម isAdmin ចូលក្នុង Import នេះទើបវាស្គាល់
const { verifyToken, isAdmin } = require("../middleware/authMiddleware");

// ទី២៖ ឆែក Token សម្រាប់រាល់ Routes
router.use(verifyToken);

// ==========================================
// ជួរទី១៖ គ្រប់គ្រង Users
// ==========================================
router.get("/users", adminController.getUsers);
router.post("/users", adminController.createUserAndStore);
router.delete("/users/:id", adminController.deleteUser);
router.put("/users/:id", adminController.updateUser); // សម្រាប់កែប្រែ (Edit)
router.put("/users/:id/status", adminController.toggleUserStatus); // សម្រាប់ Ban

// ==========================================
// ជួរទី២៖ គ្រប់គ្រង Stores និង Orders
// ==========================================
router.get("/stores", adminController.getStores);
router.get("/orders", isAdmin, adminController.getGlobalOrders); // 👈 ជួសជុល: ដាក់ isAdmin
router.put("/stores/:id", isAdmin, adminController.updateStoreQuick); // 🌟 សម្រាប់ Admin កែហាងរហ័ស

// ==========================================
// ជួរទី៣៖ គ្រប់គ្រងហិរញ្ញវត្ថុ (Withdrawals)
// ==========================================
router.get("/withdrawals", isAdmin, adminController.getAllWithdrawals);

// ==========================================
// ជួរទី៤៖ API សម្រាប់ Dashboard Stats
// ==========================================
router.get("/dashboard-stats", isAdmin, adminController.getDashboardStats);

// ==========================================
// ជួរទី៥៖ API សម្រាប់ Upload រូបភាពទៅ Cloudinary
// ==========================================
router.post("/upload", isAdmin, upload.single("image"), (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "សូមជ្រើសរើសរូបភាពសិន!" });
    }

    // បាញ់ URL នៃរូបភាពដែល Upload រួចទៅអោយ Frontend វិញ
    res.status(200).json({
      success: true,
      imageUrl: req.file.path,
      message: "Upload ជោគជ័យ!",
    });
  } catch (error) {
    console.error("Upload Error:", error);
    res.status(500).json({
      success: false,
      message: "មានបញ្ហាក្នុងការ Upload ទៅកាន់ Cloudinary",
    });
  }
});

module.exports = router;
