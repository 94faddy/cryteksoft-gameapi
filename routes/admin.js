const express = require("express");
const axios = require('axios');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { Api, Transaction, Tranday } = require('../_helpers/db');

const ADMIN_USERNAME = 'godtroll@dev';
const ADMIN_PASSWORD_HASH = '$2a$12$snc82XC4hOl1JMm6.hrL/eayClXKZU.FBDAoGdFB6FpESCkgyoU7e';

const isAdmin = (req, res, next) => {
    if (req.session.isAdmin) return next();
    res.redirect('/admin');
};

// --- Routes สำหรับแสดงผลหน้าเว็บ (ส่วนนี้เหมือนเดิม) ---
router.get('/', (req, res) => {
    if (req.session.isAdmin) return res.redirect('/admin/dashboard');
    // 2. ส่ง turnstile_sitekey ไปให้ template 'admin/login'
    res.render('admin/login', {
        error: null,
        turnstile_sitekey: process.env.TURNSTILE_SITE_KEY
    });
});

router.post('/login', async (req, res) => {
    // 3. รับ Token ของ Turnstile จากฟอร์ม
    const { username, password, "cf-turnstile-response": turnstileToken } = req.body;

    // ตรวจสอบว่ามี Token ส่งมาหรือไม่
    if (!turnstileToken) {
        return res.render('admin/login', {
            error: 'การยืนยันตัวตนล้มเหลว กรุณาลองใหม่อีกครั้ง',
            turnstile_sitekey: process.env.TURNSTILE_SITE_KEY
        });
    }

    try {
        // 4. ส่ง Token ไปตรวจสอบที่ Cloudflare
        const verifyUrl = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
        const secretKey = process.env.TURNSTILE_SECRET_KEY;

        const body = new URLSearchParams();
        body.append('secret', secretKey);
        body.append('response', turnstileToken);
        body.append('remoteip', req.ip);

        const verifyRes = await axios.post(verifyUrl, body, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        // ถ้าการยืนยัน Turnstile ไม่สำเร็จ
        if (!verifyRes.data.success) {
            return res.render('admin/login', {
                error: 'การยืนยัน Captcha ล้มเหลว',
                turnstile_sitekey: process.env.TURNSTILE_SITE_KEY
            });
        }

        // 5. ถ้า Turnstile ผ่าน ให้ตรวจสอบชื่อผู้ใช้และรหัสผ่านต่อไป
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

// --- API Endpoints (ส่วนนี้มีการอัปเดต) ---

// GET /admin/api/dashboard-summary - (ฉบับแก้ไข: เพิ่มการกรองวันที่กลับเข้ามา)
router.get('/api/dashboard-summary', isAdmin, async (req, res) => {
    try {
        const pipeline = []; // สร้าง pipeline ว่างๆ ไว้ก่อน

        // --- START: เพิ่มตรรกะการกรองวันที่กลับเข้ามา ---
        if (req.query.start && req.query.end) {
            const [month1, day1, year1] = req.query.start.split('/');
            const [month2, day2, year2] = req.query.end.split('/');
            const startDate = new Date(`${year1}-${month1}-${day1}`);
            const endDate = new Date(new Date(`${year2}-${month2}-${day2}`).setHours(23, 59, 59, 999));

            // เนื่องจาก Tranday.data เป็น String (เช่น "06/29/2025") เราต้องแปลงเป็น Date object ก่อนเพื่อเปรียบเทียบ
            // $addFields จะสร้าง field ใหม่ชื่อ 'convertedDate' เพื่อใช้ในการกรอง
            pipeline.push({
                $addFields: {
                    convertedDate: {
                        $dateFromString: {
                            dateString: '$data',
                            format: '%m/%d/%Y' // รูปแบบของวันที่ใน field 'data'
                        }
                    }
                }
            });

            // เพิ่มขั้นตอนการกรอง (match) โดยใช้ field ที่เราเพิ่งสร้างขึ้น
            pipeline.push({
                $match: {
                    convertedDate: {
                        $gte: startDate,
                        $lte: endDate
                    }
                }
            });
        }
        // --- END: เพิ่มตรรกะการกรองวันที่กลับเข้ามา ---


        // เพิ่มขั้นตอน $facet เข้าไปใน pipeline
        pipeline.push({
            $facet: {
                "overall": [
                    { $group: { _id: null, total_bet_all: { $sum: '$betAmount' }, total_win_all: { $sum: '$payoutAmount' } } }
                ],
                "byUser": [
                    { $group: { _id: '$apikey', total_bet: { $sum: '$betAmount' }, total_win: { $sum: '$payoutAmount' } } },
                    { $lookup: { from: 'apis', localField: '_id', foreignField: '_id', as: 'api_info' } },
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
        });

        const results = await Tranday.aggregate(pipeline);

        res.json({
            overall: results[0].overall[0] || { total_bet_all: 0, total_win_all: 0 },
            usersSummary: results[0].byUser
        });

    } catch (err) {
        console.error("Dashboard Summary Error:", err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// **อัปเดต:** Create User API (เปลี่ยนจาก redirect เป็น res.json)
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

// **อัปเดต:** Update User API (เปลี่ยนจาก redirect เป็น res.json)
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

// **อัปเดต:** Delete User API (เปลี่ยนจาก redirect เป็น res.json)
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

// API สำหรับดึงข้อมูล Game Settings ของ User
router.get('/api/get-user-settings/:userId', isAdmin, async (req, res) => {
    try {
        const user = await Api.findById(req.params.userId).select('gameSettings').lean();
        if (!user) {
            return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้งาน' });
        }
        // ถ้า user ยังไม่มีค่า setting ให้ส่ง object ว่างกลับไป เพื่อให้ frontend ใช้ค่า default
        res.json({ success: true, settings: user.gameSettings || {} });
    } catch (err) {
        console.error("Get User Settings Error:", err);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
    }
});

// API สำหรับอัปเดต Game Settings ของ User
router.post('/api/update-user-settings', isAdmin, async (req, res) => {
    try {
        const { userId, admin_password, ...settingsData } = req.body;

        // 1. ตรวจสอบรหัสผ่าน Admin (เหมือนเดิม)
        const isAdminPassOk = await bcrypt.compare(admin_password, ADMIN_PASSWORD_HASH);
        if (!isAdminPassOk) {
            return res.status(401).json({ success: false, message: 'รหัสผ่าน Admin ไม่ถูกต้อง!' });
        }

        // 2. ค้นหา User ที่ต้องการอัปเดต (เหมือนเดิม)
        const user = await Api.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้งาน' });
        }

        // --- START: แก้ไข Logic การบันทึก ---
        // 3. สร้าง Object ใหม่สำหรับเก็บค่า Setting
        const newSettings = {};
        // ใช้ Object.keys จาก defaultSettings ที่เรารู้จัก เพื่อความปลอดภัย
        const allowedKeys = [
            'normal-spin', 'less-bet', 'less-bet-from', 'less-bet-to',
            'more-bet', 'more-bet-from', 'more-bet-to', 'freespin-less-bet',
            'freespin-less-bet-from', 'freespin-less-bet-to', 'freespin-more-bet',
            'freespin-more-bet-from', 'freespin-more-bet-to', 'buy-feature-less-bet',
            'buy-feature-less-bet-from', 'buy-feature-less-bet-to', 'buy-feature-more-bet',
            'buy-feature-more-bet-from', 'buy-feature-more-bet-to'
        ];

        // วนลูปจาก key ที่อนุญาตเท่านั้น
        allowedKeys.forEach(key => {
            // ตรวจสอบว่ามีข้อมูล key นี้ส่งมาจากฟอร์มหรือไม่ ถ้ามีให้ใช้ค่านั้น
            if (settingsData[key] !== undefined) {
                newSettings[key] = Number(settingsData[key]);
            }
        });
        
        // 4. นำ Object ใหม่ทั้งหมดไปแทนที่ gameSettings เดิม
        user.gameSettings = newSettings;
        user.markModified('gameSettings'); // แจ้ง Mongoose ว่ามีการแก้ไข
        await user.save(); // บันทึก

        // --- END: แก้ไข Logic การบันทึก ---

        res.json({ success: true, message: 'อัปเดตการตั้งค่าเกมสำเร็จ!' });

    } catch (err) {
        console.error("Update Game Settings Error:", err);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
    }
});


module.exports = router;