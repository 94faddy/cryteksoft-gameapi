const express = require("express");
const crypto = require('crypto');
const router = express.Router();
const requestIp = require('request-ip')
const { Api,User,Log,Transaction,Tranday} = require('../_helpers/db');
const api_pg = require("../_helpers/pg")
const pg_api = new api_pg() 
const axios = require('axios');
const moment = require('moment');

function generateKey(size = 32, format = 'base64') {
    const buffer = crypto.randomBytes(size);
    return buffer.toString(format);
}

router.get('/', function(req, res, next) {
  console.log('sysdate ::==',moment().format('L'));
  return res.json({ message: 'Welcome 🙌' });
})

// ✅ ฟังก์ชันช่วย: สร้าง Game Settings Payload (แก้ไข bug)
function buildGameSettingsPayload(settings) {
    // ✅ เพิ่ม: ป้องกัน undefined
    if (!settings || typeof settings !== 'object') {
        console.error('⚠️ Settings is undefined or invalid, using default settings');
        settings = {
            'normal-spin': 85,
            'less-bet': 35,
            'less-bet-from': 0,
            'less-bet-to': 1,
            'more-bet': 8,
            'more-bet-from': 2,
            'more-bet-to': 4,
            'freespin-less-bet': 1,
            'freespin-less-bet-from': 0,
            'freespin-less-bet-to': 4,
            'freespin-more-bet': 0,
            'freespin-more-bet-from': 50,
            'freespin-more-bet-to': 60,
            'buy-feature-less-bet': 90,
            'buy-feature-less-bet-from': 0,
            'buy-feature-less-bet-to': 50,
            'buy-feature-more-bet': 4,
            'buy-feature-more-bet-from': 50,
            'buy-feature-more-bet-to': 60
        };
    }

    // ✅ เพิ่ม: ใช้ default values ถ้าค่าใดไม่มี
    const defaultSettings = {
        'normal-spin': 85,
        'less-bet': 35,
        'less-bet-from': 0,
        'less-bet-to': 1,
        'more-bet': 8,
        'more-bet-from': 2,
        'more-bet-to': 4,
        'freespin-less-bet': 1,
        'freespin-less-bet-from': 0,
        'freespin-less-bet-to': 4,
        'freespin-more-bet': 0,
        'freespin-more-bet-from': 50,
        'freespin-more-bet-to': 60,
        'buy-feature-less-bet': 90,
        'buy-feature-less-bet-from': 0,
        'buy-feature-less-bet-to': 50,
        'buy-feature-more-bet': 4,
        'buy-feature-more-bet-from': 50,
        'buy-feature-more-bet-to': 60
    };

    // ✅ Merge กับ default values
    const mergedSettings = { ...defaultSettings, ...settings };

    return {
        "setting": [
            {
                "name": "normal-spin",
                "output": "normal-spin",
                "percent": mergedSettings['normal-spin']
            },
            {
                "name": "less-bet",
                "output": "less-bet",
                "percent": mergedSettings['less-bet'],
                "option": {
                    "from": mergedSettings['less-bet-from'],
                    "to": mergedSettings['less-bet-to']
                }
            },
            {
                "name": "more-bet",
                "output": "more-bet",
                "percent": mergedSettings['more-bet'],
                "option": {
                    "from": mergedSettings['more-bet-from'],
                    "to": mergedSettings['more-bet-to']
                }
            },
            {
                "name": "freespin-less-bet",
                "output": "freespin-less-bet",
                "percent": mergedSettings['freespin-less-bet'],
                "option": {
                    "from": mergedSettings['freespin-less-bet-from'],
                    "to": mergedSettings['freespin-less-bet-to']
                }
            },
            {
                "name": "freespin-more-bet",
                "output": "freespin-more-bet",
                "percent": mergedSettings['freespin-more-bet'],
                "option": {
                    "from": mergedSettings['freespin-more-bet-from'],
                    "to": mergedSettings['freespin-more-bet-to']
                }
            }
        ],
        "buyFeatureSetting": [
            {
                "name": "buy-feature-less-bet",
                "output": "freespin-less-bet",
                "percent": mergedSettings['buy-feature-less-bet'],
                "option": {
                    "from": mergedSettings['buy-feature-less-bet-from'],
                    "to": mergedSettings['buy-feature-less-bet-to']
                }
            },
            {
                "name": "buy-feature-more-bet",
                "output": "freespin-more-bet",
                "percent": mergedSettings['buy-feature-more-bet'],
                "option": {
                    "from": mergedSettings['buy-feature-more-bet-from'],
                    "to": mergedSettings['buy-feature-more-bet-to']
                }
            }
        ]
    };
}

router.post('/verifySession', async function(req, res, next) {
    var bodydata = req.body;

    try {
        // ✅ ใช้ .lean() เพื่อลด overhead
        var user = await User.findOne({token: bodydata.sessionToken})
            .populate("apikey")
            .lean();

        if(!user || !user.apikey){
          const jsonResponse = {
                "id": bodydata.id,
                "statusCode": 30001,
                "timestampMillis": bodydata.timestampMillis,
                "productId": bodydata.productId,
                "currency": bodydata.currency,
                "username": bodydata.username
              };
              return res.json(jsonResponse);
        }

        // ✅ แก้: ต้อง update user ต้องใช้ updateOne เพราะ lean() return plain object
        await User.updateOne(
            { _id: user._id },
            { 
                secret_key: bodydata.secret_key,
                'data.username': user.userid
            }
        );

        // ✅ เลือก Settings: User Settings → Agent Settings
        let effectiveSettings;
        if (user.useAgentSettings !== false) {
            // ใช้ของ Agent
            effectiveSettings = user.apikey.gameSettings || {};
        } else {
            // ใช้ของ User
            effectiveSettings = user.gameSettings || {};
        }

        const gameSettingsPayload = buildGameSettingsPayload(effectiveSettings);
        gameSettingsPayload.username = user.userid;
        gameSettingsPayload.isPlayerSetting = true;

        const jsonResponse = {
            "id": bodydata.id,
            "statusCode": 0,
            "timestampMillis": bodydata.timestampMillis,
            "productId": bodydata.productId,
            "currency": bodydata.currency,
            "username": user.userid,
            "game_setting" : gameSettingsPayload
          };

        return res.json(jsonResponse);
    } catch (err) {
        console.error("Error in verifySession:", err);
        return res.status(500).json({ 
            id: bodydata.id, 
            statusCode: 9999,
            message: "Internal error in verifySession"
        });
    }
});

router.post('/checkBalance', async function(req, res, next) {
    var bodydata = req.body;
    try {
        // ✅ ใช้ .lean() เพื่อลด overhead
        var user = await User.findOne({userid: bodydata.username, secret_key:bodydata.secret_key})
            .populate("apikey")
            .lean();

        if(!user || !user.apikey){
            const jsonResponse = {
                "id": bodydata.id,
                "statusCode": 30001,
                "timestampMillis": bodydata.timestampMillis,
                "productId": bodydata.productId,
                "currency": bodydata.currency,
                "balance": "0",
                "username": bodydata.username
            };
            return res.json(jsonResponse);   
        }

        var data = JSON.stringify({ "username": user.username });
        var config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: user.apikey.callback+'/checkBalance',
            headers: { 
                'x-api-key': user.apikey.secret, 
                'Content-Type': 'application/json'
            },
            data : data,
            timeout: 5000 // ✅ เพิ่ม: timeout 5 วินาที
        };
        var mydata = await axios.request(config);

        // ✅ เลือก Settings: User Settings → Agent Settings
        let effectiveSettings;
        if (user.useAgentSettings !== false) {
            // ใช้ของ Agent
            effectiveSettings = user.apikey.gameSettings || {};
        } else {
            // ใช้ของ User
            effectiveSettings = user.gameSettings || {};
        }

        const gameSettingsPayload = buildGameSettingsPayload(effectiveSettings);
        gameSettingsPayload.username = user.userid;
        gameSettingsPayload.isPlayerSetting = true;

        const finalResponse = {
          "id": bodydata.id,
          "statusCode": 0,
          "timestampMillis": bodydata.timestampMillis,
          "productId": bodydata.productId,
          "currency": bodydata.currency,
          "username": user.userid,
          "balance": mydata.data.balance,
          "game_setting" : gameSettingsPayload
        };
    
        return res.json(finalResponse);

    } catch (err) {
      console.log("Error occurred in checkBalance:", err);
       return res.status(500).json({ 
           id: bodydata.id, 
           statusCode: 9999,
           message: "An internal error occurred"
        });
    }
});

router.post("/settleBets", async (req, res) => {
  var bodydata = req.body;

  try {
    // ✅ ใช้ .lean() เพื่อลด overhead
    var user = await User.findOne({userid: bodydata.username, secret_key:bodydata.secret_key})
        .populate("apikey")
        .lean();

    if(!user || !user.apikey){
        const jsonResponse = {
            "id": bodydata.id,
            "statusCode": 30001,
            "timestampMillis": bodydata.timestampMillis,
            "productId": bodydata.productId,
            "currency": bodydata.currency,
            "balanceBefore": 0,
            "balanceAfter": 0,
            "username": bodydata.username
          };
          return res.json(jsonResponse);   
     }

     bodydata.username = user.username;

     var config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: user.apikey.callback+'/settleBets',
      headers: { 
        'x-api-key': user.apikey.secret, 
        'Content-Type': 'application/json'
      },
      data : bodydata,
      timeout: 10000 // ✅ เพิ่ม: timeout 10 วินาที
    };

    var mydata = await axios.request(config);

    // ✅ บันทึก Transaction (แบบรอให้เสร็จ - ปลอดภัย)
    const tran = new Transaction();
    tran.id = bodydata.id;
    tran.statusCode = mydata.data.statusCode;
    tran.wallet_amount_before = mydata.data.balanceBefore;
    tran.wallet_amount_after = mydata.data.balanceAfter;
    tran.betAmount = bodydata.txns[0].betAmount;
    tran.payoutAmount = bodydata.txns[0].payoutAmount;
    tran.data = bodydata;
    tran.apikey = user.apikey._id;
    await tran.save();

    // ✅ อัปเดท Tranday (แบบรอให้เสร็จ - ปลอดภัย)
    const filter = { 
        data: moment().format('L'),
        apikey: user.apikey._id,
        username: user.username
    };
    const update = { 
        $inc: {
          betAmount: bodydata.txns[0].betAmount,
          payoutAmount: bodydata.txns[0].payoutAmount
        },
        $setOnInsert: {
          apikey: user.apikey._id,
          username: user.username,
          data: moment().format('L'),
        }
    };
    await Tranday.findOneAndUpdate(filter, update, {
      new: true,
      upsert: true
    });

    // ✅ บันทึก Log แบบ async (ไม่สำคัญถ้าหาย)
    setImmediate(async () => {
        try {
            const log = new Log(bodydata);
            await log.save();
        } catch (logErr) {
            console.error('Log save error:', logErr);
        }
    });

    mydata.data.username = user.userid;
    console.log('settleBets OK', mydata.data);
    return res.json(mydata.data);  

  } catch (err) {
    console.log("Error occurred in settleBets:", err);
    
    // ✅ Retry mechanism
    let retryAttempts = 3;
    let retryDelay = 1000;

    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
        console.log(`Retrying settleBets attempt ${attempt}/${retryAttempts}...`);
        try {
            var mydata = await axios.request(config);

            // บันทึก transaction ใน retry
            const tran = new Transaction();
            tran.id = bodydata.id;
            tran.statusCode = mydata.data.statusCode;
            tran.wallet_amount_before = mydata.data.balanceBefore;
            tran.wallet_amount_after = mydata.data.balanceAfter;
            tran.betAmount = bodydata.txns[0].betAmount;
            tran.payoutAmount = bodydata.txns[0].payoutAmount;
            tran.data = bodydata;
            tran.apikey = user.apikey._id;
            await tran.save();
          
            mydata.data.username = user.userid;
            console.log('settleBets OK (retry)', mydata.data);
            return res.json(mydata.data);  
        } catch (retryErr) {
            console.log(`Retry attempt ${attempt} failed:`, retryErr.message);
            if (attempt === retryAttempts) {
                console.log(`Maximum retry attempts (${retryAttempts}) reached.`);
                return res.status(500).json({ 
                    id: bodydata.id,
                    statusCode: 9999,
                    error: "Maximum retry attempts reached." 
                });
            }
            await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
    }
  }
});

module.exports = router;