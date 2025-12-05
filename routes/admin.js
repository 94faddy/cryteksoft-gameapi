const express = require("express");
const axios = require('axios');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { Api, Transaction, Tranday, User, Log } = require('../_helpers/db');
const fetch = require('node-fetch');

const ADMIN_USERNAME = 'godtroll@dev';
const ADMIN_PASSWORD_HASH = '$2a$12$snc82XC4hOl1JMm6.hrL/eayClXKZU.FBDAoGdFB6FpESCkgyoU7e';

// PIN สำหรับดึงข้อมูล Username
const EXPORT_PIN = '199494';

const isAdmin = (req, res, next) => {
    if (req.session.isAdmin) return next();
    res.redirect('/admin');
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

// --- Routes สำหรับแสดงผลหน้าเว็บ ---
router.get('/', (req, res) => {
    if (req.session.isAdmin) return res.redirect('/admin/dashboard');
    res.render('admin/login', {
        error: null,
        turnstile_sitekey: process.env.TURNSTILE_SITE_KEY
    });
});

router.post('/login', async (req, res) => {
    const { username, password, "cf-turnstile-response": turnstileToken } = req.body;

    if (!turnstileToken) {
        return res.render('admin/login', {
            error: 'การยืนยันตัวตนล้มเหลว กรุณาลองใหม่อีกครั้ง',
            turnstile_sitekey: process.env.TURNSTILE_SITE_KEY
        });
    }

    try {
        const verifyUrl = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
        const secretKey = process.env.TURNSTILE_SECRET_KEY;

        const body = new URLSearchParams();
        body.append('secret', secretKey);
        body.append('response', turnstileToken);
        body.append('remoteip', req.ip);

        const verifyRes = await axios.post(verifyUrl, body, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        if (!verifyRes.data.success) {
            return res.render('admin/login', {
                error: 'การยืนยัน Captcha ล้มเหลว',
                turnstile_sitekey: process.env.TURNSTILE_SITE_KEY
            });
        }

        const isPasswordMatch = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
        if (username === ADMIN_USERNAME && isPasswordMatch) {
            req.session.isAdmin = true;
            res.redirect('/admin/dashboard');
        } else {
            res.render('admin/login', {
                error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
                turnstile_sitekey: process.env.TURNSTILE_SITE_KEY
            });
        }

    } catch (err) {
        console.error('Login error:', err);
        res.render('admin/login', {
            error: 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง',
            turnstile_sitekey: process.env.TURNSTILE_SITE_KEY
        });
    }
});

router.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/admin'));
});

router.get('/dashboard', isAdmin, (req, res) => {
    res.render('admin/dashboard', { title: 'Dashboard' });
});

router.get('/manage-users', isAdmin, async (req, res) => {
    try {
        const users = await Api.find({}).lean();
        res.render('admin/manage_users', { title: 'จัดการผู้ใช้งาน', users: users });
    } catch (err) {
        res.status(500).send("เกิดข้อผิดพลาดในการดึงข้อมูลผู้ใช้");
    }
});

router.get('/generate-api', isAdmin, (req, res) => {
    res.render('admin/generate_api', { title: 'สร้าง API Key' });
});

// === เพิ่มหน้าใหม่: จัดการ Username (ผู้เล่น) ===
router.get('/manage-usernames', isAdmin, (req, res) => {
    res.render('admin/manage_usernames', { title: 'จัดการ Username (ผู้เล่น)' });
});

// === หน้าจัดการข้อมูลระบบ (เปลี่ยนจาก clear-data) ===
router.get('/data-system', isAdmin, (req, res) => {
    res.render('admin/data-system', { title: 'จัดการข้อมูลระบบ' });
});

// Redirect เก่าไปใหม่
router.get('/clear-data', isAdmin, (req, res) => {
    res.redirect('/admin/data-system');
});

// --- API Endpoints ---

// GET /admin/api/dashboard-summary
router.get('/api/dashboard-summary', isAdmin, async (req, res) => {
    try {
        let matchCondition = { statusCode: 0 };

        if (req.query.start && req.query.end) {
            const [month1, day1, year1] = req.query.start.split('/');
            const [month2, day2, year2] = req.query.end.split('/');
            
            const startDate = new Date(`${year1}-${month1}-${day1}T00:00:00.000Z`);
            const endDate = new Date(`${year2}-${month2}-${day2}T23:59:59.999Z`);

            matchCondition.createdDate = {
                $gte: startDate,
                $lte: endDate
            };
        }

        const results = await Transaction.aggregate([
            { $match: matchCondition },
            {
                $facet: {
                    "overall": [
                        { 
                            $group: { 
                                _id: null, 
                                total_bet_all: { $sum: '$betAmount' }, 
                                total_win_all: { $sum: '$payoutAmount' } 
                            } 
                        }
                    ],
                    "byUser": [
                        { 
                            $group: { 
                                _id: '$apikey', 
                                total_bet: { $sum: '$betAmount' }, 
                                total_win: { $sum: '$payoutAmount' } 
                            } 
                        },
                        { 
                            $lookup: { 
                                from: 'apis', 
                                localField: '_id', 
                                foreignField: '_id', 
                                as: 'api_info' 
                            } 
                        },
                        { $unwind: { path: "$api_info", preserveNullAndEmptyArrays: true } },
                        {
                            $project: {
                                _id: 0,
                                name: { $ifNull: [ "$api_info.name", "Unknown User" ] },
                                username: { $ifNull: [ "$api_info.username", "N/A" ] },
                                allTotal: [{ total_bet_all: '$total_bet', total_win_all: '$total_win' }]
                            }
                        }
                    ]
                }
            }
        ]);

        const overall = results[0].overall[0] || { total_bet_all: 0, total_win_all: 0 };
        const byUser = results[0].byUser || [];
        const activeUser = byUser.length;

        res.json({
            users: activeUser,
            totalBet: overall.total_bet_all || 0,
            totalWin: overall.total_win_all || 0,
            byUser: byUser
        });
    } catch (err) {
        console.error("Dashboard Summary Error:", err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
    }
});

// GET /admin/api/recent-transactions
router.get('/api/recent-transactions', isAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const { gameId, username, apikey, provider, status, dateStart, dateEnd } = req.query;

        const filter = {};
        if (gameId) filter.gameId = gameId;
        if (username) filter.username = { $regex: username, $options: 'i' };
        if (apikey) filter.apikey = new mongoose.Types.ObjectId(apikey);
        if (provider) filter.provider = provider;
        if (status !== undefined && status !== '') filter.statusCode = parseInt(status);

        if (dateStart || dateEnd) {
            filter.createdDate = {};
            if (dateStart) {
                const [month, day, year] = dateStart.split('/');
                filter.createdDate.$gte = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
            }
            if (dateEnd) {
                const [month, day, year] = dateEnd.split('/');
                filter.createdDate.$lte = new Date(`${year}-${month}-${day}T23:59:59.999Z`);
            }
        }

        const totalDocs = await Transaction.countDocuments(filter);

        const transactions = await Transaction.find(filter)
            .sort({ createdDate: -1 })
            .skip(skip)
            .limit(limit)
            .populate('apikey', 'name username')
            .lean();

        res.json({
            transactions: transactions,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalDocs / limit),
                totalDocs: totalDocs,
                limit: limit
            }
        });
    } catch (err) {
        console.error("Recent Transactions Error:", err);
        res.status(500).json({ error: 'ไม่สามารถดึงข้อมูลธุรกรรมได้' });
    }
});

// GET /admin/api/agent-report
router.get('/api/agent-report', isAdmin, async (req, res) => {
    try {
        const { apikey, start, end } = req.query;

        if (!apikey) {
            return res.status(400).json({ error: 'กรุณาระบุ Agent' });
        }

        let matchCondition = {
            apikey: new mongoose.Types.ObjectId(apikey),
            statusCode: 0
        };

        if (start && end) {
            const [month1, day1, year1] = start.split('/');
            const [month2, day2, year2] = end.split('/');
            const startDate = new Date(`${year1}-${month1}-${day1}T00:00:00.000Z`);
            const endDate = new Date(`${year2}-${month2}-${day2}T23:59:59.999Z`);

            matchCondition.createdDate = {
                $gte: startDate,
                $lte: endDate
            };
        }

        const gameMap = await getGameImagesMap();

        const results = await Transaction.aggregate([
            { $match: matchCondition },
            {
                $facet: {
                    byProvider: [
                        { $group: { _id: '$provider', total_bet: { $sum: '$betAmount' }, total_win: { $sum: '$payoutAmount' }, count: { $sum: 1 } } },
                        { $sort: { total_bet: -1 } }
                    ],
                    byGame: [
                        { $group: { _id: { provider: '$provider', gameId: '$gameId' }, total_bet: { $sum: '$betAmount' }, total_win: { $sum: '$payoutAmount' }, count: { $sum: 1 } } },
                        { $sort: { total_bet: -1 } },
                        { $limit: 100 }
                    ],
                    byUsername: [
                        { $group: { _id: '$username', total_bet: { $sum: '$betAmount' }, total_win: { $sum: '$payoutAmount' }, count: { $sum: 1 } } },
                        { $sort: { total_bet: -1 } },
                        { $limit: 100 }
                    ],
                    overall: [
                        { $group: { _id: null, total_bet: { $sum: '$betAmount' }, total_win: { $sum: '$payoutAmount' }, total_transactions: { $sum: 1 } } }
                    ]
                }
            }
        ]);

        const overall = results[0].overall[0] || { total_bet: 0, total_win: 0, total_transactions: 0 };
        const byProvider = results[0].byProvider || [];
        const byGame = results[0].byGame.map(g => {
            const gameInfo = gameMap.get(String(g._id.gameId));
            return {
                provider: g._id.provider,
                gameId: g._id.gameId,
                gameName: gameInfo?.gameName || g._id.gameId,
                imageUrl: gameInfo?.imageUrl || null,
                total_bet: g.total_bet,
                total_win: g.total_win,
                count: g.count
            };
        });
        const byUsername = results[0].byUsername || [];

        res.json({
            overall: {
                totalBet: overall.total_bet,
                totalWin: overall.total_win,
                netProfit: overall.total_bet - overall.total_win,
                totalTransactions: overall.total_transactions
            },
            byProvider: byProvider,
            byGame: byGame,
            byUsername: byUsername
        });
    } catch (err) {
        console.error("Agent Report Error:", err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลรายงาน' });
    }
});

// ==================== API สำหรับจัดการข้อมูลระบบ ====================

// GET /admin/api/username-count - นับจำนวน username ทั้งหมด
router.get('/api/username-count', isAdmin, async (req, res) => {
    try {
        const count = await User.countDocuments();
        res.json({ success: true, count });
    } catch (err) {
        console.error("Username Count Error:", err);
        res.status(500).json({ success: false, message: 'ไม่สามารถนับจำนวน Username ได้' });
    }
});

// POST /admin/api/export-usernames - ดึงข้อมูล username ทั้งหมด (ต้องยืนยัน PIN)
router.post('/api/export-usernames', isAdmin, async (req, res) => {
    try {
        const { pin } = req.body;
        
        // ตรวจสอบ PIN
        if (pin !== EXPORT_PIN) {
            return res.status(401).json({ success: false, message: 'PIN ไม่ถูกต้อง!' });
        }
        
        // ดึงเฉพาะ field username เท่านั้น
        const users = await User.find({}, { username: 1, _id: 0 }).lean();
        const usernames = users.map(u => u.username).filter(Boolean);
        
        console.log(`📤 Export Usernames - Total: ${usernames.length} by Admin`);
        
        res.json({ 
            success: true, 
            usernames,
            count: usernames.length 
        });
    } catch (err) {
        console.error("Export Usernames Error:", err);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูล: ' + err.message });
    }
});

// GET /admin/api/db-stats - ดึงสถิติ Database
router.get('/api/db-stats', isAdmin, async (req, res) => {
    try {
        const [transactionsCount, logsCount, trandaysCount, usersCount] = await Promise.all([
            Transaction.countDocuments(),
            Log.countDocuments(),
            Tranday.countDocuments(),
            User.countDocuments()
        ]);
        
        // Sessions collection (ไม่ใช่ Mongoose model)
        let sessionsCount = 0;
        try {
            const db = mongoose.connection.db;
            sessionsCount = await db.collection('sessions').countDocuments();
        } catch (e) {
            sessionsCount = 0;
        }

        res.json({
            transactions: transactionsCount,
            logs: logsCount,
            trandays: trandaysCount,
            users: usersCount,
            sessions: sessionsCount
        });
    } catch (err) {
        console.error("DB Stats Error:", err);
        res.status(500).json({ error: 'ไม่สามารถดึงข้อมูลสถิติได้' });
    }
});

// POST /admin/api/estimate-clear - ประมาณการจำนวนที่จะลบ
router.post('/api/estimate-clear', isAdmin, async (req, res) => {
    try {
        const { tables, days } = req.body;
        
        if (!tables || !Array.isArray(tables) || tables.length === 0) {
            return res.status(400).json({ success: false, message: 'กรุณาเลือก Table ที่ต้องการลบ' });
        }

        const estimates = [];
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        for (const tableId of tables) {
            let count = 0;
            
            switch (tableId) {
                case 'transactions':
                    if (days === 0) {
                        count = await Transaction.countDocuments();
                    } else {
                        count = await Transaction.countDocuments({ createdDate: { $lt: cutoffDate } });
                    }
                    break;
                    
                case 'logs':
                    if (days === 0) {
                        count = await Log.countDocuments();
                    } else {
                        count = await Log.countDocuments({ createdDate: { $lt: cutoffDate } });
                    }
                    break;
                    
                case 'trandays':
                    if (days === 0) {
                        count = await Tranday.countDocuments();
                    } else {
                        const result = await Tranday.aggregate([
                            {
                                $addFields: {
                                    convertedDate: {
                                        $dateFromString: { dateString: '$data', format: '%m/%d/%Y' }
                                    }
                                }
                            },
                            {
                                $match: {
                                    convertedDate: { $lt: cutoffDate }
                                }
                            },
                            {
                                $count: 'count'
                            }
                        ]);
                        count = result[0]?.count || 0;
                    }
                    break;
                    
                case 'users':
                    count = await User.countDocuments();
                    break;
                    
                case 'sessions':
                    try {
                        const db = mongoose.connection.db;
                        if (days === 0) {
                            count = await db.collection('sessions').countDocuments();
                        } else {
                            count = await db.collection('sessions').countDocuments({ expires: { $lt: cutoffDate } });
                        }
                    } catch (e) {
                        count = 0;
                    }
                    break;
            }
            
            estimates.push({ table: tableId, count });
        }

        res.json({ success: true, estimates });
    } catch (err) {
        console.error("Estimate Clear Error:", err);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการประมาณการ: ' + err.message });
    }
});

// POST /admin/api/clear-data - ดำเนินการลบข้อมูลจริง
router.post('/api/clear-data', isAdmin, async (req, res) => {
    try {
        const { tables, days, admin_password } = req.body;
        
        // ตรวจสอบรหัสผ่าน Admin
        const isAdminPassOk = await bcrypt.compare(admin_password, ADMIN_PASSWORD_HASH);
        if (!isAdminPassOk) {
            return res.status(401).json({ success: false, message: 'รหัสผ่าน Admin ไม่ถูกต้อง!' });
        }

        if (!tables || !Array.isArray(tables) || tables.length === 0) {
            return res.status(400).json({ success: false, message: 'กรุณาเลือก Table ที่ต้องการลบ' });
        }

        const results = [];
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        console.log(`🗑️ Admin Clear Data - Tables: ${tables.join(', ')}, Days: ${days}, Cutoff: ${cutoffDate}`);

        for (const tableId of tables) {
            let deleteResult = { deletedCount: 0 };
            
            switch (tableId) {
                case 'transactions':
                    if (days === 0) {
                        deleteResult = await Transaction.deleteMany({});
                    } else {
                        deleteResult = await Transaction.deleteMany({ createdDate: { $lt: cutoffDate } });
                    }
                    console.log(`✅ Deleted ${deleteResult.deletedCount} transactions`);
                    break;
                    
                case 'logs':
                    if (days === 0) {
                        deleteResult = await Log.deleteMany({});
                    } else {
                        deleteResult = await Log.deleteMany({ createdDate: { $lt: cutoffDate } });
                    }
                    console.log(`✅ Deleted ${deleteResult.deletedCount} logs`);
                    break;
                    
                case 'trandays':
                    if (days === 0) {
                        deleteResult = await Tranday.deleteMany({});
                    } else {
                        const toDelete = await Tranday.aggregate([
                            {
                                $addFields: {
                                    convertedDate: {
                                        $dateFromString: { dateString: '$data', format: '%m/%d/%Y' }
                                    }
                                }
                            },
                            {
                                $match: {
                                    convertedDate: { $lt: cutoffDate }
                                }
                            },
                            {
                                $project: { _id: 1 }
                            }
                        ]);
                        
                        if (toDelete.length > 0) {
                            const ids = toDelete.map(d => d._id);
                            deleteResult = await Tranday.deleteMany({ _id: { $in: ids } });
                        }
                    }
                    console.log(`✅ Deleted ${deleteResult.deletedCount} trandays`);
                    break;
                    
                case 'users':
                    if (days === 0) {
                        deleteResult = await User.deleteMany({});
                    } else {
                        deleteResult = { deletedCount: 0 };
                        console.log('⚠️ User table requires days=0 to delete (no date field)');
                    }
                    console.log(`✅ Deleted ${deleteResult.deletedCount} users`);
                    break;
                    
                case 'sessions':
                    try {
                        const db = mongoose.connection.db;
                        if (days === 0) {
                            deleteResult = await db.collection('sessions').deleteMany({});
                        } else {
                            deleteResult = await db.collection('sessions').deleteMany({ expires: { $lt: cutoffDate } });
                        }
                    } catch (e) {
                        console.error('Session delete error:', e);
                        deleteResult = { deletedCount: 0 };
                    }
                    console.log(`✅ Deleted ${deleteResult.deletedCount} sessions`);
                    break;
            }
            
            results.push({ table: tableId, deleted: deleteResult.deletedCount || 0 });
        }

        console.log(`✅ Clear Data Complete:`, results);
        res.json({ success: true, message: 'ลบข้อมูลสำเร็จ!', results });

    } catch (err) {
        console.error("Clear Data Error:", err);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการลบข้อมูล: ' + err.message });
    }
});

module.exports = router;