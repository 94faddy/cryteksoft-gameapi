const axios = require("axios")

class api_pg{

    constructor(endpoint="https://agent-api.pgf-asw0uz.com") {
        this._ENDPOINT = endpoint
         this._KEY_NEW = 'U3llNjZVdDc5YzpWRmh4Zk4wS1dCVVFYU2JnOHcyNkMwck9uaUlFRmt4Wg=='
        // this._AGENT = agent
        // this.db_read = func_db
    }

    async get_allgame() {
        try {
            let data = '';

            let config = {
              method: 'get',
              maxBodyLength: Infinity,
              url: this._ENDPOINT+'/seamless/api/v2/games',
              headers: { 
                'x-api-key': this._KEY_NEW
              },
              data : data
            };
            
            const result = await axios.request(config);
           // console.log("ALL GAME",result);
            return result.data
          //  console.log(this._KEY_NEW);
           

        } catch (err) {
         // console.log("ALL GAME",err);
         return 'error'
        }
    }
    async get_alluser() {
        try {
            let data = '';

            let config = {
              method: 'post',
              maxBodyLength: Infinity,
              url: this._ENDPOINT+'/seamless/api/v2/players',
              headers: { 
                'x-api-key': this._KEY_NEW
              },
              data : data
            };
            
            const result = await axios.request(config);

            return result.data
          //  console.log(this._KEY_NEW);
           

        } catch (err) {
            if (err.response) {
                return err.response.data
            } else {
                return String(err)

            }
        }
    }
     async getSettings() {
        try {
            
            let data = '';
            let config = {
              method: 'post',
              maxBodyLength: Infinity,
              url: this._ENDPOINT+'/seamless/api/v2/getSettings',
              headers: { 
                'x-api-key': this._KEY_NEW
              },
              data : data
            };
            
            const result = await axios.request(config);
            
            return result.data
          //  console.log(this._KEY_NEW);
           

        } catch (err) {
            if (err.response) {
                return err.response.data
            } else {
                return String(err)

            }
        }
    }
    async getSettingByGameCode(gamecode) {
      try {
       
          let data = JSON.stringify({
            "gameCode": gamecode
          });
          let config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: this._ENDPOINT+'/seamless/api/v2/getSettingByGameCode',
            headers: { 
              'x-api-key': this._KEY_NEW,
              'Content-Type': 'application/json'
            },
            data : data
          };
          
          const result = await axios.request(config);
          console.log("OK",result.data)
          return result.data
         
        //  console.log(this._KEY_NEW);
         

      } catch (err) {
          if (err.response) {
            console.log("Error",err.response)
              return err.response.data
          } else {
              return String(err)

          }
      }
    }
    async loadsetting(bodydata) {

       // console.log(bodydata);
    try {
   // console.log(bodydata);
    let config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: 'https://onsen168.com/web-api/saveSetting',
      headers: { 
        'x-api-key': this._KEY_NEW,
        'Content-Type': 'application/json'
      },
      data : bodydata
    };
    
    const result = await axios.request(config);
    console.log("loadsetting",result.data)
    return result.data
    
    } catch (err) {
      if (err.response) {
        console.log("Error",err.response)
          return err.response.data
      } else {
          return String(err)

      }
    }



    }
    async loadsettingBy(user,gamecode,bytb) {
      var dbload = await this.db_read.get_loadsetting()
      if(bytb == 'user'){
        var get_user= await this.db_read.get_settingPGuser(user);
      }else if(bytb == 'game'){
        var get_user= await this.db_read.get_settingPGuser(gamecode);
      }
      if(get_user !== 'not found'){
        var data2 = get_user
        for (let i = 0; i < dbload.length; i++) {
          const item = dbload[i];
          const itemName = item.name;
        
          // Check if the name exists in data2
          if (data2.hasOwnProperty(itemName)) {
            // Update the value property with the corresponding value from data2
            item.value = data2[itemName];
          }
        }
        

      }
      
      
      let myloadsetting = {};
      dbload.map((val) => {
        myloadsetting = { ...myloadsetting, [val.name]: val.value };
      });
      
     try {
      let data = JSON.stringify({
        "gameCode": gamecode,
        "setting": [
          {
            "name": "normal-spin",
            "output": "normal-spin",
            "percent": parseInt(myloadsetting['normal-spin'])
          },
          {
            "name": "less-bet",
            "output": "less-bet",
            "percent": parseInt(myloadsetting['less-bet']),
            "option": {
              "from": parseInt(myloadsetting['less-bet-from']),
              "to": parseInt(myloadsetting['less-bet-to'])
            }
          },
          {
            "name": "more-bet",
            "output": "more-bet",
            "percent": parseInt(myloadsetting['more-bet']),
            "option": {
              "from": parseInt(myloadsetting['more-bet-from']),
              "to": parseInt(myloadsetting['more-bet-to'])
            }
          },
          {
            "name": "freespin-less-bet",
            "output": "freespin-less-bet",
            "percent": parseInt(myloadsetting['freespin-less-bet']),
            "option": {
              "from": parseInt(myloadsetting['freespin-less-bet-from']),
              "to": parseInt(myloadsetting['freespin-less-bet-to'])
            }
          },
          {
            "name": "freespin-more-bet",
            "output": "freespin-more-bet",
            "percent": parseInt(myloadsetting['freespin-more-bet']),
            "option": {
              "from": parseInt(myloadsetting['freespin-more-bet-from']),
              "to": parseInt(myloadsetting['freespin-more-bet-to'])
            }
          }
        ],
        "username": user,
        "isPlayerSetting": true,
        "buyFeatureSetting": [
          {
            "name": "buy-feature-less-bet",
            "output": "freespin-less-bet",
            "percent": parseInt(myloadsetting['buy-feature-less-bet']),
            "option": {
              "from": parseInt(myloadsetting['buy-feature-less-bet-from']),
              "to": parseInt(myloadsetting['buy-feature-less-bet-to'])
            }
          },
          {
            "name": "buy-feature-more-bet",
            "output": "freespin-more-bet",
            "percent": parseInt(myloadsetting['buy-feature-more-bet']),
            "option": {
              "from": parseInt(myloadsetting['buy-feature-more-bet-from']),
              "to": parseInt(myloadsetting['buy-feature-more-bet-to'])
            }
          }
        ]
    });
   
    let config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: this._ENDPOINT+'/seamless/api/v2/setGameSetting',
      headers: { 
        'x-api-key': this._KEY_NEW,
        'Content-Type': 'application/json'
      },
      data : data
    };
    
    const result = await axios.request(config);
    console.log("OK USER GAME",data)
    return result.data
    
    } catch (err) {
      if (err.response) {
        console.log("Error",err.response)
          return err.response.data
      } else {
          return String(err)

      }
    }



    }
    async loginuser(user,gamecode,sessionToken) {
      try {
          let data = JSON.stringify({
            "username": user,
            "gameCode": gamecode,
            "sessionToken": sessionToken,
            "language": "th"
          });

          let config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: this._ENDPOINT+'/seamless/api/v2/login',
            headers: { 
              'x-api-key': this._KEY_NEW , 
              'Content-Type': 'application/json'
            },
            data : data
          };
          
          const result = await axios.request(config);

          return result.data
        //  console.log(this._KEY_NEW);
         

      } catch (err) {
          if (err.response) {
              return err.response.data
          } else {
              return String(err)

          }
      }
    }
    async deluser() {
      try {         
          let data = JSON.stringify({
            "gameCode": "lucky-neko",
            "username": "sdaws"
          });
          let config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: this._ENDPOINT+'/seamless/api/v2/login',
            headers: { 
              'x-api-key': this._KEY_NEW , 
              'Content-Type': 'application/json'
            },
            data : data
          };
          
          const result = await axios.request(config);

          return result.data
        //  console.log(this._KEY_NEW);
         

      } catch (err) {
          if (err.response) {
              return err.response.data
          } else {
              return String(err)

          }
      }
    }
}


module.exports = api_pg