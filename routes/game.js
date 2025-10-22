const express = require("express");
const crypto = require('crypto');
const router = express.Router();
const requestIp = require('request-ip')
const { Api,User,Log,Transaction} = require('../_helpers/db');
const api_pg = require("../_helpers/pg")
const pg_api = new api_pg() 
const axios = require('axios');

function generateKey(size = 32, format = 'base64') {
    const buffer = crypto.randomBytes(size);
    return buffer.toString(format);
  }

router.get('/', function(req, res, next) {
  //  console.log(req.user);
    res.json({ message: 'Welcome 🙌' });
    
})
router.post('/callback/checkBalance', async function(req, res, next) {
    const bodydata = req.body;
  // console.log('settleBets',bodydata);
    try {
  //  const bodydata = req.body;
    var user =  await User.findOne({userid: bodydata.username,token: bodydata.sessionToken}).populate("apikey");
     // const verify = await jwt.verify(bodydata.sessionToken,  process.env.JWT_SECRET);
     if(!user){
      console.log('USEROR',user);
      return res.status(400).send({ success: false, message: `ERROR`});
    }
    let data = JSON.stringify({
        "username": user.username,
      });
    //console.log(data);  
    let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: user.apikey.callback+'/checkBalance',
        headers: { 
          'x-api-key': user.apikey.secret, 
          'Content-Type': 'application/json'
        },
        data : data
    };

    const mydata = await axios.request(config)
    return res.json(mydata.data);
    console.log(mydata);
    } catch (err) {
        console.log(err);
        res.status(400).send({ success: false, message: `ERROR`});
    }
})
router.post("/callback/settleBets", async (req, res) => {
  const bodydata = req.body;

  try {
    const milliseconds = new Date().getTime();
    const user = await User.findOne({ userid: bodydata.username, token: bodydata.sessionToken }).populate("apikey");
    const log = new Log(bodydata);
    await log.save();

    if (!user) {
      let jsonResponse = {
        id: bodydata.id,
        statusCode: 30001,
        timestampMillis: milliseconds,
        productId: "PGSOFT2",
        currency: bodydata.currency,
        balanceBefore: 0,
        balanceAfter: 0,
        username: bodydata.username
      };
      return res.json(jsonResponse);
    }

    bodydata.username = user.username;
    bodydata.txns[0].betAmount = bodydata.txns[0].betAmount.toFixed(2);
    bodydata.txns[0].payoutAmount = bodydata.txns[0].payoutAmount.toFixed(2);

    const config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: user.apikey.callback + '/settleBets',
      headers: {
        'x-api-key': user.apikey.secret,
        'Content-Type': 'application/json'
      },
      data: bodydata
    };

    const mydata = await axios.request(config);

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

    return res.json(mydata.data);

  } catch (err) {
    console.log('URL:', err.response?.config?.url);
    console.log('DATA:', err.response?.config?.data);
    console.log('ERROR:', err.response?.data?.message);

    let jsonResponse;

    if (err.response?.data?.message?.msg === 'Not enough credit.') {
      jsonResponse = {
        id: bodydata.id,
        statusCode: 30001,
        timestampMillis: milliseconds,
        productId: "PGSOFT2",
        currency: bodydata.currency,
        balanceBefore: 0,
        balanceAfter: 0,
        username: bodydata.username
      };
    } else {
      jsonResponse = {
        id: bodydata.id,
        statusCode: 50001,
        timestampMillis: milliseconds,
        productId: "PGSOFT2",
        currency: bodydata.currency,
        balanceBefore: 0,
        balanceAfter: 0,
        username: bodydata.username
      };
    }

    return res.json(jsonResponse);
  }
});

module.exports = router;