const moment = require('moment');
const axios = require('axios'); 
const options = { hour12: false, hour: '2-digit', minute: '2-digit' };

// zum ändern ab hier

const summeDpAnlegen = false;   // einmalig manuell für 24h auf true setzten, es werden summen Dp's angelegt   <<<<<<<<-----------------------------------  wichtig

const seite1 = "xxxx-xxxx-xxxx-xxxx";
const seite2 = "yyyy-yyyy-yyyy-yyyy";
const key_id = "zzzzzzzzzzzzzzzzzzzzzzzzzzzzz";
const name1 = 'garten';         // name dp1    
const name2 = 'strasse';        // name dp2
const gesamt = 'gesamt';        // dp für zusammenrechnen muss in ladenNachPrognose angepasst werden wenn hier geändert

const influxDb = true;   // wenn influxDB output erwünscht für grafana 
const influxDbMeasurement = 'pvforecast.0.summary.power';
const influxInstance = 'influxdb.0';

const mainObject = '0_userdata.0.strom.pvforecast';
const mainObjectToday = '0_userdata.0.strom.pvforecast.today';
const mainObjectTomorrow = '0_userdata.0.strom.pvforecast.tomorrow';
const summeDpAnlegen = false;   // einmalig für 24h auf true setzten, es werden summen Dp's angelegt
const abbrechenBei = '00:00';   // ab wieviel Uhr kommt nix mehr, kann so bleiben
// bis hier

const baseUrl = "https://api.solcast.com.au/rooftop_sites/";
const hours = 24;
// ------------------------------------------------------------------------------------------------------------------

//  erzeuge einmal in der nacht gesamt
schedule('0 2 * * *', function () {
    initialPV();
});

// 10 request sind frei bei solcast.com
schedule('1 5,7,9,10 * * *', function () {
    const url = `${seite2}/forecasts?format=json&api_key=${key_id}`;
    toLog(`Hole PV ${name2}`, true);
    requestData(url, name2);
});

schedule('1 6,8,12,13,14 15 * *', function () {
    const url2 = `${seite1}/forecasts?format=json&api_key=${key_id}`;
    toLog(`Hole PV ${name1}`, true);
    requestData(url2, name1);
});

// ------------------------------------------------------------------------------------------------------------------

/*************** ab hier nix ändern  ***************************** */

async function requestData(seiteUrl, seite) {
    const url = `${baseUrl}${seiteUrl}`;   

    let response;

    try {
        response = await axios({
            timeout: 5000,
            url: url,
            method: 'get'
        });
    } catch {
        console.warn('too many requests');
    }

    if (response && response.status === 200) {

        console.warn('response ' + JSON.stringify(response.data));

        const array = response.data.forecasts;
        const list = [];     

        let heute = true;

        for (let i = 0; i < array.length; i++) {
            const endtime = Date.parse(array[i].period_end);
            const startTime = new Date(endtime - 1800000);
            const readpwr = array[i].pv_estimate;
            const readpwr90 = array[i].pv_estimate90;
            const watt = Math.round(readpwr * 1000);

            list[i] = {
                time: startTime / 1000,
                watt: watt,
                watt90: Math.round(readpwr90 * 1000),
            };
        }

        const startTime = new Date(list[0].time * 1000);
        const startDPTime = startTime.toLocaleTimeString('de-DE', options);

        let ind = 0;

        setTimeout(function () {   // warte 5 sekunden falls dp noch nicht angelegt
            // finde startzeit
            for (ind = 0; ind < hours * 2; ind++) {
                const startTimeind = getState(mainObjectToday + '.' + seite + '.' + ind + '.startTime').val;
                if (startDPTime == startTimeind) {
                    break;
                }
            }

            //console.warn('start ind ' + ind + ' auf seite ' + seite);

            let listenDP = -1;    // damit ich auf 0 komme bei ersten lauf
            let posiA = ind - 1;
            let schonGebucht = false;
            
            let powerWGes = 0;
            let power90WGes = 0;

            for (let a = 0; a < hours * 4; a++) {
                listenDP += 1;

                if (list[listenDP] == undefined) {
                    break;
                }

                const start = new Date(list[listenDP].time * 1000);
                const end = new Date(list[listenDP].time * 1000 + 1800000);

                const startTime = start.toLocaleTimeString('de-DE', options);
                const endTime = end.toLocaleTimeString('de-DE', options);

                if (startTime == abbrechenBei) {   // wir brauchen nur bis nachts
                    if (schonGebucht) {
                        break;
                    }
                    if (!schonGebucht) {
                        heute = false;
                        posiA = -1;                     
                        schonGebucht = true;
                    }
                }

                posiA += 1;

                let stateBaseName1 = `${mainObjectToday}.${name1}.${posiA}.`;
                let stateBaseName2 = `${mainObjectToday}.${name2}.${posiA}.`;
                let stateBaseNameGes = `${mainObjectToday}.${gesamt}.${posiA}.`;

                if (!heute) {
                    stateBaseName1 = `${mainObjectTomorrow}.${name1}.${posiA}.`;
                    stateBaseName2 = `${mainObjectTomorrow}.${name2}.${posiA}.`;
                    stateBaseNameGes = `${mainObjectTomorrow}.${gesamt}.${posiA}.`;
                }

                const powerW = list[listenDP].watt / 2;      // es kommen 2 DP pro stunde also teilen
                const power90W = list[listenDP].watt90 / 2;

                 if (seite == name1) {
                    setState(stateBaseName1 + 'power', powerW, true);
                    setState(stateBaseName1 + 'power90', power90W, true);
                    
                    const powerWName2 = getState(stateBaseName2 + 'power').val;
                    const powerW90Name2 = getState(stateBaseName2 + 'power90').val;

                    powerWGes = powerW + powerWName2;
                    power90WGes = power90W + powerW90Name2;
                }

                if (seite == name2) {
                    setState(stateBaseName2 + 'power', powerW, true);
                    setState(stateBaseName2 + 'power90', power90W, true);

                    const powerWName1 = getState(stateBaseName1 + 'power').val;
                    const power90WName1 = getState(stateBaseName1 + 'power90').val;

                    powerWGes = powerW + powerWName1;
                    power90WGes = power90W + power90WName1;
                }                             

                setState(stateBaseNameGes + 'power', parseInt((powerWGes).toFixed(3)), true);
                setState(stateBaseNameGes + 'power90', parseInt((power90WGes).toFixed(3)), true);               
            }

            genGraphAnlegen(true);    // erzeuge today
            genGraphAnlegen(false);   // erzeuge tomorrow

        }, 5000);
        await setStateAsync(`${mainObject}.lastUpdated`, { val: moment().valueOf(), ack: true });
    }
}

// --------------------------------------------------------------------

async function initialPV() {
    await seiteAnlegen(name1);
    await seiteAnlegen(name2);
    await seiteAnlegen(gesamt);
}

async function seiteAnlegen(seite) {
    const stunden = 24;
    const startTime = { hour: 0, minute: 30 };
    let dp = mainObjectToday + '.' + seite + '.';
    let ind = 0;

    // Schleife zur Generierung der Zeitfolge today
    if (summeDpAnlegen) {
        for (let hour = 0; hour < stunden; hour++) {
            for (let minute = 0; minute < 60; minute += 30) {

                let stateBaseNameGes = dp + ind + '.';

                if (ind < 48) {    
                    createUserStates('0_userdata.0', false, [stateBaseNameGes + 'startTime', { 'name': 'Gultigkeitsbeginn (Uhrzeit)', 'type': 'string', 'read': true, 'write': false, 'role': 'state' }], function () {
                        setStateAsync(stateBaseNameGes + 'startTime', formatTime(hour, minute), true);
                    });                
                }
                ind += 1;
            }
        }
    }

    ind = 0;

    for (let hour = startTime.hour; hour <= stunden; hour++) {
        for (let minute = (hour === startTime.hour ? startTime.minute : 0); minute < 60; minute += 30) {

            let stateBaseNameGes = dp + ind + '.';

            if (ind < 48) {
                if (hour == 24) {
                    hour = 0;
                }
                if (summeDpAnlegen) {
                    createUserStates('0_userdata.0', false, [stateBaseNameGes + 'endTime', { 'name': 'Gultigkeitsende (Uhrzeit)', 'type': 'string', 'read': true, 'write': false, 'role': 'state' }], function () {
                        setStateAsync(stateBaseNameGes + 'endTime', formatTime(hour, minute), true);
                    });
                }

                createUserStates('0_userdata.0', false, [stateBaseNameGes + 'power', { 'name': 'power', 'type': 'number', 'read': true, 'write': false, 'role': 'value', 'def': 0, 'unit': 'W' }], function () {
                    setStateAsync(stateBaseNameGes + 'power', 0, true);
                });

                createUserStates('0_userdata.0', false, [stateBaseNameGes + 'power90', { 'name': 'power90', 'type': 'number', 'read': true, 'write': false, 'role': 'value', 'def': 0, 'unit': 'W' }], function () {
                    setStateAsync(stateBaseNameGes + 'power90', 0, true);
                });
            }
            ind += 1;
        }
    }

    dp = mainObjectTomorrow + '.' + seite + '.';

    // Schleife zur Generierung der Zeitfolge tomorrow
    if (summeDpAnlegen) {
        ind = 0;
        for (let hour = 0; hour < stunden; hour++) {
            for (let minute = 0; minute < 60; minute += 30) {

                let stateBaseNameGes = dp + ind + '.';

                if (ind < 48) {
                    createUserStates('0_userdata.0', false, [stateBaseNameGes + 'startTime', { 'name': 'Gultigkeitsbeginn (Uhrzeit)', 'type': 'string', 'read': true, 'write': false, 'role': 'state' }], function () {
                        setStateAsync(stateBaseNameGes + 'startTime', formatTime(hour, minute), true);
                    });
                }
                ind += 1;
            }
        }
    }

    ind = 0;

    for (let hour = startTime.hour; hour <= stunden; hour++) {
        for (let minute = (hour === startTime.hour ? startTime.minute : 0); minute < 60; minute += 30) {

            let stateBaseNameGes = dp + ind + '.';

            if (ind < 48) {
                if (hour == 24) {
                    hour = 0;
                }
                if (summeDpAnlegen) {
                    createUserStates('0_userdata.0', false, [stateBaseNameGes + 'endTime', { 'name': 'Gultigkeitsende (Uhrzeit)', 'type': 'string', 'read': true, 'write': false, 'role': 'state' }], function () {
                        setStateAsync(stateBaseNameGes + 'endTime', formatTime(hour, minute), true);
                    });
                }

                createUserStates('0_userdata.0', false, [stateBaseNameGes + 'power', { 'name': 'power', 'type': 'number', 'read': true, 'write': false, 'role': 'value', 'def': 0, 'unit': 'W' }], function () {
                    setStateAsync(stateBaseNameGes + 'power', 0, true);
                });

                createUserStates('0_userdata.0', false, [stateBaseNameGes + 'power90', { 'name': 'power90', 'type': 'number', 'read': true, 'write': false, 'role': 'value', 'def': 0, 'unit': 'W' }], function () {
                    setStateAsync(stateBaseNameGes + 'power90', 0, true);
                });
            }

            ind += 1;
        }
    }

    if (summeDpAnlegen) {
        await kWAnlegen(seite);
    }   
}

async function kWAnlegen(seite) {
    const dp = mainObject + '.';

    createUserStates('0_userdata.0', true, [dp + 'lastUpdated', { 'name': 'power90', 'type': 'number', 'read': true, 'write': false, 'role': 'value.time', 'def': 0 }], function () {
        setStateAsync(dp + 'lastUpdated', 0, true);
    });

    const dp1 = mainObjectToday + '.' + seite + '.';

    createUserStates('0_userdata.0', true, [dp1 + 'today_kW', { 'name': 'power90', 'type': 'number', 'read': true, 'write': false, 'role': 'value', 'def': 0, 'unit': 'W' }], function () {
        setStateAsync(dp1 + 'today_kW', 0, true);
    });

    createUserStates('0_userdata.0', true, [mainObjectToday + '.JSONGraph', { 'name': 'power90', 'type': 'number', 'read': true, 'write': false, 'role': 'json', 'def': '{}' }], function () {
        setStateAsync(mainObjectToday + '.JSONGraph', '{}', true);
    });

    const dp2 = mainObjectTomorrow + '.' + seite + '.';

    createUserStates('0_userdata.0', true, [dp2 + 'tomorrow_kW', { 'name': 'power90', 'type': 'number', 'read': true, 'write': false, 'role': 'value', 'def': 0, 'unit': 'W' }], function () {
        setStateAsync(dp2 + 'tomorrow_kW', 0, true);
    });

    createUserStates('0_userdata.0', true, [mainObjectTomorrow + '.JSONGraph', { 'name': 'power90', 'type': 'number', 'read': true, 'write': false, 'role': 'json', 'def': '{}' }], function () {
        setStateAsync(mainObjectTomorrow + '.JSONGraph', '{}', true);
    });

}


//------------ graph

function genGraphAnlegen(today) {
    let mainObjectGraph = '';
    let tagTag = '';

    if (!today) {
        mainObjectGraph = mainObjectTomorrow;
        tagTag = 'tomorrow_kW';
    } else {
        mainObjectGraph = mainObjectToday;
        tagTag = 'today_kW'
    }
    const jsonGraphData = [];
    const jsonGraphLabels = [];

    let powerWGes = 0;
    let powerWGesName1 = 0;
    let powerWGesName2 = 0;
    //let power90WGes = 0;
    
    for (let posiA = 0; posiA < hours * 2; posiA++) {
    
        let stateBaseNameGes = `${mainObjectGraph}.${gesamt}.${posiA}.`;
        let stateBaseName1 = `${mainObjectGraph}.${name1}.${posiA}.`;
        let stateBaseName2 = `${mainObjectGraph}.${name2}.${posiA}.`;

        const startTime = getState(stateBaseNameGes + 'startTime').val;

        let powerWGesamt  = getState(stateBaseNameGes + 'power').val;
        let powerWName1   = getState(stateBaseName1 + 'power').val;
        let powerWName2   = getState(stateBaseName2 + 'power').val;
         
        //const power90W = getState(stateBaseNameGes + 'power90').val / 2;

        powerWGes = powerWGes + powerWGesamt;
        powerWGesName1 = powerWGesName1 + powerWName1;
        powerWGesName2 = powerWGesName2 + powerWName2;
        //power90WGes = power90WGes + power90W;
    
        if (powerWGesamt > 0) {     
            jsonGraphLabels.push(startTime);                           
            powerWGesamt = Number(Math.round((powerWGesamt * 100)/100)/1000);      
            jsonGraphData.push(powerWGesamt/2);

            if (influxDb) {
                influxDdOutput(startTime, powerWGesamt/2);                
            }
        }       
    }

    setState(`${mainObjectGraph}.${name1}.${tagTag}`,  Number((Math.round(powerWGesName1 /2)/1000).toFixed(3)), true);
    setState(`${mainObjectGraph}.${name2}.${tagTag}`,  Number((Math.round(powerWGesName2 /2)/1000).toFixed(3)), true);
    setState(`${mainObjectGraph}.${gesamt}.${tagTag}`, Number((Math.round(powerWGes /2)/1000).toFixed(3)), true);
    genGraph(jsonGraphLabels, jsonGraphData, mainObjectGraph);
}


function formatTime(hour, minute) {
    return (hour < 10 ? '0' + hour : hour) + ':' + (minute < 10 ? '0' + minute : minute);
}

function addLeadingZero(number) {
    return number < 10 ? '0' + number : number;
}

async function influxDdOutput(startTime, powerW) {
    const stTime = startTime + ':00';
    let currentDate = new Date();
    let formattedDate = currentDate.getFullYear() + '-' + addLeadingZero(currentDate.getMonth() + 1) + '-' + addLeadingZero(currentDate.getDate()) + ' ' + stTime;
    await addToInfluxDB(moment(formattedDate).valueOf(), powerW);
}

async function genGraph(jsonGraphLabels, jsonGraphData, whichDay) {
    let globalunit = 1000;

    // https://github.com/Scrounger/ioBroker.vis-materialdesign/blob/master/README.md
    const jsonGraph = {
        // graph
        data: jsonGraphData,
        type: 'bar',
        legendText: 'PV',
        displayOrder: 1,
        color: '#fffd00',
        tooltip_AppendText: 'kW',
        datalabel_show: true,
        datalabel_rotation: 300,
        datalabel_color: '#cccccc',
        datalabel_fontSize: 14,

        // graph bar chart 
        barIsStacked: true,
        barStackId: 1,

        // graph y-Axis
        yAxis_id: 0,
        yAxis_position: 'left',
        yAxis_show: true,
        yAxis_appendix: 'kW',
        yAxis_step: 5,
        yAxis_max: 13100 / globalunit,
        yAxis_maximumDigits: 3,
    };

    await this.setStateAsync(`${whichDay}.JSONGraph`, { val: JSON.stringify({ 'graphs': [jsonGraph], 'axisLabels': jsonGraphLabels }, null, 2), ack: true });
}

async function addToInfluxDB(timestamp, value) {
    try {
        const result = await this.sendToAsync(influxInstance, 'storeState', {
            id: influxDbMeasurement,
            state: {
                ts: timestamp,
                val: value,
                ack: true,
                from: `system.adapter.javascript`,
                //q: 0
            }
        });			
    } catch (err) {
        console.warn(`[addToInfluxDB] storeState error: ${err}`);
    }
}
