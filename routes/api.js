const express = require("express");
const crypto = require('crypto');
const moment = require('moment-timezone');
var router = express.Router();
const requestIp = require('request-ip')
const { Api, User, Transaction, Setting, Tranday } = require('../_helpers/db');
const mongoose = require('mongoose');

const api_pg = require("../_helpers/pg")
const pg_api = new api_pg()

function generateKey(size = 32, format = 'base64') {
  const buffer = crypto.randomBytes(size);
  return buffer.toString(format);
}
router.get('/allutotal', async function (req, res, next) {
  //  console.log(req.user);
  const allTotal = await Tranday.aggregate([
    {
      $group: {
        _id: null,
        total_bet_all: { $sum: '$betAmount' },
        total_win_all: { $sum: '$payoutAmount' }
      }
    }
  ]).exec();


  return res.send(allTotal);
  //return res.json(user);

})
router.get('/alluser', async function (req, res, next) {
  //  console.log(req.user);

  var user = await Api.find({});
  var results = await Promise.all(user.map(async (val) => {
    var data = {}
    const allTotal = await Tranday.aggregate([
      {
        $match: {
          apikey: val._id
        }
      },
      {
        $group: {
          _id: null,
          total_bet_all: { $sum: '$betAmount' },
          total_win_all: { $sum: '$payoutAmount' }
        }
      }
    ]).exec();
    data.name = val.name
    data.allTotal = allTotal
    //var totalData = await pg_api.get_amount(val.username);
    //console.log('DD',totalData[0])
    // val.sum_betAmount = totalData[0]?.total_bet_all  == undefined ? 0 : totalData[0].total_bet_all
    // val.sum_payoutAmount = totalData[0]?.total_win_all == undefined ? 0 : totalData[0].total_win_all
    return data;
  }));


  return res.send(results);
  return res.json(user);

})
router.get('/allutotal1', async function (req, res, next) {
  //  console.log(req.user);

  const [month1, day1, year1] = req.query.start.split('/');
  const [month2, day2, year2] = req.query.end.split('/');
  const dateTostart = new Date(`${year1}-${month1}-${day1}`);
  const dateToend = new Date(`${year2}-${month2}-${day2}`);
  const allTotal = await Transaction.aggregate([
    {
      $match: {
        statusCode: 0,
        createdDate: {
          $gte: dateTostart,
          $lt: dateToend
        }
      }
    },
    {
      $group: {
        _id: null,
        total_bet_all: { $sum: '$betAmount' },
        total_win_all: { $sum: '$payoutAmount' }
      }
    }
  ]).exec();


  return res.send(allTotal);
  //return res.json(user);

})
router.get('/alluser1', async function (req, res, next) {

  const [month1, day1, year1] = req.query.start.split('/');
  const [month2, day2, year2] = req.query.end.split('/');
  const dateTostart = new Date(`${year1}-${month1}-${day1}`);
  const dateToend = new Date(`${year2}-${month2}-${day2}`);
  var user = await Api.find({});
  var results = await Promise.all(user.map(async (val) => {
    var data = {}
    const allTotal = await Transaction.aggregate([
      {
        $match: {
          apikey: val._id,
          statusCode: 0,
          createdDate: {
            $gte: dateTostart,
            $lt: dateToend
          }
        }
      },
      {
        $group: {
          _id: null,
          total_bet_all: { $sum: '$betAmount' },
          total_win_all: { $sum: '$payoutAmount' }
        }
      }
    ]).exec();
    data.name = val.name
    data.allTotal = allTotal
    //var totalData = await pg_api.get_amount(val.username);
    //console.log('DD',totalData[0])
    // val.sum_betAmount = totalData[0]?.total_bet_all  == undefined ? 0 : totalData[0].total_bet_all
    // val.sum_payoutAmount = totalData[0]?.total_win_all == undefined ? 0 : totalData[0].total_win_all
    return data;
  }));


  return res.send(results);
  return res.json(user);

})
router.get('/setting', async function (req, res, next) {
  //  console.log(req.user);
  let { id } = req.query
  if (id) {
    var user = await Setting.find({ _id: id });
  } else {
    var user = await Setting.find({});
  }

  return res.json(user);

})
// router.get('/gameall', async function(req, res, next) {
//   //  console.log(req.user);
//   var  parsedData = await pg_api.get_allgame();  
// 	//let parsedData = JSON.parse(resultss);

// // Filter out the item with code 'jewels-prosper'
// //	parsedData.data = parsedData.data.filter(item => item.code !== 'fortune-tiger');

// // Convert back to JSON string
// 	//let updatedData = JSON.stringify(parsedData);

//   return res.json(parsedData);

// })
router.get('/winloss', async function (req, res, next) {
  try {
    var adminkey = req.headers['x-api-key'];
    //  console.log(adminkey);
    var api = await Api.findOne({ apikey: adminkey });
    //  console.log(api);
    if (!api) {
      return res.status(400).send({ success: false, message: `ERROR` });
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    startOfMonth.setHours(0, 0, 0, 0);

    let todayTotal = await Transaction.aggregate([
      {
        $match: {
          apikey: api._id,
          statusCode: 0,
          createdDate: {
            $gte: today,
            $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
          }
        }
      },
      {
        $group: {
          _id: null,
          total_bet_today: { $sum: '$betAmount' },
          total_win_today: { $sum: '$payoutAmount' }
        }
      }
    ]).exec();

    const thisMonthTotal = await Transaction.aggregate([
      {
        $match: {
          apikey: api._id,
          statusCode: 0,
          createdDate: {
            $gte: startOfMonth,
            $lt: new Date(today.getFullYear(), today.getMonth() + 1, 1)
          }
        }
      },
      {
        $group: {
          _id: null,
          total_bet_month: { $sum: '$betAmount' },
          total_win_month: { $sum: '$payoutAmount' }
        }
      }
    ]).exec();

    const allTotal = await Transaction.aggregate([
      {
        $match: {
          apikey: api._id,
          statusCode: 0
        }
      },
      {
        $group: {
          _id: null,
          total_bet_all: { $sum: '$betAmount' },
          total_win_all: { $sum: '$payoutAmount' }
        }
      }
    ]).exec();

    if (todayTotal.length === 0) {

      console.log(todayTotal.length, 'ssssss');
      //let todayTotal = [{ _id: null, total_bet_all: 0, total_win_all: 0 }];
      todayTotal = [{ _id: null, total_bet_all: 0, total_win_all: 0 }]; // Initialize todayTotal if needed
    }
    const result = {
      todayTotal, thisMonthTotal, allTotal
    };
    console.log(result);
    return res.json(result);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }

})
router.post('/amount', async function (req, res, next) {
  try {
    var bodydata = req.body;
    var adminkey = req.headers['x-api-key'];
    //console.log(adminkey);
    var api = await Api.findOne({ apikey: adminkey });
    if (!api) {
      return res.status(400).send({ success: false, message: `ERROR` });
    }

    const allTotal = await Transaction.aggregate([
      {
        $match: {
          apikey: api._id,
          'data.username': bodydata.username,
          statusCode: 0
        }
      },
      {
        $group: {
          _id: null,
          total_bet_all: { $sum: '$betAmount' },
          total_win_all: { $sum: '$payoutAmount' }
        }
      }
    ]).exec();

    return res.json(allTotal);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }

})
router.post('/history', async function (req, res, next) {
  var bodydata = req.body;
  //  console.log(bodydata);
  var adminkey = req.headers['x-api-key'];
  var api = await Api.findOne({ apikey: adminkey });
  if (!api) {
    return res.status(400).send({ success: false, message: `ERROR` });
  }
  var userapi = await Transaction.find({ apikey: api._id, 'data.username': bodydata.username }).sort({ "createdDate": -1 }).limit(1000).exec();
  if (!userapi) {
    return res.status(400).send({ success: false, message: `ERROR` });
  }



  // console.log(userapi);
  //   var resultss = await pg_api.loginuser(userapi.userid,bodydata.gameCode,userapi.token);
  return res.json(userapi);
  //   //console.log(url);


  //console.log(bodydata);
})
router.post('/historyall', async function (req, res, next) {
  var bodydata = req.body;
  // console.log(moment(bodydata.start).format('L'));
  //  console.log(moment(bodydata.end).format('L'));
  //console.log(bodydata);
  var adminkey = req.headers['x-api-key'];
  var api = await Api.findOne({ apikey: adminkey });
  if (!api) {
    return res.status(400).send({ success: false, message: `ERROR` });
  }
  var start = new Date(bodydata.start);
  var end = new Date(bodydata.end);
  var userapi = await Transaction.find({
    apikey: api._id,
    createdDate: {
      $gte: start,
      $lt: end
    }
  }).sort({ "createdDate": -1 }).limit(1000).exec();
  // Example: Eastern Time

  const Total = await Transaction.aggregate([
    {
      $match: {
        apikey: api._id,
        statusCode: 0,
        createdDate: {
          $gte: start,
          $lt: end
        }
      }
    },
    {
      $group: {
        _id: null,
        total_bet: { $sum: '$betAmount' },
        total_win: { $sum: '$payoutAmount' }
      }
    }
  ]).exec();
  if (!userapi) {
    return res.status(400).send({ success: false, message: `ERROR` });
  }
  const result = {
    data: userapi,
    Total: Total[0]
  };
  // console.log(ddta);
  //   var resultss = await pg_api.loginuser(userapi.userid,bodydata.gameCode,userapi.token);
  return res.json(result);
  //   //console.log(url);


  //console.log(bodydata);
})
router.post('/login', async function (req, res, next) {
  const gameIdList = {
    'hotpot': 28,
    'shaolin-soccer': 67,
    'gladi-glory': 1572362,
    'diner-delights': 1372643,
    'safari-wilds': 1594259,
    'cruise-royale': 1473388,
    'fruity-candy': 1397455,
    'lucky-clover': 1601012,
    'spr-golf-drive': 1513328,
    'myst-spirits': 1432733,
    'songkran-spl': 1448762,
    'bakery-bonanza': 1418544,
    'hawaiian-tiki': 1381200,
    'treasures-aztec': 87,
    'mahjong-ways': 65,
    'mahjong-ways2': 74,
    'rave-party-fvr': 1420892,
    'fortune-rabbit': 1543462,
    'midas-fortune': 1402846,
    'asgardian-rs': 1340277,
    'alchemy-gold': 1368367,
    'totem-wonders': 1338274,
    'prosper-ftree': 1312883,
    'wild-bounty-sd': 135,
    'wild-coaster': 132,
    'legend-perseus': 128,
    'speed-winner': 127,
    'lucky-piggy': 130,
    'win-win-fpc': 129,
    'battleground': 124,
    'rooster-rbl': 123,
    'btrfly-blossom': 125,
    'dest-sun-moon': 121,
    'garuda-gems': 122,
    'fortune-tiger': 126,
    'emoji-riches': 114,
    'spirit-wonder': 119,
    'lgd-monkey-kg': 107,
    'buffalo-win': 108,
    'sprmkt-spree': 115,
    'crypt-fortune': 113,
    'mermaid-riches': 102,
    'heist-stakes': 105,
    'wild-bandito': 104,
    'candy-bonanza': 100,
    'majestic-ts': 95,
    'bali-vacation': 94,
    'fortune-ox': 98,
    'gdn-ice-fire': 91,
    'galactic-gems': 86,
    'jack-frosts': 97,
    'jewels-prosper': 88,
    'queen-bounty': 84,
    'vampires-charm': 58,
    'sct-cleopatra': 90,
    'circus-delight': 80,
    'genies-wishes': 85,
    'wild-fireworks': 83,
    'phoenix-rises': 82,
    'candy-burst': 70,
    'bikini-paradise': 69,
    'fortune-mouse': 68,
    'dragon-hatch': 57,
    'leprechaun-riches': 60,
    'double-fortune': 48,
    'the-great-icescape': 53,
    'jungle-delight': 40,
    'captains-bounty': 54,
    'ganesha-gold': 42,
    'piggy-gold': 39,
    'ways-of-qilin': 106,
    'cai-shen-wins': 71,
    'lucky-neko': 89,
    'mask-carnival': 118,
    'cocktail-nite': 117,
    'crypto-gold': 103,
    'dreams-of-macau': 79,
    'egypts-book-mystery': 73,
    'gem-saviour-conquest': 62,
    'jurassic-kdm': 110,
    'opera-dynasty': 93,
    'oriental-pros': 112,
    'rise-of-apollo': 101,
    'thai-river': 92,
    'queen-banquet': 120,
    'ganesha-fortune': 75,
    'ninja-raccoon': 1529867,
    'wild-heist-co': 1568554,
    'forge-wealth': 1555350,
    'mafia-mayhem': 1580541,
    'tsar-treasures': 1655268,
    'santas-gift-rush': 37,
    'ult-striker': 1489936,
    'midas-fortune': 1402846,
    'werewolf-hunt': 1615454,
    'dragon-hatch2': 1451122,
    'fortune-dragon': 1695365,
    'diaochan': 1,
    'dragon-tiger-luck': 63,
    'muay-thai-champion': 64,
    'prosperity-lion': 36,
    'legend-of-hou-yi': 34,
    'hip-hop-panda': 33,
    'emperors-favour': 44,
    'journey-to-the-wealth': 50,
    'reel-love': 20,
    'mr-hallow-win': 35,
    'medusa': 7
  };

  const jili_list = {
    4: 'tks',
    5: 'chilli',
    6: 'luckytree',
    9: 'fd',
    16: 'kk2',
    21: 'ols',
    27: 'sss',
    33: 'pp',
    36: 'bbc',
    38: 'fs',
    40: 'ols3',
    45: 'cbt',
    47: 'bfs',
    77: 'bk',
    85: 'mw',
    91: 'ifff',
    100: 'sr',
    101: 'ms',
    103: 'mw2',
    108: 'mw3',
    109: 'fg',
    115: 'aa',    
    116: 'taxi',
    126: 'dotd',
    130: 'thor',
    135: 'me',
    136: 'samba',
    137: 'ge',
    142: 'bh',
    144: 'cai',
    145: 'ln',
    146: 'fb',
    164: 'pirate',
    166: 'utaxi',
    171: 'sc',
    176: 'cny',
    181: 'wa',
    183: 'gj',
    184: 'rsx2',
    187: 'c72',
    193: 'df',
    198: 'sl',
    208: 'phoenix',
    209: 'ap',
    213: 'fb2',
    214: 'ka',
    225: 'ctk',
    226: 'witch',
    228: 'afr',
    230: 'cts',
    238: 'bby',
    239: 'dbg',
    259: 'bfs2',
    186: 'mc2',
    300: 'fg3',
    37: 'sweetheart5',
    263: 'tph',
    399: 'tct',
    301: 'jpj'
  };

  try {
    var bodydata = req.body;
    var adminkey = req.headers['x-api-key'];
    console.log('body ', bodydata, req.headers);
    var api = await Api.findOne({ apikey: adminkey });
    console.log('api is ', api);
    if (!api) {
      return res.status(400).send({ success: false, message: `ERROR` });
    }
    var userapi = await User.findOne({ apikey: api._id, username: bodydata.username, token: bodydata.sessionToken });
    if (!userapi) {
      return res.status(400).send({ success: false, message: `ERROR` });
    }
    // console.log(userapi);
    var code = gameIdList[bodydata.gameCode];
    //เส้นเข้าเกม pg
    var resultss = 'https://m.pgsoft-th.com/' + code + '/index.html?language=th&bet_type=1&operator_token=T65-AWDF-WAUE-OQ09-GST1&operator_player_session=' + userapi.token + '&or=cdn.pgsoft-th.com';
    //เส้นเข้าเกม jili
    if (bodydata.game == 'jl') {
      resultss = 'https://jili-server.foxi-bet.com/play/jili?operator_player_session=' + userapi.token + '&operator_token=T65-AWDF-WAUE-OQ09-GST1&game_code=' + bodydata.gameCode + '&game_id=' + jili_list[bodydata.gameCode];
    }
    //เส้นเข้าเกม joker
    else if (bodydata.game == 'joker') {
      resultss = 'https://joker.onsen168.com/play/joker?operator_player_session=' + userapi.token + '&operator_token=T65-AWDF-WAUE-OQ09-GST1&game_code=' + bodydata.gameCode + '&game_id=' + bodydata.gameCode
    }
    //เส้นเข้าเกม pp 
    else if (bodydata.game == 'pp') {
      resultss = 'https://onsen168.com/play/game?operator_player_session=' + userapi.token + '&operator_token=T65-AWDF-WAUE-OQ09-GST1&game_code=' + bodydata.gameCode + '&game_id=' + bodydata.gameCode + '&provider=pracmatic';
    }
  

    //console.log(resultss);
    //   var resultss = await pg_api.loginuser(userapi.userid,bodydata.gameCode,userapi.token);
    return res.json({ success: true, url: resultss });
    //console.log(url);
  } catch (err) {
    console.log("login ERROR", err);
    return res.status(400).send({ success: false, message: `ERROR` });
  }

  //console.log(bodydata);
})
router.post('/setGameSetting', async function (req, res, next) {
  // console.log(req.body);
  try {
    var bodydata = req.body;
    var adminkey = req.headers['x-api-key'];
    var api = await Api.findOne({ apikey: adminkey });
    if (!api) {
      return res.status(400).send({ success: false, message: `ERROR` });
    }
    var userapi = await User.findOne({ apikey: api._id, username: bodydata.username });
    var token = crypto.randomUUID();

    if (!userapi) {
      var id = crypto.randomBytes(16).toString("hex");
      var user = new User();
      user.userid = id;
      user.username = bodydata.username;
      user.apikey = api._id;
      user.data = bodydata;
      user.token = token;
      await user.save();
      bodydata.username = id
      // await pg_api.loginuser(id,'mafia-mayhem','token');
      //await pg_api.loadsetting(bodydata);
    } else {
      userapi.data = bodydata;
      userapi.token = token;
      await userapi.save();
      bodydata.username = userapi.userid
      //await pg_api.loadsetting(bodydata);
    }

    //console.log(userapi);
    return res.json(token);
  } catch (err) {
    console.log("setGameSetting ERROR", err);
    res.status(400).send({ success: false, message: `ERROR` });
  }
  // console.log(userapi);
})

// ===================================================================
// START: โค้ดที่ต้องเพิ่มสำหรับหน้า Dashboard
// ===================================================================

// Middleware to check if user is authenticated
// เราต้องสร้าง middleware นี้ขึ้นมาเพื่อตรวจสอบว่ามีการล็อกอินหรือยัง
const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    }
    // หากไม่มี session ให้ส่ง error 401 Unauthorized
    return res.status(401).json({ error: 'Unauthorized: Please log in.' });
};

// ฟังก์ชันช่วยสร้างเงื่อนไขการค้นหา (เพื่อลดการเขียนโค้ดซ้ำซ้อน)
const buildMatchCondition = (req) => {
    const { start, end } = req.query;
    const userId = new mongoose.Types.ObjectId(req.session.user.id);

    let matchCondition = {
        apikey: userId,
        statusCode: 0
    };

    if (start && end) {
        const [month1, day1, year1] = start.split('/');
        const [month2, day2, year2] = end.split('/');
        const dateTostart = new Date(`${year1}-${month1}-${day1}`);
        const dateToend = new Date(`${year2}-${month2}-${day2}`);
        dateToend.setDate(dateToend.getDate() + 1);

        matchCondition.createdDate = {
            $gte: dateTostart,
            $lt: dateToend
        };
    }
    return matchCondition;
};


// **API ใหม่: /api/user/totals** (สำหรับดึงยอดรวม)
// เนื่องจาก router นี้ถูก mount ที่ /api/ แล้ว เราจึงใช้แค่ /user/totals
router.get('/user/totals', isAuthenticated, async (req, res) => {
    try {
        const matchCondition = buildMatchCondition(req);
        const userTotals = await Transaction.aggregate([
            { $match: matchCondition },
            {
                $group: {
                    _id: null,
                    total_bet: { $sum: '$betAmount' },
                    total_win: { $sum: '$payoutAmount' }
                }
            }
        ]).exec();

        res.json({
            totals: userTotals.length > 0 ? userTotals[0] : { total_bet: 0, total_win: 0 }
        });

    } catch (error) {
        console.error('Error fetching user totals:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// **API ใหม่: /api/user/history** (สำหรับดึงประวัติ)
// router นี้ถูก mount ที่ /api/ แล้ว เราจึงใช้แค่ /user/history
router.get('/user/history', isAuthenticated, async (req, res) => {
    try {
        const matchCondition = buildMatchCondition(req);
        const history = await Transaction.find(matchCondition)
            .sort({ createdDate: -1 })
            .limit(500)
            .select('data.username betAmount payoutAmount createdDate')
            .lean();

        res.json({ history: history });

    } catch (error) {
        console.error('Error fetching user history:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;