const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { Api, Tranday, Transaction, User } = require('../_helpers/db');
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
                    const key = game.provider === 'JILI' ? String(game.game_code) : String(game.game_id);
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

// --- Routes แสดงผลหน้าเว็บ ---
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

router.get('/report', isAuthenticated, async (req, res) => {
    const user = await Api.findById(req.session.user.id).lean();
    res.render('report', { user: user, title: 'รายงาน' });
});

// === เพิ่มหน้าใหม่: User History (ประวัติผู้เล่นแบบละเอียด) ===
router.get('/user-history', isAuthenticated, async (req, res) => {
    const user = await Api.findById(req.session.user.id).lean();
    res.render('user_history', { user: user, title: 'ประวัติผู้เล่น' });
});

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

// --- API Endpoints ---

router.get('/api/user/totals', isAuthenticated, async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.session.user.id);
        let matchCondition = { apikey: userId };

        if (req.query.start && req.query.end) {
            const [month1, day1, year1] = req.query.start.split('/');
            const [month2, day2, year2] = req.query.end.split('/');
            const startDate = new Date(`${year1}-${month1}-${day1}`);
            const endDate = new Date(new Date(`${year2}-${month2}-${day2}`).setHours(23, 59, 59, 999));
            
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

    } catch (error) {
        console.error('Error fetching user totals:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.get('/api/user/history', isAuthenticated, async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.session.user.id);
        let matchCondition = {
            apikey: userId,
            statusCode: 0
        };

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

        if (!user.gameSettings || Object.keys(user.gameSettings).length === 0) {
            user.gameSettings = Api.schema.path('gameSettings').defaultValue();
        }

        res.render('game_settings', { user: user, title: 'ตั้งค่าเกม' });
    } catch (error) {
        console.error('Error fetching user for game settings page:', error);
        res.redirect('/dashboard');
    }
});

router.post('/api/user/update-game-settings', isAuthenticated, async (req, res) => {
    try {
        const user = await Api.findById(req.session.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้งาน' });
        }

        const settingsData = req.body;
        for (const key in user.gameSettings) {
            if (Object.hasOwnProperty.call(settingsData, key)) {
                user.gameSettings[key] = Number(settingsData[key]);
            }
        }
        
        user.markModified('gameSettings');
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
        const now = new Date();
        const startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);

        const monthlyData = await Tranday.aggregate([
            {
                $addFields: {
                    reportDate: { $dateFromString: { dateString: '$data', format: '%m/%d/%Y' } }
                }
            },
            {
                $match: {
                    apikey: userId,
                    reportDate: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$reportDate' },
                        month: { $month: '$reportDate' }
                    },
                    totalBet: { $sum: '$betAmount' },
                    totalWin: { $sum: '$payoutAmount' }
                }
            },
            {
                $sort: {
                    '_id.year': 1,
                    '_id.month': 1
                }
            },
            {
                $project: {
                    _id: 0,
                    month: { $concat: [ { $toString: "$_id.year" }, "-", { $toString: "$_id.month" } ] },
                    totalBet: "$totalBet",
                    totalWin: "$totalWin",
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

        if (req.query.start && req.query.end) {
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
            
            transactions = await Transaction.find({ apikey: userId, statusCode: 0 })
                .sort({ createdDate: -1 })
                .lean();
        }

        const total_loss = totalsData.total_win - totalsData.total_bet;

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

// ===================================================================
// === API ใหม่สำหรับ User History (ประวัติผู้เล่นแบบละเอียด) ===
// ===================================================================

// GET /api/user/all-players - ดึงรายชื่อ Username ทั้งหมดของ Agent
router.get('/api/user/all-players', isAuthenticated, async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.session.user.id);
        const { start, end } = req.query;
        
        let matchCondition = { 
            apikey: userId,
            statusCode: 0 
        };
        
        // กรองตามวันที่ถ้ามีการเลือก
        if (start && end) {
            const [month1, day1, year1] = start.split('/');
            const [month2, day2, year2] = end.split('/');
            const startDate = new Date(`${year1}-${month1}-${day1}T00:00:00.000Z`);
            const endDate = new Date(`${year2}-${month2}-${day2}T23:59:59.999Z`);
            matchCondition.createdDate = { $gte: startDate, $lte: endDate };
        }

        const players = await Transaction.aggregate([
            { $match: matchCondition },
            {
                $group: {
                    _id: '$data.username',
                    totalBet: { $sum: '$betAmount' },
                    totalWin: { $sum: '$payoutAmount' },
                    totalGames: { $sum: 1 },
                    lastPlayed: { $max: '$createdDate' }
                }
            },
            {
                $project: {
                    _id: 0,
                    username: '$_id',
                    totalBet: 1,
                    totalWin: 1,
                    totalGames: 1,
                    winLoss: { $subtract: ['$totalWin', '$totalBet'] },
                    lastPlayed: 1
                }
            },
            { $sort: { totalBet: -1 } }
        ]);

        res.json({ success: true, players });

    } catch (err) {
        console.error("Get All Players Error:", err);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
    }
});

// GET /api/user/player-detail/:username - ดึงประวัติการเล่นของ Username (อัพเดทเพื่อเพิ่มรูปภาพ)
router.get('/api/user/player-detail/:username', isAuthenticated, async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.session.user.id);
        const { username } = req.params;
        const { start, end, startTime, endTime } = req.query;

        let matchCondition = {
            apikey: userId,
            'data.username': username,
            statusCode: 0
        };

        // กรองตามวันที่และเวลา
        if (start && end) {
            const [month1, day1, year1] = start.split('/');
            const [month2, day2, year2] = end.split('/');
            
            let startDate = new Date(`${year1}-${month1}-${day1}T00:00:00.000Z`);
            let endDate = new Date(`${year2}-${month2}-${day2}T23:59:59.999Z`);

            // ถ้ามีการระบุเวลา
            if (startTime) {
                const [startHour, startMinute] = startTime.split(':');
                startDate = new Date(`${year1}-${month1}-${day1}T${startHour}:${startMinute}:00.000Z`);
            }
            
            if (endTime) {
                const [endHour, endMinute] = endTime.split(':');
                endDate = new Date(`${year2}-${month2}-${day2}T${endHour}:${endMinute}:59.999Z`);
            }

            matchCondition.createdDate = { $gte: startDate, $lte: endDate };
        }

        const transactions = await Transaction.find(matchCondition)
            .sort({ createdDate: -1 })
            .limit(1000)
            .lean();

        // ดึงข้อมูลรูปภาพเกม
        const gameImagesMap = await getGameImagesMap();

        // คำนวณสถิติรวม
        const summary = transactions.reduce((acc, tx) => {
            acc.totalBet += tx.betAmount;
            acc.totalWin += tx.payoutAmount;
            acc.totalGames += 1;
            return acc;
        }, { totalBet: 0, totalWin: 0, totalGames: 0 });

        summary.winLoss = summary.totalWin - summary.totalBet;

        // แมปข้อมูลพร้อมรูปภาพเกม
        const history = transactions.map(tx => {
            const gameInfo = gameImagesMap.get(String(tx.data.gameId)) || { 
                imageUrl: '/img/default-game.png', 
                gameName: tx.data.gameId 
            };
            
            return {
                transactionId: tx.id,
                gameId: tx.data.gameId,
                gameName: gameInfo.gameName,
                imageUrl: gameInfo.imageUrl,
                productId: tx.data.productId,
                betAmount: tx.betAmount,
                payoutAmount: tx.payoutAmount,
                winLoss: tx.payoutAmount - tx.betAmount,
                currency: tx.data.currency || 'N/A',
                createdDate: tx.createdDate
            };
        });

        res.json({ 
            success: true, 
            summary,
            history 
        });

    } catch (err) {
        console.error("Get Player Detail Error:", err);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
    }
});

// ===================================================================
// ✅ API สำหรับจัดการ User Game Settings (Per-User) - แก้ไขแล้ว
// ===================================================================

// GET /api/user/player-settings/:username - ดึง Settings ของ Player
router.get('/api/user/player-settings/:username', isAuthenticated, async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.session.user.id);
        const { username } = req.params;

        console.log('📥 Fetching settings for username:', username);
        console.log('📌 Agent ID:', userId);

        // ค้นหา User ที่ตรงกับ username และ apikey
        const player = await User.findOne({
            username: username,
            apikey: userId
        }).lean();

        if (!player) {
            console.log('❌ Player not found');
            return res.status(404).json({ 
                success: false, 
                message: 'ไม่พบผู้เล่นนี้ในระบบ' 
            });
        }

        console.log('✅ Player found:', player.username);
        console.log('📌 useAgentSettings:', player.useAgentSettings);
        console.log('📌 Has custom gameSettings:', Object.keys(player.gameSettings || {}).length > 0);

        // ✅ ตรวจสอบว่าใช้ settings ของ Agent หรือไม่
        // Default: useAgentSettings = true
        const useAgentSettings = player.useAgentSettings !== false; // undefined หรือ true = ใช้ของ Agent

        if (useAgentSettings) {
            console.log('✅ Using Agent Settings (default)');
            const agent = await Api.findById(userId).lean();
            return res.json({
                success: true,
                useAgentSettings: true,
                settings: agent.gameSettings || {}
            });
        }

        // ถ้าใช้ custom settings
        console.log('✅ Using Custom User Settings');
        res.json({
            success: true,
            useAgentSettings: false,
            settings: player.gameSettings || {}
        });

    } catch (err) {
        console.error("❌ Get Player Settings Error:", err);
        res.status(500).json({ 
            success: false, 
            message: 'เกิดข้อผิดพลาดในการดึงข้อมูล: ' + err.message 
        });
    }
});

// POST /api/user/update-player-settings - อัพเดท Settings ของ Player
router.post('/api/user/update-player-settings', isAuthenticated, async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.session.user.id);
        const { username, useAgentSettings, ...settingsData } = req.body;

        console.log('📥 Updating settings for username:', username);
        console.log('📌 useAgentSettings:', useAgentSettings);
        console.log('📌 Settings data keys:', Object.keys(settingsData));

        // ค้นหา User
        const player = await User.findOne({
            username: username,
            apikey: userId
        });

        if (!player) {
            console.log('❌ Player not found');
            return res.status(404).json({ 
                success: false, 
                message: 'ไม่พบผู้เล่นนี้ในระบบ' 
            });
        }

        console.log('✅ Player found:', player.username);

        // ✅ อัพเดท useAgentSettings (แปลงเป็น Boolean ให้แน่ใจ)
        const newUseAgentSettings = useAgentSettings === true || useAgentSettings === 'true';
        player.useAgentSettings = newUseAgentSettings;

        console.log('📌 New useAgentSettings value:', player.useAgentSettings);

        // ✅ ถ้าไม่ใช้ Agent Settings, อัพเดท custom settings
        if (!player.useAgentSettings) {
            console.log('✅ Updating custom settings...');
            
            const allowedKeys = [
                'normal-spin', 'less-bet', 'less-bet-from', 'less-bet-to',
                'more-bet', 'more-bet-from', 'more-bet-to', 'freespin-less-bet',
                'freespin-less-bet-from', 'freespin-less-bet-to', 'freespin-more-bet',
                'freespin-more-bet-from', 'freespin-more-bet-to', 'buy-feature-less-bet',
                'buy-feature-less-bet-from', 'buy-feature-less-bet-to', 'buy-feature-more-bet',
                'buy-feature-more-bet-from', 'buy-feature-more-bet-to'
            ];

            allowedKeys.forEach(key => {
                if (settingsData[key] !== undefined) {
                    const value = Number(settingsData[key]);
                    player.gameSettings[key] = value;
                    console.log(`  ✓ ${key}: ${value}`);
                }
            });

            player.markModified('gameSettings');
        } else {
            console.log('✅ Using Agent Settings - no custom settings saved');
        }

        await player.save();
        console.log('✅ Settings saved successfully');

        res.json({ 
            success: true, 
            message: 'อัปเดตการตั้งค่าเกมสำเร็จ!' 
        });

    } catch (err) {
        console.error("❌ Update Player Settings Error:", err);
        res.status(500).json({ 
            success: false, 
            message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล: ' + err.message 
        });
    }
});

module.exports = router;