
const axios = require('axios'); // Import the Axios library

const garten = "xxxxxxxxxxxxxxxxxxxxxxxxxxx";
const strasse = "yyyyyyyyyyyyyyyyyyyyyyyyyyyyyy";

const key_id = "zzzzzzzzzzzzzzzzzzzzzzzzzzz";
let hours = 24;

const baseUrl = "https://api.solcast.com.au/rooftop_sites/";

function requestData(seiteUrl) {
    const url = `${baseUrl}${seiteUrl}`


    axios
        .get(url)
        .then((response) => {
            if (response.status === 200) {
                const array = response.data.forecasts;
                const list = [];

                for (let i = 0; i < array.length; i++) {
                const endtime = Date.parse(array[i].period_end);
                const time = new Date(endtime - 1800000);
                const readpwr = array[i].pv_estimate;
                const readpwr90 = array[i].pv_estimate90;

                list[i] = {
                    time: time / 1000,
                    watt: Math.round(readpwr * 1000),
                    watt90: Math.round(readpwr90 * 1000),
                };
                }

                for (let a = 0; a < hours * 2; a++) {
                const start = new Date(list[a].time * 1000);
                const end = new Date(list[a].time * 1000 + 1800000);

                const options = { hour12: false, hour: '2-digit', minute: '2-digit' };
                const startTime = start.toLocaleTimeString('de-DE', options);
                const endTime = end.toLocaleTimeString('de-DE', options);

                const stateBaseName = "strom.pvforecast." + a + ".";

                createUserStates('0_userdata.0', false, [stateBaseName + 'startTime', { 'name': 'Gultigkeitsbeginn (Uhrzeit)', 'type': 'string', 'read': true, 'write': false, 'role': 'state' }], function () {
                    setState('0_userdata.0.' + stateBaseName + 'startTime', startTime, true);
                });

                createUserStates('0_userdata.0', false, [stateBaseName + 'endTime', { 'name': 'Gultigkeitsende (Uhrzeit)', 'type': 'string', 'read': true, 'write': false, 'role': 'state' }], function () {
                    setState('0_userdata.0.' + stateBaseName + 'endTime', endTime, true);
                });

                createUserStates('0_userdata.0', false, [stateBaseName + 'power', { 'name': 'power', 'type': 'number', 'read': true, 'write': false, 'role': 'state', 'def': 0 }], function () {
                    setState('0_userdata.0.' + stateBaseName + 'power', list[a].watt, true);
                });

                createUserStates('0_userdata.0', false, [stateBaseName + 'power90', { 'name': 'power90', 'type': 'number', 'read': true, 'write': false, 'role': 'state', 'def': 0 }], function () {
                    setState('0_userdata.0.' + stateBaseName + 'power90', list[a].watt90, true);
                });
                }
            }           
        })
        .catch((error) => {
            console.error(error);
    });
}
// 10 request sind frei. hier 6 plus die 2 aus adapter
schedule('1 8,10 * * *', function () {
    const url = `${strasse}/forecasts?format=json&api_key=${key_id}`;
//    toLog('Hole PV Strassenseite', true);
    requestData(url);
});

schedule('1 11,12,13,14 * * *', function () {
    const url = `${garten}/forecasts?format=json&api_key=${key_id}`;
//    toLog('Hole PV Gartenseite', true);
    requestData(url);
});


