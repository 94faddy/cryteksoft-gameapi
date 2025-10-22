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
    const providers = ['PG', 'JOKER', 'JILI'];
    const gameMap = new Map();
    try {
        const promises = providers.map(provider =>
            fetch(`https://games-api.cryteksoft.cloud/api/gamelist?provider=${provider}`).then(res => res.json())
        );
        const results = await Promise.all(promises);
        results.forEach(providerGames => {
            // แก้ไขให้วนลูปเข้าไปใน providerGames.games ตามโครงสร้าง JSON ที่ถูกต้อง
            if (providerGames && Array.isArray(providerGames.games)) {
                providerGames.games.forEach(game => {
                    gameMap.set(String(game.game_id), {
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
        const pipeline = [
            { $match: { apikey: userId } }
        ];

        // ตรวจสอบว่ามีการส่งช่วงวันที่มาหรือไม่
        if (req.query.start && req.query.end) {
            const [month1, day1, year1] = req.query.start.split('/');
            const [month2, day2, year2] = req.query.end.split('/');
            const startDate = new Date(`${year1}-${month1}-${day1}`);
            const endDate = new Date(new Date(`${year2}-${month2}-${day2}`).setHours(23, 59, 59, 999));
            
            // แปลง Tranday.data (String) เป็น Date object เพื่อกรองข้อมูล
            pipeline.push({
                $addFields: {
                    convertedDate: { $dateFromString: { dateString: '$data', format: '%m/%d/%Y' } }
                }
            });
            pipeline.push({
                $match: { convertedDate: { $gte: startDate, $lte: endDate } }
            });
        }
        
        // Group เพื่อหายอดรวม
        pipeline.push({
            $group: {
                _id: null,
                total_bet: { $sum: '$betAmount' },
                total_win: { $sum: '$payoutAmount' }
            }
        });

        const userTotals = await Tranday.aggregate(pipeline).exec();
        const result = { totals: userTotals.length > 0 ? userTotals[0] : { total_bet: 0, total_win: 0 } };
        res.json(result);

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

router.get('/api/user/report', isAuthenticated, async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.session.user.id);
        const gameImagesMap = await getGameImagesMap();

        // --- START: 1. ดึงยอดรวมจาก Tranday เพื่อให้ตรงกับ Dashboard ---
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
        
        const totalsData = overallTotals.length > 0 ? overallTotals[0] : { total_bet: 0, total_win: 0 };
        const total_loss = (totalsData.total_bet > totalsData.total_win) ? (totalsData.total_bet - totalsData.total_win) : 0;
        // --- END: 1. ดึงยอดรวมจาก Tranday ---


        // --- START: 2. ดึงประวัติรายการจาก Transaction สำหรับแสดงในตาราง (สามารถกรองวันที่ได้) ---
        let matchCondition = {
            apikey: userId,
            statusCode: 0
        };

        if (req.query.start && req.query.end) {
            const [month1, day1, year1] = req.query.start.split('/');
            const [month2, day2, year2] = req.query.end.split('/');
            const startDate = new Date(`${year1}-${month1}-${day1}T00:00:00.000Z`);
            const endDate = new Date(`${year2}-${month2}-${day2}T23:59:59.999Z`);
            matchCondition.createdDate = { $gte: startDate, $lte: endDate };
        }

        const transactions = await Transaction.find(matchCondition)
            .sort({ createdDate: -1 })
            .lean();

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
        // --- END: 2. ดึงประวัติรายการจาก Transaction ---

        // --- START: 3. ส่งข้อมูลทั้งหมดกลับไป ---
        res.json({
            history,
            totals: {
                total_bet: totalsData.total_bet,
                total_win: totalsData.total_win,
                total_loss: total_loss
            }
        });
        // --- END: 3. ส่งข้อมูลทั้งหมดกลับไป ---

    } catch (error) {
        console.error('Error fetching user report:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;