const express = require("express");
const axios = require('axios');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { Api, Transaction, Tranday, User } = require('../_helpers/db');
const fetch = require('node-fetch');

const ADMIN_USERNAME = 'godtroll@dev';
const ADMIN_PASSWORD_HASH = '$2a$12$snc82XC4hOl1JMm6.hrL/eayClXKZU.FBDAoGdFB6FpESCkgyoU7e';

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

// --- API Endpoints ---

// GET /admin/api/dashboard-summary
// ✅ แก้ไข: ใช้ Transaction collection แทน Tranday เพื่อให้ตรงกับ Agent Report
router.get('/api/dashboard-summary', isAdmin, async (req, res) => {
    try {
        // ✅ เริ่มต้นด้วย match condition พื้นฐาน (statusCode: 0 = สำเร็จ)
        let matchCondition = { statusCode: 0 };

        // ✅ ถ้ามีการเลือกช่วงวันที่
        if (req.query.start && req.query.end) {
            const [month1, day1, year1] = req.query.start.split('/');
            const [month2, day2, year2] = req.query.end.split('/');
            
            // ✅ ใช้รูปแบบเดียวกันกับ Agent Report (UTC timezone)
            const startDate = new Date(`${year1}-${month1}-${day1}T00:00:00.000Z`);
            const endDate = new Date(`${year2}-${month2}-${day2}T23:59:59.999Z`);

            matchCondition.createdDate = {
                $gte: startDate,
                $lte: endDate
            };
        }

        // ✅ ใช้ Transaction collection แทน Tranday
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

        res.json({
            overall: results[0].overall[0] || { total_bet_all: 0, total_win_all: 0 },
            usersSummary: results[0].byUser
        });

    } catch (err) {
        console.error("Dashboard Summary Error:", err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /admin/api/create-user
router.post('/api/create-user', isAdmin, async (req, res) => {
    try {
        const { name, username, password, ip, callback } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        await new Api({ name, username, password: hashedPassword, ip, callback, secret: crypto.randomUUID(), apikey: crypto.randomBytes(16).toString('hex') }).save();
        res.json({ success: true, message: 'สร้างผู้ใช้งานสำเร็จ!' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด: ไม่สามารถสร้างผู้ใช้ได้' });
    }
});

// POST /admin/api/update-user
router.post('/api/update-user', isAdmin, async (req, res) => {
    try {
        const { userId, name, username, ip, callback, new_password, admin_password } = req.body;
        const isAdminPassOk = await bcrypt.compare(admin_password, ADMIN_PASSWORD_HASH);
        if (!isAdminPassOk) {
            return res.status(401).json({ success: false, message: 'รหัสผ่าน Admin ไม่ถูกต้อง!' });
        }
        const updateData = { name, username, ip, callback };
        if (new_password) {
            updateData.password = await bcrypt.hash(new_password, 10);
        }
        await Api.findByIdAndUpdate(userId, updateData);
        res.json({ success: true, message: 'อัปเดตข้อมูลสำเร็จ!' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการอัปเดตข้อมูล' });
    }
});

// POST /admin/api/delete-user
router.post('/api/delete-user', isAdmin, async (req, res) => {
    try {
        const { userId, admin_password } = req.body;
        const isAdminPassOk = await bcrypt.compare(admin_password, ADMIN_PASSWORD_HASH);
        if (!isAdminPassOk) {
            return res.status(401).json({ success: false, message: 'รหัสผ่าน Admin ไม่ถูกต้อง!' });
        }
        await Api.findByIdAndDelete(userId);
        res.json({ success: true, message: 'ลบผู้ใช้งานสำเร็จ!' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการลบผู้ใช้' });
    }
});

// GET /admin/api/get-user-settings/:userId
router.get('/api/get-user-settings/:userId', isAdmin, async (req, res) => {
    try {
        const user = await Api.findById(req.params.userId).select('gameSettings').lean();
        if (!user) {
            return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้งาน' });
        }
        res.json({ success: true, settings: user.gameSettings || {} });
    } catch (err) {
        console.error("Get User Settings Error:", err);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
    }
});

// POST /admin/api/update-user-settings
router.post('/api/update-user-settings', isAdmin, async (req, res) => {
    try {
        const { userId, admin_password, ...settingsData } = req.body;

        const isAdminPassOk = await bcrypt.compare(admin_password, ADMIN_PASSWORD_HASH);
        if (!isAdminPassOk) {
            return res.status(401).json({ success: false, message: 'รหัสผ่าน Admin ไม่ถูกต้อง!' });
        }

        const user = await Api.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้งาน' });
        }

        const newSettings = {};
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
                newSettings[key] = Number(settingsData[key]);
            }
        });
        
        user.gameSettings = newSettings;
        user.markModified('gameSettings');
        await user.save();

        res.json({ success: true, message: 'อัปเดตการตั้งค่าเกมสำเร็จ!' });

    } catch (err) {
        console.error("Update Game Settings Error:", err);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
    }
});

// ===================================================================
// === API Endpoints ใหม่สำหรับ Manage Usernames ===
// ===================================================================

// GET /admin/api/all-usernames - ดึงรายชื่อ Username ทั้งหมด พร้อมสถิติ
router.get('/api/all-usernames', isAdmin, async (req, res) => {
    try {
        const { start, end, agentId } = req.query;
        
        let matchCondition = { statusCode: 0 };
        
        // กรองตาม Agent ถ้ามีการเลือก
        if (agentId && agentId !== 'all') {
            matchCondition.apikey = new mongoose.Types.ObjectId(agentId);
        }
        
        // กรองตามวันที่ถ้ามีการเลือก
        if (start && end) {
            const [month1, day1, year1] = start.split('/');
            const [month2, day2, year2] = end.split('/');
            const startDate = new Date(`${year1}-${month1}-${day1}T00:00:00.000Z`);
            const endDate = new Date(`${year2}-${month2}-${day2}T23:59:59.999Z`);
            matchCondition.createdDate = { $gte: startDate, $lte: endDate };
        }

        const usernames = await Transaction.aggregate([
            { $match: matchCondition },
            {
                $group: {
                    _id: {
                        username: '$data.username',
                        apikey: '$apikey'
                    },
                    totalBet: { $sum: '$betAmount' },
                    totalWin: { $sum: '$payoutAmount' },
                    totalGames: { $sum: 1 },
                    lastPlayed: { $max: '$createdDate' }
                }
            },
            {
                $lookup: {
                    from: 'apis',
                    localField: '_id.apikey',
                    foreignField: '_id',
                    as: 'agentInfo'
                }
            },
            {
                $unwind: {
                    path: '$agentInfo',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $project: {
                    _id: 0,
                    username: '$_id.username',
                    agentName: { $ifNull: ['$agentInfo.name', 'Unknown'] },
                    agentUsername: { $ifNull: ['$agentInfo.username', 'N/A'] },
                    totalBet: 1,
                    totalWin: 1,
                    totalGames: 1,
                    winLoss: { $subtract: ['$totalWin', '$totalBet'] },
                    lastPlayed: 1
                }
            },
            { $sort: { totalBet: -1 } }
        ]);

        res.json({ success: true, usernames });

    } catch (err) {
        console.error("Get All Usernames Error:", err);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
    }
});

// GET /admin/api/username-detail/:username - ดึงประวัติการเล่นของ Username (อัพเดทเพื่อเพิ่มรูปภาพ)
router.get('/api/username-detail/:username', isAdmin, async (req, res) => {
    try {
        const { username } = req.params;
        const { start, end, startTime, endTime } = req.query;

        let matchCondition = {
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
            .populate('apikey', 'name username')
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
                createdDate: tx.createdDate,
                agentName: tx.apikey?.name || 'Unknown',
                agentUsername: tx.apikey?.username || 'N/A'
            };
        });

        res.json({ 
            success: true, 
            summary,
            history 
        });

    } catch (err) {
        console.error("Get Username Detail Error:", err);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
    }
});

// GET /admin/api/agents-list - ดึงรายชื่อ Agent ทั้งหมด (สำหรับ Filter)
router.get('/api/agents-list', isAdmin, async (req, res) => {
    try {
        const agents = await Api.find({}).select('_id name username').lean();
        res.json({ success: true, agents });
    } catch (err) {
        console.error("Get Agents List Error:", err);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
    }
});

module.exports = router;