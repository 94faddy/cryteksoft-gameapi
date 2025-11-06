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

// ✅ ฟังก์ชันช่วย: สร้าง Game Settings Payload
function buildGameSettingsPayload(settings) {
    return {
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
}

router.post('/verifySession', async function(req, res, next) {
    var bodydata = req.body;

    var user =  await User.findOne({token: bodydata.sessionToken}).populate("apikey");

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

    user.secret_key = bodydata.secret_key;
    user.data.username = user.userid;
    await user.save();

    // ✅ เลือก Settings: User Settings → Agent Settings
    let effectiveSettings;
    if (user.useAgentSettings || !user.gameSettings || Object.keys(user.gameSettings).length === 0) {
        effectiveSettings = user.apikey.gameSettings;
    } else {
        effectiveSettings = user.gameSettings;
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
});

router.post('/checkBalance', async function(req, res, next) {
    var bodydata = req.body;
    try {
        var user =  await User.findOne({userid: bodydata.username, secret_key:bodydata.secret_key}).populate("apikey");

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
            data : data
        };
        var mydata = await axios.request(config);

        // ✅ เลือก Settings: User Settings → Agent Settings
        let effectiveSettings;
        if (user.useAgentSettings || !user.gameSettings || Object.keys(user.gameSettings).length === 0) {
            effectiveSettings = user.apikey.gameSettings;
        } else {
            effectiveSettings = user.gameSettings;
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

router.post("/settleBets",async (req, res) => {
  var bodydata = req.body;

  try {
  var user =  await User.findOne({userid: bodydata.username,secret_key:bodydata.secret_key}).populate("apikey");
  var log = new Log(bodydata);
  console.log(user.apikey.name);
  console.log('body data is ', JSON.stringify(bodydata));
  await log.save();
  if(!user){
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
    upsert: true
  });

  mydata.data.username = user.userid
  console.log('settleBets OK ',mydata.data);
  return res.json(mydata.data);  
 

  } catch (err) {
    console.log("Error occurred:", err.data);
    let retryAttempts = 4;
    let retryDelay = 1500;

    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
        console.log(`Retrying attempt ${attempt}...`);
        try {
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
                return res.status(500).json({ error: "Maximum retry attempts reached." });
            }
            await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
    }
  }
})

module.exports = router;