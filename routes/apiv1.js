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
  //  console.log(req.user);
  console.log('sysdate ::==',moment().format('L'));
  return res.json({ message: 'Welcome 🙌' });
    
})

router.post('/verifySession', async function(req, res, next) {
    var bodydata = req.body;

    // ค้นหา user และ populate ข้อมูล apikey มาด้วย
    var user =  await User.findOne({token: bodydata.sessionToken}).populate("apikey");

    // ตรวจสอบว่าไม่พบ user หรือ user ไม่มี apikey ผูกอยู่
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

    // บันทึก secret_key และอัปเดตข้อมูล user
    user.secret_key = bodydata.secret_key;
    user.data.username = user.userid; // ตั้งค่า username ใน data ให้ตรงกับ userid
    await user.save();

    // --- START: โค้ดส่วนที่อัปเดตใหม่ ---

    // 1. ดึงค่า gameSettings จาก apikey ของ user
    const settings = user.apikey.gameSettings;

    // 2. ตรวจสอบว่ามี custom setting หรือไม่ ถ้าไม่มีให้ใช้ค่า default จาก schema
    // (Mongoose จะใส่ค่า default ให้โดยอัตโนมัติถ้า field นั้นว่าง)
    const gameSettingsPayload = {
        "setting": [
            {
                "name": "normal-spin",
                "output": "normal-spin",
                "percent": settings['normal-spin']
            },
            {
                "name": "less-bet",
                "output": "less-bet",
                "percent": settings['less-bet'],
                "option": {
                    "from": settings['less-bet-from'],
                    "to": settings['less-bet-to']
                }
            },
            {
                "name": "more-bet",
                "output": "more-bet",
                "percent": settings['more-bet'],
                "option": {
                    "from": settings['more-bet-from'],
                    "to": settings['more-bet-to']
                }
            },
            {
                "name": "freespin-less-bet",
                "output": "freespin-less-bet",
                "percent": settings['freespin-less-bet'],
                "option": {
                    "from": settings['freespin-less-bet-from'],
                    "to": settings['freespin-less-bet-to']
                }
            },
            {
                "name": "freespin-more-bet",
                "output": "freespin-more-bet",
                "percent": settings['freespin-more-bet'],
                "option": {
                    "from": settings['freespin-more-bet-from'],
                    "to": settings['freespin-more-bet-to']
                }
            }
        ],
        "username": user.userid,
        "isPlayerSetting": true,
        "buyFeatureSetting": [
            {
                "name": "buy-feature-less-bet",
                "output": "freespin-less-bet",
                "percent": settings['buy-feature-less-bet'],
                "option": {
                    "from": settings['buy-feature-less-bet-from'],
                    "to": settings['buy-feature-less-bet-to']
                }
            },
            {
                "name": "buy-feature-more-bet",
                "output": "freespin-more-bet",
                "percent": settings['buy-feature-more-bet'],
                "option": {
                    "from": settings['buy-feature-more-bet-from'],
                    "to": settings['buy-feature-more-bet-to']
                }
            }
        ]
    };

    // 3. สร้าง jsonResponse ที่จะส่งกลับ
    const jsonResponse = {
        "id": bodydata.id,
        "statusCode": 0,
        "timestampMillis": bodydata.timestampMillis,
        "productId": bodydata.productId,
        "currency": bodydata.currency,
        "username": user.userid,
        "game_setting" : gameSettingsPayload // ใช้ค่าที่สร้างจาก setting ของ Agent
      };

    // --- END: โค้ดส่วนที่อัปเดตใหม่ ---

    return res.json(jsonResponse);
});

router.post('/checkBalance', async function(req, res, next) {
    var bodydata = req.body;
    try {
        // ค้นหา user และ populate apikey มาด้วย
        var user =  await User.findOne({userid: bodydata.username, secret_key:bodydata.secret_key}).populate("apikey");

        if(!user || !user.apikey){ // เพิ่มการตรวจสอบ apikey ด้วย
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

        // --- START: แก้ไขส่วนนี้ ---

        // 1. เรียก API ของ Agent เพื่อเช็คยอดเงิน
        var data = JSON.stringify({ "username": user.username });
        var config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: user.apikey.callback+'/checkBalance',
            headers: { 
                'x-api-key': user.apikey.secret, 
                'Content-Type': 'application/json'
            },
            data : data
        };
        var mydata = await axios.request(config);

        // 2. ดึงค่า gameSettings จาก apikey ของ user (เหมือนใน verifySession)
        const settings = user.apikey.gameSettings;
        const gameSettingsPayload = {
            "setting": [
                { "name": "normal-spin", "output": "normal-spin", "percent": settings['normal-spin'] },
                { "name": "less-bet", "output": "less-bet", "percent": settings['less-bet'], "option": { "from": settings['less-bet-from'], "to": settings['less-bet-to'] } },
                { "name": "more-bet", "output": "more-bet", "percent": settings['more-bet'], "option": { "from": settings['more-bet-from'], "to": settings['more-bet-to'] } },
                { "name": "freespin-less-bet", "output": "freespin-less-bet", "percent": settings['freespin-less-bet'], "option": { "from": settings['freespin-less-bet-from'], "to": settings['freespin-less-bet-to'] } },
                { "name": "freespin-more-bet", "output": "freespin-more-bet", "percent": settings['freespin-more-bet'], "option": { "from": settings['freespin-more-bet-from'], "to": settings['freespin-more-bet-to'] } }
            ],
            "username": user.userid,
            "isPlayerSetting": true,
            "buyFeatureSetting": [
                { "name": "buy-feature-less-bet", "output": "freespin-less-bet", "percent": settings['buy-feature-less-bet'], "option": { "from": settings['buy-feature-less-bet-from'], "to": settings['buy-feature-less-bet-to'] } },
                { "name": "buy-feature-more-bet", "output": "freespin-more-bet", "percent": settings['buy-feature-more-bet'], "option": { "from": settings['buy-feature-more-bet-from'], "to": settings['buy-feature-more-bet-to'] } }
            ]
        };

        // 3. สร้าง jsonResponse ที่สมบูรณ์เพื่อส่งกลับ
        const finalResponse = {
          "id": bodydata.id,
          "statusCode": 0,
          "timestampMillis": bodydata.timestampMillis,
          "productId": bodydata.productId,
          "currency": bodydata.currency,
          "username": user.userid, // ใช้ userid ที่ถูกต้อง
          "balance": mydata.data.balance,
          "game_setting" : gameSettingsPayload // ใช้ Game Setting ที่ดึงมา
        };
    
        return res.json(finalResponse);

        // --- END: แก้ไขส่วนนี้ ---

    } catch (err) {
      console.log("Error occurred in checkBalance:", err);
      // ควรมีการจัดการ Error ที่ดีกว่านี้ แต่ตอนนี้จะ return error กลับไปก่อน
       return res.status(500).json({ 
           id: bodydata.id, 
           statusCode: 9999, // General Error
           message: "An internal error occurred"
        });
    }
});

router.post("/settleBets",async (req, res) => {
  var bodydata = req.body;

  try {
  var user =  await User.findOne({userid: bodydata.username,secret_key:bodydata.secret_key}).populate("apikey");
  var log = new Log(bodydata);
  console.log(user.apikey.name);
  console.log('body data is ', JSON.stringify(bodydata));
  //log = bodydata;
  await log.save();
  if(!user){
    //console.log('settleBets ERROR',user);
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
   bodydata.username = user.username

   var config = {
    method: 'post',
    maxBodyLength: Infinity,
    url: user.apikey.callback+'/settleBets',
    headers: { 
      'x-api-key': user.apikey.secret, 
      'Content-Type': 'application/json'
    },
    data : bodydata
  };



  var mydata = await axios.request(config)

  var tran = new Transaction();
  tran.id = bodydata.id;
  tran.statusCode = mydata.data.statusCode;
  tran.wallet_amount_before = mydata.data.balanceBefore;
  tran.wallet_amount_after = mydata.data.balanceAfter;
  tran.betAmount = bodydata.txns[0].betAmount;
  tran.payoutAmount = bodydata.txns[0].payoutAmount;
  tran.data = bodydata;
  tran.apikey = user.apikey._id;
  await tran.save();

  const filter = { data: moment().format('L') ,apikey:user.apikey._id,username: user.username};
  const update = { 
      $inc: {
        betAmount: bodydata.txns[0].betAmount,
        payoutAmount: bodydata.txns[0].payoutAmount
      },
      $set: {
        apikey: user.apikey._id,
        username: user.username,
        data: moment().format('L'),
      }
  };
  const doc = await Tranday.findOneAndUpdate(filter, update, {
    new: true,
    upsert: true // Make this update into an upsert
  });

   
  mydata.data.username = user.userid
  console.log('settleBets OK ',mydata.data);
  return res.json(mydata.data);  
 

  } catch (err) {
    console.log("Error occurred:", err.data);
    let retryAttempts = 4; // Number of retry attempts
    let retryDelay = 1500; // Delay between retries in milliseconds

    // Retry logic
    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
        console.log(`Retrying attempt ${attempt}...`);
        try {
            // Your existing code here
            var mydata = await axios.request(config);
            var tran = new Transaction();
            tran.id = bodydata.id;
            tran.statusCode = mydata.data.statusCode;
            tran.wallet_amount_before = mydata.data.balanceBefore;
            tran.wallet_amount_after = mydata.data.balanceAfter;
            tran.betAmount = bodydata.txns[0].betAmount;
            tran.payoutAmount = bodydata.txns[0].payoutAmount;
            tran.data = bodydata;
            tran.apikey = user.apikey._id;
            await tran.save();
          
            mydata.data.username = user.userid
            console.log('settleBets OK ',mydata.data);
            return res.json(mydata.data);  
        } catch (retryErr) {
            console.log(`Retry attempt ${attempt} failed:`, retryErr);
            if (attempt === retryAttempts) {
                console.log(`Maximum retry attempts (${retryAttempts}) reached.`);
                // Handle maximum retry attempts reached
                return res.status(500).json({ error: "Maximum retry attempts reached." });
            }
            await new Promise(resolve => setTimeout(resolve, retryDelay)); // Delay before next retry
        }
    }
    

    // console.log('settleBets ERROR ',err);
    // const jsonResponse = {
    //     "id": bodydata.id,
    //     "statusCode": 9,
    //     "timestampMillis":  bodydata.timestampMillis,
    //     "productId": bodydata.productId,
    //     "currency": bodydata.currency,
    //     "balanceBefore": 0,
    //     "balanceAfter": 0,
    //     "username": "demo"
    //   };
    //   return res.json(jsonResponse);   

  }





   

})
module.exports = router;