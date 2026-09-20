// payoutController.js
const crypto = require("crypto");
const Withdrawal = require("../models/Withdrawal");
const User = require("../models/User");
const Store = require("../models/Store"); // 👈 ទី១៖ ត្រូវ Import Store ចូលមក

const UPAY_API_KEY = process.env.UPAY_API_KEY;
const UPAY_SECRET = process.env.UPAY_API_SECRET;
const UPAY_URL = process.env.UPAY_BASE_URL;
const UPAY_MERCHANT_ID = process.env.UPAY_MERCHANT_ID;

// ==========================================
// ១. Seller ស្នើសុំដកប្រាក់ (មានប្រព័ន្ធការពារ Rollback ការពារបាត់លុយ)
// ==========================================
exports.requestWithdrawal = async (req, res) => {
  try {
    const { amount, paymentInfo } = req.body;
    const sellerId = req.user.id || req.user._id; // ទាញពី Token

    // 🚀 ការពារទី១៖ ត្រូវប្រាកដថាចំនួនទឹកប្រាក់ធំជាង ០
    if (!amount || amount <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "ចំនួនទឹកប្រាក់មិនត្រឹមត្រូវ!" });
    }

    // 🚀 ការពារទី២៖ រកមើលហាងរបស់គាត់
    const store = await Store.findOne({ owner: sellerId });
    if (!store) {
      return res
        .status(404)
        .json({ success: false, message: "មិនអាចស្វែងរកហាងរបស់អ្នកបានទេ!" });
    }

    // 🚀 ការពារទី៣៖ ឆែកមើលលុយពិតប្រាកដក្នុង Database តើមានគ្រប់ដកឬអត់?
    if (store.walletBalance < amount) {
      return res.status(400).json({
        success: false,
        message: "ទឹកប្រាក់ក្នុងកាបូបរបស់អ្នកមិនគ្រប់គ្រាន់ទេ!",
      });
    }

    // 🌟 ជំហានទី៤៖ បង្កើតសំណើដកប្រាក់សិន (ដើម្បីឱ្យប្រព័ន្ធវាបង្កើត WithdrawalId ស្វ័យប្រវត្តិ)
    const newWithdrawal = new Withdrawal({
      sellerId,
      amount,
      bankName: paymentInfo.bankName,
      accountName: paymentInfo.accountName,
      accountNumber: paymentInfo.accountNumber,
    });

    // 🚀 ជំហានទី៥៖ ព្យាយាម Save និងកាត់លុយ ដោយដាក់ក្នុង Try-Catch យ៉ាងម៉ត់ចត់
    try {
      await newWithdrawal.save(); // រក្សាទុកសំណើដកប្រាក់សិន

      // បើ Save បានជោគជ័យ ទើបកាត់លុយចេញពី Wallet របស់ហាង
      store.walletBalance -= amount;
      await store.save();
    } catch (dbError) {
      // 🛡️ បើមានកំហុសកើតឡើងពេល Save (ឧ. ធ្លាក់ Server) ត្រូវលុបចោលសំណើដកប្រាក់វិញ (បើវាបានបង្កើតរួច)
      if (newWithdrawal._id) {
        await Withdrawal.findByIdAndDelete(newWithdrawal._id);
      }
      throw dbError; // បោះ Error ទៅក្រោមវិញ
    }

    res.status(200).json({
      success: true,
      message: "សំណើដកប្រាក់ទទួលបានជោគជ័យ និងបានកាត់ចេញពីគណនី!",
      withdrawalId: newWithdrawal.withdrawalId, // បង្ហាញ ID ថ្មី (WID-XXXXXX) ឱ្យដឹងផង
    });
  } catch (err) {
    console.error("❌ Request Withdrawal Error:", err);
    res
      .status(500)
      .json({
        success: false,
        message: err.message || "បញ្ហាបច្ចេកទេស Backend",
      });
  }
};

// ==========================================
// ២. Admin អនុម័ត និងបញ្ជាទៅ U-Pay (ផ្ទេរប្រាក់)
// ==========================================
exports.approveWithdrawal = async (req, res) => {
  try {
    const { withdrawalId } = req.params;
    const withdrawal = await Withdrawal.findById(withdrawalId);

    if (!withdrawal || withdrawal.status !== "PENDING") {
      return res
        .status(400)
        .json({ success: false, message: "សំណើនេះមិនត្រឹមត្រូវ!" });
    }

    if (!UPAY_API_KEY || !UPAY_SECRET || !UPAY_URL) {
      return res.status(500).json({
        success: false,
        message: "Server មិនទាន់បានកំណត់ API Keys ត្រឹមត្រូវទេ!",
      });
    }

    const payload = {
      merchantId: UPAY_MERCHANT_ID || "500500500500500",
      referenceId: withdrawal._id.toString(),
      amount: withdrawal.amount,
      receiverAccount: withdrawal.accountNumber,
      description: `U-Mall Payout for Seller`,
    };

    const payloadString = JSON.stringify(payload);
    const timestamp = Date.now().toString();

    const dataToSign = payloadString + timestamp;
    const signature = crypto
      .createHmac("sha256", UPAY_SECRET)
      .update(dataToSign)
      .digest("hex");

    // 🚀 កែ Endpoint ឲ្យត្រូវនឹង server.js របស់ U-Pay ជាក់ស្ដែង
    const response = await fetch(`${UPAY_URL}/api/b2b/transfer`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": UPAY_API_KEY,
        "x-timestamp": timestamp,
        "x-signature": signature,
      },
      body: payloadString,
    });

    // 🛡️ អាគមការពារ Crash: អានទិន្នន័យជា Text សិន ដើម្បីការពារពេល U-Pay បោះ HTML មកវិញ
    const responseText = await response.text();
    let data;

    try {
      // ព្យាយាមបំប្លែងទៅជា JSON
      data = JSON.parse(responseText);
    } catch (parseError) {
      // បើបំប្លែងមិនចេញ (មានន័យថា U-Pay បោះ HTML មក)
      console.error(
        "❌ U-Pay បោះមកមិនមែនជា JSON ទេ! (ប្រហែលខុស Endpoint) លទ្ធផល:",
        responseText.substring(0, 150),
      );
      return res.status(500).json({
        success: false,
        message:
          "ប្រព័ន្ធ U-Pay ឆ្លើយតបខុសប្រក្រតី (អាចនឹងខុស Endpoint ផ្ទេរប្រាក់)",
      });
    }

    // ដំណើរការបន្តបើបំប្លែង JSON បានជោគជ័យ
    if (response.ok && data.success) {
      withdrawal.status = "COMPLETED"; // ✅ ដូរមក COMPLETED វិញ
      withdrawal.upayTransactionId = data.transactionId || "";
      withdrawal.note = "ការផ្ទេរប្រាក់ជោគជ័យតាមប្រព័ន្ធ U-Pay";
      await withdrawal.save();

      res.status(200).json({
        success: true,
        message: "បានបញ្ជាផ្ទេរប្រាក់តាម U-Pay ជោគជ័យ!",
      });
    } else {
      res.status(400).json({
        success: false,
        message: "កំហុសពី U-Pay: " + (data.message || "មិនស្គាល់បញ្ហា"),
      });
    }
  } catch (err) {
    console.error("Payout Error:", err);
    res.status(500).json({ success: false, message: "បញ្ហាបច្ចេកទេស Backend" });
  }
};

// ==========================================
// ៣. Admin បដិសេធសំណើដកប្រាក់ (Reject Withdrawal)
// ==========================================
exports.rejectWithdrawal = async (req, res) => {
  try {
    const { withdrawalId } = req.params;
    const { reason } = req.body; // Admin អាចបញ្ជាក់មូលហេតុ (ឧ. "លេខកុងធនាគារមិនត្រឹមត្រូវ")

    // ១. ស្វែងរកប្រវត្តិដកប្រាក់
    const withdrawal = await Withdrawal.findById(withdrawalId);

    if (!withdrawal || withdrawal.status !== "PENDING") {
      return res.status(400).json({
        success: false,
        message: "សំណើនេះមិនត្រឹមត្រូវ ឬត្រូវបានដោះស្រាយរួចរាល់ហើយ!",
      });
    }

    // ២. ស្វែងរកហាងរបស់អ្នកលក់ ដើម្បីសងប្រាក់ត្រលប់វិញ
    const store = await Store.findOne({ owner: withdrawal.sellerId });

    if (!store) {
      return res.status(404).json({
        success: false,
        message: "រកមិនឃើញគណនីហាងរបស់អ្នកលក់ដើម្បីសងប្រាក់វិញទេ!",
      });
    }

    // 🚀 ៣. អាគមសំខាន់៖ បូកប្រាក់សងចូលក្នុង Wallet របស់ Seller វិញ
    store.walletBalance += withdrawal.amount;
    await store.save();

    // ៤. ធ្វើបច្ចុប្បន្នភាពស្ថានភាពសំណើទៅជា REJECTED
    withdrawal.status = "REJECTED";
    withdrawal.note = reason || "សំណើដកប្រាក់ត្រូវបានបដិសេធដោយ Admin";
    await withdrawal.save();

    res.status(200).json({
      success: true,
      message:
        "បានបដិសេធសំណើ និងបានសងប្រាក់ចូលកាបូប (Wallet) អ្នកលក់វិញជោគជ័យ!",
    });
  } catch (err) {
    console.error("❌ Reject Payout Error:", err);
    res.status(500).json({ success: false, message: "បញ្ហាបច្ចេកទេស Backend" });
  }
};

// ==========================================
// ៤. ទាញយកប្រវត្តិដកប្រាក់ទាំងអស់របស់អ្នកលក់ (Seller)
// ==========================================
exports.getSellerWithdrawals = async (req, res) => {
  try {
    const sellerId = req.user.id || req.user._id; // ចាប់យក ID ពី Token

    // ស្វែងរកប្រវត្តិដកប្រាក់របស់គាត់ ហើយតម្រៀបពីថ្មីទៅចាស់ (createdAt: -1)
    const withdrawals = await Withdrawal.find({ sellerId: sellerId }).sort({
      createdAt: -1,
    });

    res.status(200).json({
      success: true,
      count: withdrawals.length,
      data: withdrawals, // បោះទិន្នន័យទៅឱ្យ Frontend
    });
  } catch (err) {
    console.error("❌ Get Withdrawals Error:", err);
    res.status(500).json({
      success: false,
      message: "មានបញ្ហាក្នុងការទាញយកប្រវត្តិដកប្រាក់",
    });
  }
};

// ==========================================
// ៥. ទាញយកប្រវត្តិដកប្រាក់ទាំងអស់សម្រាប់ Admin (ទុកឱ្យ Admin ឆែកមើល)
// ==========================================
exports.getAllWithdrawals = async (req, res) => {
  try {
    // 🌟 ជួសជុល៖ បន្ថែមការ Populate ទិន្នន័យ Store និង Owner (អ្នកលក់)
    // ត្រូវប្រាកដថា Withdrawal Schema របស់បងមាន field ឈ្មោះ sellerId (ដែលយើងនឹងប្រើដើម្បីរក store)
    // ឬក៏យើងត្រូវកែសម្រួលរបៀបដែលយើង find អាស្រ័យលើ Schema របស់បង
    // ខាងក្រោមនេះ គឺសន្មត់ថា Withdrawal Schema មាន sellerId ជា ObjectId

    // ដោយសារតែ Withdrawal schema បច្ចុប្បន្នអត់មាន store object reference ផ្ទាល់ យើងអាចនឹងពិបាក populate
    // វិធីល្អបំផុត គឺទាញ Withdrawal ទាំងអស់ ហើយ loop រក Store ម្តងមួយៗ ឬ ធ្វើឱ្យវាមាន Store Reference តាំងពីពេល create
    // ដើម្បីកុំឱ្យស្មុគស្មាញ និងប៉ះពាល់ Database ខ្លាំង ខ្ញុំនឹងកែសម្រួលវិធីទាញទិន្នន័យឱ្យត្រូវនឹងទម្រង់បច្ចុប្បន្ន

    const withdrawals = await Withdrawal.find().sort({ createdAt: -1 });

    // បង្កើត array ថ្មីដើម្បីផ្ទុកទិន្នន័យរួមគ្នា (Withdrawal + Store details)
    const detailedWithdrawals = [];

    for (let w of withdrawals) {
      // ស្វែងរក Store ដែលពាក់ព័ន្ធដោយផ្អែកលើ sellerId ក្នុង Withdrawal
      const store = await Store.findOne({ owner: w.sellerId }).populate(
        "owner",
        "username fullName",
      );

      // បំប្លែង Mongoose document ទៅជា Plain Javascript object សិនទើបអាចថែម field បាន
      const withdrawalObj = w.toObject();

      if (store) {
        withdrawalObj.storeName = store.storeName;
        withdrawalObj.store = {
          walletBalance: store.walletBalance,
          owner: store.owner,
        };
      } else {
        withdrawalObj.storeName = "មិនស្គាល់ហាង";
        withdrawalObj.store = { walletBalance: 0, owner: null };
      }

      detailedWithdrawals.push(withdrawalObj);
    }

    res.status(200).json({
      success: true,
      count: detailedWithdrawals.length,
      // ប្រើ data ជាជាង withdrawals ដើម្បីឱ្យត្រូវនឹង frontend ដែលរង់ចាំรับ data.data
      data: detailedWithdrawals,
      withdrawals: detailedWithdrawals, // បោះទាំងពីរក្រែងលោមានកូដកន្លែងផ្សេងហៅ
    });
  } catch (err) {
    console.error("❌ Admin Get Withdrawals Error:", err);
    res.status(500).json({ success: false, message: "បញ្ហាបច្ចេកទេស Backend" });
  }
};

// ==========================================
// ៦. ទាញយកទិន្នន័យដកប្រាក់មួយជាក់លាក់ (សម្រាប់ Review Modal)
// ==========================================
exports.getWithdrawalById = async (req, res) => {
  try {
    const { id } = req.params;
    const w = await Withdrawal.findById(id);

    if (!w) {
      return res
        .status(404)
        .json({ success: false, message: "រកមិនឃើញសំណើនេះទេ!" });
    }

    const store = await Store.findOne({ owner: w.sellerId }).populate(
      "owner",
      "username fullName",
    );
    const withdrawalObj = w.toObject();

    if (store) {
      withdrawalObj.storeName = store.storeName;
      withdrawalObj.store = {
        walletBalance: store.walletBalance,
        owner: store.owner,
      };
    }

    res.status(200).json({
      success: true,
      withdrawal: withdrawalObj,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "បញ្ហាបច្ចេកទេស Backend" });
  }
};
