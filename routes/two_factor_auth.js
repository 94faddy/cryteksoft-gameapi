const express = require('express');
const router = express.Router();
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const { Api } = require('../_helpers/db');
const bcrypt = require('bcryptjs');

// Middleware ตรวจสอบว่า login แล้ว (สำหรับเข้าหน้าจัดการ)
const isAuthenticated = (req, res, next) => {
    if (req.session.user) return next();
    res.redirect('/login');
};

// Middleware ตรวจสอบว่ากำลังรอการยืนยัน 2FA
const is2FAPending = (req, res, next) => {
    if (req.session.two_factor_pending) return next();
    res.redirect('/login');
};

// GET /2fa/setup - เริ่มขั้นตอนการเปิดใช้งาน 2FA
router.get('/setup', isAuthenticated, async (req, res) => {
    const secret = speakeasy.generateSecret({
        name: `CRYTEKSOFT | GAME API (${req.session.user.username})`
    });
    // เก็บ secret ชั่วคราวใน session เพื่อรอการ verify
    req.session.two_factor_temp_secret = secret.base32;

    qrcode.toDataURL(secret.otpauth_url, (err, data_url) => {
        res.render('setup_2fa', { 
            user: req.session.user, 
            qrCode: data_url, 
            secretKey: secret.base32 
        });
    });
});

// POST /2fa/verify - ยืนยันรหัสจาก Authenticator App
router.post('/verify', isAuthenticated, async (req, res) => {
    const { token } = req.body;
    const secret = req.session.two_factor_temp_secret;

    const verified = speakeasy.totp.verify({
        secret: secret,
        encoding: 'base32',
        token: token
    });

    if (verified) {
        // ถ้ายืนยันสำเร็จ, บันทึก secret ลง db และเปิดใช้งาน
        await Api.findByIdAndUpdate(req.session.user.id, {
            two_factor_secret: secret,
            two_factor_enabled: true
        });
        delete req.session.two_factor_temp_secret; // ลบ secret ชั่วคราว
        res.json({ success: true, message: 'เปิดใช้งาน 2FA สำเร็จ!' });
    } else {
        res.status(400).json({ success: false, message: 'รหัสยืนยันไม่ถูกต้อง' });
    }
});

// POST /2fa/disable - ปิดการใช้งาน 2FA
router.post('/disable', isAuthenticated, async (req, res) => {
    const { password, token } = req.body;
    const user = await Api.findById(req.session.user.id);

    // ตรวจสอบรหัสผ่านและรหัส 2FA ปัจจุบัน
    const isPasswordMatch = await bcrypt.compare(password, user.password);
    const isTokenValid = speakeasy.totp.verify({
        secret: user.two_factor_secret,
        encoding: 'base32',
        token: token,
        window: 1
    });

    if (isPasswordMatch && isTokenValid) {
        await Api.findByIdAndUpdate(user._id, {
            two_factor_secret: null,
            two_factor_enabled: false
        });
        res.json({ success: true, message: 'ปิดใช้งาน 2FA สำเร็จ!' });
    } else {
        res.status(400).json({ success: false, message: 'รหัสผ่านหรือรหัส 2FA ไม่ถูกต้อง' });
    }
});


// --- ส่วนของการ Login ---

// GET /2fa/verify-login - แสดงหน้าให้กรอกรหัส 2FA ตอน login
router.get('/verify-login', is2FAPending, (req, res) => {
    res.render('verify_2fa', { error: null });
});

// POST /2fa/verify-login - ตรวจสอบรหัส 2FA ตอน login
router.post('/verify-login', is2FAPending, async (req, res) => {
    const { token } = req.body;
    const userId = req.session.two_factor_pending;
    try {
        const user = await Api.findById(userId);

        const verified = speakeasy.totp.verify({
            secret: user.two_factor_secret,
            encoding: 'base32',
            token: token,
            window: 1 // เพิ่มความยืดหยุ่นของเวลา
        });

        if (verified) {
            // สร้าง session login จริง
            req.session.user = {
                id: user._id,
                name: user.name,
                username: user.username
            };
            delete req.session.two_factor_pending;
            // ส่ง URL สำหรับ redirect กลับไปให้ Frontend
            res.json({ success: true, redirectUrl: '/dashboard' });
        } else {
            res.status(400).json({ success: false, message: 'รหัส 2FA ไม่ถูกต้อง' });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในระบบ' });
    }
});



module.exports = router;