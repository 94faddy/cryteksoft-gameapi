const express = require('express');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const { Api } = require('../_helpers/db');
const router = express.Router();

// POST /auth/login (อัปเดตให้รองรับ 2FA)
router.post('/login', async (req, res) => {
    const { username, password, "cf-turnstile-response": turnstileToken } = req.body;

    // ✅ ตรวจสอบข้อมูลเบื้องต้น
    if (!username || !password || !turnstileToken) {
        return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
    }

    try {
        // ✅ ตรวจสอบ Turnstile
        const verifyUrl = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
        const secretKey = process.env.TURNSTILE_SECRET_KEY;

        // --- Start of Updated Code ---

        // สร้าง Body สำหรับส่งข้อมูลในรูปแบบ x-www-form-urlencoded
        const body = new URLSearchParams();
        body.append('secret', secretKey);
        body.append('response', turnstileToken);
        body.append('remoteip', req.ip);

        // ส่งข้อมูลใน Body ของ Request
        const verifyRes = await axios.post(verifyUrl, body, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        // --- End of Updated Code ---

        if (!verifyRes.data.success) {
            return res.status(403).json({ success: false, message: 'การยืนยัน Turnstile ล้มเหลว' });
        }

        // ✅ ตรวจสอบผู้ใช้งาน
        const user = await Api.findOne({ username: username });
        if (!user) {
            return res.status(401).json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
        }

        // ✅ จัดการ 2FA
        if (user.two_factor_enabled) {
            req.session.two_factor_pending = user._id;
            res.json({ success: true, two_factor_required: true });
        } else {
            req.session.user = {
                id: user._id,
                name: user.name,
                username: user.username
            };
            res.json({ success: true, two_factor_required: false, redirectUrl: '/dashboard' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในระบบ' });
    }
});

// GET /auth/logout
router.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.redirect('/dashboard');
        }
        res.clearCookie('connect.sid');
        res.redirect('/login');
    });
});

// POST /auth/change-password (อัปเดตให้ส่งกลับเป็น JSON)
router.post('/change-password', async (req, res) => {
    // Middleware ควรจะตรวจสอบให้แล้ว แต่เช็คอีกครั้งเพื่อความปลอดภัย
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { currentPassword, newPassword, confirmPassword } = req.body;
    if (!newPassword || newPassword !== confirmPassword) {
        return res.status(400).json({ success: false, message: 'รหัสผ่านใหม่และการยืนยันไม่ตรงกัน' });
    }

    try {
        const user = await Api.findById(req.session.user.id);
        if (!user) {
             return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้งานนี้' });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
        }

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();

        res.json({ success: true, message: 'เปลี่ยนรหัสผ่านสำเร็จ!' });

    } catch (err) {
        console.error('Change Password Error:', err);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในระบบ' });
    }
});


module.exports = router;