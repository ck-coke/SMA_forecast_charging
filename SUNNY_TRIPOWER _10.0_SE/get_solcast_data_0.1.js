
const axios   = require('axios');
const https   = require('https');
const method  = 'GET';
const baseUri = 'https://api.solcast.com.au';

const garten  = "zzzzzzzzzzzzzzzzzzzz";  // 
const strasse = "yyyyyyyyyyyyyyyyyyyyy";  // 

const key_id = "xxxxxxxxxxxxxxxxxxxxxx";
let hours = 24;

const qurl = "/rooftop_sites/" + garten +"/forecasts?format=json&api_key="+ key_id;
    
    requestData(qurl);

function requestData(urlReq) {
    console.log('URI ' + urlReq);

    axios({
        method,
        baseURL: baseUri,
        url: urlReq,     
        timeout: 5000, // wait for 5s       
        validateStatus: (status) => {
            return [200].indexOf(status) > -1;
        },
        httpsAgent: new https.Agent({
            rejectUnauthorized: false,
        }),
        
    })
    .then((response) => {  
        const array = JSON.parse(response.data.result).forecasts;
      
        var list = [];
        for(let i = 0; i < array.length; i++) {
            var endtime = Date.parse(array[i].period_end);
            var time = new Date(endtime-1800000);
            var readpwr = array[i].pv_estimate;
            var readpwr90 = array[i].pv_estimate90;
            list[i] = {};
            list[i].time = time/1000;
            list[i].watt = Math.round(readpwr * 1000);
            list[i].watt90 = Math.round(readpwr90 * 1000);
   //        console.log(list[i].time + ' ' + list[i].watt + ' ' + list[i].watt90);
        };
                
        for(let a = 0; a < (hours*2); a++) {
            let start = new Date((list[a].time)*1000);
            let end = new Date(((list[a].time)*1000)+1800000)
            var options = { hour12: false, hour: '2-digit', minute:'2-digit'};
            let startTime = start.toLocaleTimeString('de-DE', options);
            let endTime = end.toLocaleTimeString('de-DE', options);

            //   console.log(startTime + ',' + endTime + ',' + list[a].watt + ',' + list[a].watt90);

            let stateBaseName = "strom.pvforecast." + a + ".";

            createUserStates('0_userdata.0', false, [stateBaseName + 'startTime', { 'name': 'Gultigkeitsbeginn (Uhrzeit)', 'type':'string', 'read': true, 'write': false, 'role': 'state' }], function () {        
                setState('0_userdata.0.' + stateBaseName + 'startTime', startTime, true);
            });
            createUserStates('0_userdata.0', false, [stateBaseName+ 'endTime', { 'name': 'Gultigkeitsende (Uhrzeit)', 'type':'string', 'read': true, 'write': false, 'role': 'state' }], function () {        
                setState('0_userdata.0.' + stateBaseName + 'endTime', endTime, true);
            });

            createUserStates('0_userdata.0', false, [stateBaseName+ 'power', { 'name': 'power', 'type':'number', 'read': true, 'write': false, 'role': 'state',  'def':0 }], function () {        
                setState('0_userdata.0.' + stateBaseName + 'power', list[a].watt, true);
            });  

            createUserStates('0_userdata.0', false, [stateBaseName+ 'power90', { 'name': 'power90', 'type':'number', 'read': true, 'write': false, 'role': 'state',  'def':0 }], function () {        
                setState('0_userdata.0.' + stateBaseName + 'power90', list[a].watt90, true);
            });                
        }
    })
    .catch((error) => {   
        console.log('ERROR pv forecast ' + error);   
    });

}

// 10 request sind frei. hier 8 plus die 2 aus adapter

schedule('0 8,10,11 * * *', function () {
    const qurl = "/rooftop_sites/" + strasse +"/forecasts?format=json&api_key="+ key_id;
    toLog('Hole PV Strassenseite', true);
    requestData(qurl);
});

schedule('0 12,13,14 * * *', function () {
    const qurl = "/rooftop_sites/" + garten +"/forecasts?format=json&api_key="+ key_id;
    toLog('Hole PV Gartenseite', true);
    requestData(qurl);
});




