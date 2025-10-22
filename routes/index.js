const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { Api, Tranday, Transaction } = require('../_helpers/db');
const fetch = require('node-fetch');

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
};

// Helper function to fetch game lists and create a lookup map
const getGameImagesMap = async () => {
    const providers = ['PG', 'JOKER', 'JILI', 'PP'];
    const gameMap = new Map();
    try {
        const promises = providers.map(provider =>
            fetch(`https://games-api.cryteksoft.cloud/api/gamelist?provider=${provider}`).then(res => res.json())
        );
        const results = await Promise.all(promises);
        results.forEach(providerGames => {
            if (providerGames && Array.isArray(providerGames.games)) {
                providerGames.games.forEach(game => {
                    // --- START: แก้ไขตรงนี้ ---
                    // ถ้าเป็นค่าย JILI ให้ใช้ game_code เป็น key แต่ถ้าค่ายอื่นใช้ game_id
                    const key = game.provider === 'JILI' ? String(game.game_code) : String(game.game_id);
                    // --- END: แก้ไขตรงนี้ ---

                    gameMap.set(key, {
                        imageUrl: game.image_url,
                        gameName: game.game_name
                    });
                });
            }
        });
    } catch (error) {
        console.error("Failed to fetch game lists:", error);
    }
    return gameMap;
};

// --- Routes แสดงผลหน้าเว็บ (ส่วนนี้ถูกต้องแล้ว ไม่ต้องแก้ไข) ---
router.get('/', (req, res) => {
    if (req.session.user) {
        res.redirect('/dashboard');
    } else {
        res.redirect('/login');
    }
});

router.get('/login', (req, res) => {
    res.render('login', { error: null });
});

router.get('/dashboard', isAuthenticated, async (req, res) => {
    const user = await Api.findById(req.session.user.id).lean();
    res.render('dashboard', { user: user });
});

// --- START: เพิ่ม Route สำหรับหน้ารายงาน ---
router.get('/report', isAuthenticated, async (req, res) => {
    const user = await Api.findById(req.session.user.id).lean();
    res.render('report', { user: user, title: 'รายงาน' });
});
// --- END: เพิ่ม Route สำหรับหน้ารายงาน ---

router.get('/change-password', isAuthenticated, async (req, res) => {
    const user = await Api.findById(req.session.user.id).lean();
    res.render('change-password', { user: user });
});

router.get('/api-keys', isAuthenticated, async (req, res) => {
    const user = await Api.findById(req.session.user.id).lean();
    res.render('api_keys', { user: user, title: 'จัดการ API' });
});

router.get('/documents', isAuthenticated, async (req, res) => {
    const user = await Api.findById(req.session.user.id).lean();
    res.render('documents', { user: user, title: 'เอกสาร API' });
});

router.get('/manage-2fa', isAuthenticated, async (req, res) => {
    const user = await Api.findById(req.session.user.id).lean();
    res.render('manage_2fa', { user: user, title: 'จัดการ 2FA' });
});

// --- START: แก้ไข API ให้ตรงกับการทำงานของ Frontend ---

// **แก้ไข:** API สำหรับดึงยอดรวม (ที่ /api/user/totals เรียกใช้)
router.get('/api/user/totals', isAuthenticated, async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.session.user.id);
        let matchCondition = { apikey: userId };

        // --- START: แก้ไขส่วนนี้ ---
        // ตรวจสอบว่ามีการส่งช่วงวันที่มาหรือไม่ (สำหรับการค้นหาในหน้า Report)
        if (req.query.start && req.query.end) {
            const [month1, day1, year1] = req.query.start.split('/');
            const [month2, day2, year2] = req.query.end.split('/');
            const startDate = new Date(`${year1}-${month1}-${day1}`);
            const endDate = new Date(new Date(`${year2}-${month2}-${day2}`).setHours(23, 59, 59, 999));
            
            // ใช้ $addFields เพื่อแปลง String เป็น Date และกรองข้อมูล
            const dateFilterPipeline = [
                {
                    $addFields: {
                        convertedDate: { $dateFromString: { dateString: '$data', format: '%m/%d/%Y' } }
                    }
                },
                {
                    $match: { convertedDate: { $gte: startDate, $lte: endDate } }
                }
            ];
            const pipeline = [{ $match: matchCondition }, ...dateFilterPipeline];
            const userTotals = await Tranday.aggregate(pipeline.concat({
                $group: { _id: null, total_bet: { $sum: '$betAmount' }, total_win: { $sum: '$payoutAmount' }}
            })).exec();
            
            const result = { totals: userTotals.length > 0 ? userTotals[0] : { total_bet: 0, total_win: 0 } };
            return res.json(result);
            
        } else {
            // ถ้าไม่มีการส่งช่วงวันที่มา (เรียกจาก Dashboard) ให้ดึงยอด "เฉพาะเดือนปัจจุบัน"
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

            const pipeline = [
                { $match: matchCondition },
                {
                    $addFields: {
                        convertedDate: { $dateFromString: { dateString: '$data', format: '%m/%d/%Y' } }
                    }
                },
                {
                    $match: { convertedDate: { $gte: startOfMonth, $lte: endOfMonth } }
                },
                {
                    $group: {
                        _id: null,
                        total_bet: { $sum: '$betAmount' },
                        total_win: { $sum: '$payoutAmount' }
                    }
                }
            ];
            
            const userTotals = await Tranday.aggregate(pipeline).exec();
            const result = { totals: userTotals.length > 0 ? userTotals[0] : { total_bet: 0, total_win: 0 } };
            return res.json(result);
        }
        // --- END: แก้ไขส่วนนี้ ---

    } catch (error) {
        console.error('Error fetching user totals:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


// **แก้ไข:** API สำหรับดึงประวัติ (ที่ /api/user/history เรียกใช้)
router.get('/api/user/history', isAuthenticated, async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.session.user.id);
        let matchCondition = {
            apikey: userId,
            statusCode: 0
        };

        // ตรวจสอบว่ามีการส่งช่วงวันที่มาหรือไม่
        if (req.query.start && req.query.end) {
            const [month1, day1, year1] = req.query.start.split('/');
            const [month2, day2, year2] = req.query.end.split('/');
            const startDate = new Date(`${year1}-${month1}-${day1}`);
            const endDate = new Date(new Date(`${year2}-${month2}-${day2}`).setHours(23, 59, 59, 999));
            matchCondition.createdDate = { $gte: startDate, $lte: endDate };
        }
        
        const history = await Transaction.find(matchCondition)
            .sort({ createdDate: -1 })
            .limit(500)
            .select('data.username data.productId betAmount payoutAmount createdDate')
            .lean();
        
        res.json({ history: history });

    } catch (error) {
        console.error('Error fetching user history:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// API สำหรับเปลี่ยนรหัสผ่าน (ถูกต้องแล้ว)
router.post('/auth/change-password', isAuthenticated, async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;
        if (newPassword !== confirmPassword) {
            return res.status(400).json({ success: false, message: 'รหัสผ่านใหม่และการยืนยันไม่ตรงกัน' });
        }
        const user = await Api.findById(req.session.user.id);
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
        }
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();
        res.json({ success: true, message: 'เปลี่ยนรหัสผ่านสำเร็จ!' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในระบบ' });
    }
});


// --- START: เพิ่ม Route ที่ขาดหายไป ---
// API อัปเดตข้อมูล API (IP, Callback)
router.post('/api/user/update-api-info', isAuthenticated, async (req, res) => {
    try {
        const { ip, callback, currentPassword } = req.body;
        const user = await Api.findById(req.session.user.id);

        if (!user) {
            return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้งาน' });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
        }

        // อัปเดตข้อมูลและบันทึก
        user.ip = ip;
        user.callback = callback;
        await user.save();

        res.json({ success: true, message: 'อัปเดตข้อมูล API สำเร็จ!' });
    } catch (error) {
        console.error('Update API Info Error:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในระบบ' });
    }
});

router.get('/game-settings', isAuthenticated, async (req, res) => {
    try {
        const user = await Api.findById(req.session.user.id).lean();

        // --- START: แก้ไขส่วนนี้เพื่อแก้ Error ---
        // ตรวจสอบว่า user.gameSettings มีอยู่หรือไม่ หรือเป็น object ว่าง
        // และเปลี่ยนจากการเรียก mongoose.model('Api') มาใช้ตัวแปร Api ที่ import มาแล้ว
        if (!user.gameSettings || Object.keys(user.gameSettings).length === 0) {
            // หากไม่มี ให้ใช้ค่า default จาก schema ของโมเดล Api
            user.gameSettings = Api.schema.path('gameSettings').defaultValue();
        }
        // --- END: แก้ไขส่วนนี้ ---

        res.render('game_settings', { user: user, title: 'ตั้งค่าเกม' });
    } catch (error) {
        console.error('Error fetching user for game settings page:', error);
        res.redirect('/dashboard');
    }
});

// หมายเหตุ: โค้ดส่วนนี้ถูกต้องอยู่แล้ว ไม่จำเป็นต้องแก้ไข
router.post('/api/user/update-game-settings', isAuthenticated, async (req, res) => {
    try {
        const user = await Api.findById(req.session.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้งาน' });
        }

        const settingsData = req.body;
        // ลูปเพื่ออัปเดตค่าและแปลงเป็นตัวเลข
        for (const key in user.gameSettings) {
            if (Object.hasOwnProperty.call(settingsData, key)) {
                user.gameSettings[key] = Number(settingsData[key]);
            }
        }
        
        user.markModified('gameSettings'); // แจ้ง Mongoose ว่ามีการแก้ไข object ซ้อน object
        await user.save();

        res.json({ success: true, message: 'อัปเดตการตั้งค่าเกมสำเร็จ!' });
    } catch (error) {
        console.error('Update Game Settings Error:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในระบบ' });
    }
});

router.get('/api/user/monthly-summary', isAuthenticated, async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.session.user.id);

        // คำนวณวันที่เริ่มต้น (3 เดือนก่อนหน้าเดือนปัจจุบัน)
        const now = new Date();
        const startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);

        const monthlyData = await Tranday.aggregate([
            {
                // แปลงฟิลด์ 'data' (String: "MM/DD/YYYY") ให้เป็น Date Object
                $addFields: {
                    reportDate: { $dateFromString: { dateString: '$data', format: '%m/%d/%Y' } }
                }
            },
            {
                // คัดกรองข้อมูลเฉพาะของ User ที่ login และอยู่ในช่วง 4 เดือนล่าสุด
                $match: {
                    apikey: userId,
                    reportDate: { $gte: startDate }
                }
            },
            {
                // จัดกลุ่มข้อมูลตามปีและเดือน
                $group: {
                    _id: {
                        year: { $year: '$reportDate' },
                        month: { $month: '$reportDate' }
                    },
                    totalBet: { $sum: '$betAmount' },
                    totalWin: { $sum: '$payoutAmount' } // ยอดที่จ่ายให้ผู้เล่น
                }
            },
            {
                // จัดเรียงข้อมูลตามปีและเดือนจากเก่าไปใหม่
                $sort: {
                    '_id.year': 1,
                    '_id.month': 1
                }
            },
            {
                 // จัดรูปแบบผลลัพธ์ใหม่
                $project: {
                    _id: 0,
                    month: { $concat: [ { $toString: "$_id.year" }, "-", { $toString: "$_id.month" } ] },
                    totalBet: "$totalBet",
                    totalWin: "$totalWin",
                    // ยอดได้/เสียของ Agent (Bet - Payout)
                    profit: { $subtract: ["$totalBet", "$totalWin"] }
                }
            }
        ]);
        
        res.json(monthlyData);

    } catch (error) {
        console.error('Error fetching monthly summary:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


router.get('/api/user/report', isAuthenticated, async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.session.user.id);
        const gameImagesMap = await getGameImagesMap();

        let totalsData;
        let transactions;

        // ตรวจสอบว่ามีการส่งช่วงวันที่มาหรือไม่
        if (req.query.start && req.query.end) {
            // กรณีมีการเลือกวันที่: คำนวณยอดรวมจาก Transaction ในช่วงนั้นๆ
            const [month1, day1, year1] = req.query.start.split('/');
            const [month2, day2, year2] = req.query.end.split('/');
            const startDate = new Date(`${year1}-${month1}-${day1}T00:00:00.000Z`);
            const endDate = new Date(`${year2}-${month2}-${day2}T23:59:59.999Z`);
            
            const matchCondition = {
                apikey: userId,
                statusCode: 0,
                createdDate: { $gte: startDate, $lte: endDate }
            };

            transactions = await Transaction.find(matchCondition).sort({ createdDate: -1 }).lean();

            totalsData = transactions.reduce((acc, tx) => {
                acc.total_bet += tx.betAmount;
                acc.total_win += tx.payoutAmount;
                return acc;
            }, { total_bet: 0, total_win: 0 });

        } else {
            // กรณีไม่เลือกวันที่ (โหลดครั้งแรก): ดึงยอดรวมทั้งหมดจาก Tranday เพื่อให้ตรงกับ Dashboard
            const overallTotals = await Tranday.aggregate([
                { $match: { apikey: userId } },
                {
                    $group: {
                        _id: null,
                        total_bet: { $sum: '$betAmount' },
                        total_win: { $sum: '$payoutAmount' }
                    }
                }
            ]).exec();
            
            totalsData = overallTotals.length > 0 ? overallTotals[0] : { total_bet: 0, total_win: 0 };
            
            // และดึงรายการ Transaction ทั้งหมดสำหรับแสดงในตาราง
            transactions = await Transaction.find({ apikey: userId, statusCode: 0 })
                .sort({ createdDate: -1 })
                .lean();
        }

        // คำนวณ User Loss (Win - Bet) ให้เหมือน Dashboard
        const total_loss = totalsData.total_win - totalsData.total_bet;

        // จัดรูปแบบข้อมูลสำหรับตาราง
        const history = transactions.map(tx => {
            const gameInfo = gameImagesMap.get(String(tx.data.gameId)) || { imageUrl: '/img/default-game.png', gameName: tx.data.gameId };
            return {
                createdDate: tx.createdDate,
                username: tx.data.username,
                productId: tx.data.productId,
                gameId: tx.data.gameId,
                gameName: gameInfo.gameName,
                imageUrl: gameInfo.imageUrl,
                betAmount: tx.betAmount,
                payoutAmount: tx.payoutAmount,
                winLoss: tx.payoutAmount - tx.betAmount,
                currency: tx.data.currency || 'N/A',
                transactionId: tx.id,
            };
        });

        // ส่งข้อมูลทั้งหมดกลับไป
        res.json({
            history,
            totals: {
                total_bet: totalsData.total_bet,
                total_win: totalsData.total_win,
                total_loss: total_loss 
            }
        });

    } catch (error) {
        console.error('Error fetching user report:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;