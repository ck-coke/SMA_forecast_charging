const moment = require('moment');
const axios = require('axios'); 

const seite1 = "yyyy-yyyy-yyyy-yyyy";
const seite2 = "zzzz-zzzz-zzzz-zzzz";

const key_id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
const baseUrl = "https://api.solcast.com.au/rooftop_sites/";

const mainObject = '0_userdata.0.strom.pvforecast';
const mainObjectToday = '0_userdata.0.strom.pvforecast.today';
const mainObjectTomorrow = '0_userdata.0.strom.pvforecast.tomorrow';
const hours = 24;

// -----------      ab hier darf angepasst werden
const summeDpAnlegen = false;   // einmalig für 24h auf true setzten, es werden summen Dp's angelegt

const name1 = 'garten';         // name dp1    
const name2 = 'strasse';        // name dp2
const gesamt = 'gesamt';        // dp für zusammenrechnen
const abbrechenBei = '00:00';   // ab wieviel Uhr kommt nix mehr

// bis hier ------------------------------------------------------------------------------------------------------------------

//  initialisiere einmal in der nacht gesamt
schedule('0 2 * * *', function () {
    initialPV();
});

schedule('1 5,9 * * *', function () {
    const url = `${seite2}/forecasts?format=json&api_key=${key_id}`;
    toLog(`Hole PV ${name2}`, true);
    requestData(url, name2);
});

schedule('1 6,12,13,14 * * *', function () {
    const url2 = `${seite1}/forecasts?format=json&api_key=${key_id}`;
    toLog(`Hole PV ${name1}`, true);
    requestData(url2, name1);
});

// ------------------------------------------------------------------------------------------------------------------





/*************** ab hier nix ändern  ***************************** */

async function requestData(seiteUrl, seite) {
    const url = `${baseUrl}${seiteUrl}`
    const options = { hour12: false, hour: '2-digit', minute: '2-digit' };

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

    // console.warn('PV requestData ' + response.status);

    if (response && response.status === 200) {

        // lösche und erzeuge neu für die abfrage damit die zeiten zueinander passen  
        //  console.warn('lösche ' + mainObject + '.' + seite);
        //    await deleteObjectAsync(mainObject + '.' + seite, true);            
        await seiteAnlegen(seite);

        const array = response.data.forecasts;

        const jsonGraphDataToday = [];
        const jsonGraphLabelsToday = [];
        const jsonGraphDataTomorrow = [];
        const jsonGraphLabelsTomorrow = [];
        const list = [];
        let todaySum = 0;
        let tomorrowSum = 0;

        let name1Sum = 0;
        let name2Sum = 0;

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

                        if (name1Sum > 0) {
                            setState(`${mainObjectToday}.${seite}.today_kW`, parseInt((name1Sum / 1000).toFixed(3)), true);
                        }

                        if (name2Sum > 0) {
                            setState(`${mainObjectToday}.${seite}.today_kW`, parseInt((name2Sum / 1000).toFixed(3)), true);
                        }

                        name1Sum = 0;
                        name2Sum = 0;
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

                let powerW = list[listenDP].watt;
                let power90W = list[listenDP].watt90;

                if (seite == name1) {
                    setState(stateBaseName1 + 'power', powerW, true);
                    setState(stateBaseName1 + 'power90', power90W, true);
                    name1Sum = name1Sum + powerW;
                }

                if (seite == name2) {
                    setState(stateBaseName2 + 'power', powerW, true);
                    setState(stateBaseName2 + 'power90', power90W, true);
                    name2Sum = name2Sum + powerW;
                }

                let powerWName1 = 0;
                let power90WName1 = 0;
                let powerWName2 = 0;
                let powerW90Name2 = 0;
                let powerWGes = 0;
                let power90WGes = 0;

                if (seite == name1) {
                    powerWName2 = getState(stateBaseName2 + 'power').val;
                    powerW90Name2 = getState(stateBaseName2 + 'power90').val;

                    powerWGes = powerW + powerWName2;
                    power90WGes = power90W + powerW90Name2;
                }

                if (seite == name2) {
                    powerWName1 = getState(stateBaseName1 + 'power').val;
                    power90WName1 = getState(stateBaseName1 + 'power90').val;

                    powerWGes = powerW + powerWName1;
                    power90WGes = power90W + power90WName1;
                }

                setState(stateBaseNameGes + 'power', parseInt((powerWGes).toFixed(3)), true);
                setState(stateBaseNameGes + 'power90', parseInt((power90WGes).toFixed(3)), true);
                
                if (heute) {
                    todaySum = todaySum + powerWGes;
                } else {
                    tomorrowSum = tomorrowSum + powerWGes;
                }
    
    // für graphen
                const timeMoment = moment(start);
                const timeInCustomFormat = timeMoment.format('HH:mm');

                if (heute && powerWGes > 0) {
                    jsonGraphLabelsToday.push(timeInCustomFormat);
                    jsonGraphDataToday.push(powerWGes / 1000);
                }

                if (!heute && powerWGes > 0) {
                    jsonGraphLabelsTomorrow.push(timeInCustomFormat);
                    jsonGraphDataTomorrow.push(powerWGes / 1000);
                }

                setState(`${mainObjectToday}.${gesamt}.today_kW`, parseInt((todaySum / 1000).toFixed(3)), true);
                setState(`${mainObjectTomorrow}.${gesamt}.tomorrow_kW`, parseInt((tomorrowSum / 1000).toFixed(3)), true);
            }

            if (name1Sum > 0) {
                setState(`${mainObjectTomorrow}.${seite}.tomorrow_kW`, parseInt((name1Sum / 1000).toFixed(3)), true);
            }

            if (name2Sum > 0) {
                setState(`${mainObjectTomorrow}.${seite}.tomorrow_kW`, parseInt((name2Sum / 1000).toFixed(3)), true);
            }

            genGraph(jsonGraphLabelsToday, jsonGraphDataToday, mainObjectToday);
            genGraph(jsonGraphLabelsTomorrow, jsonGraphDataTomorrow,mainObjectTomorrow);

        }, 5000);
        await setStateAsync(`${mainObject}.lastUpdated`, { val: moment().valueOf(), ack: true });
    }
}
// --------------------------------------------------------------------

async function initialPV() {
    // await deleteObjectAsync(mainObject + '.' + gesamt, true);
    await seiteAnlegen(gesamt);
}



async function seiteAnlegen(seite) {
    const stunden = 24;
    const startTime = { hour: 0, minute: 30 };
    let dp = mainObjectToday + '.' + seite + '.';
    let ind = 0;

    // Schleife zur Generierung der Zeitfolge

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

    ind = 0;

    for (let hour = startTime.hour; hour <= stunden; hour++) {
        for (let minute = (hour === startTime.hour ? startTime.minute : 0); minute < 60; minute += 30) {

            let stateBaseNameGes = dp + ind + '.';

            if (ind < 48) {
                if (hour == 24) {
                    hour = 0;
                }

                createUserStates('0_userdata.0', false, [stateBaseNameGes + 'endTime', { 'name': 'Gultigkeitsende (Uhrzeit)', 'type': 'string', 'read': true, 'write': false, 'role': 'state' }], function () {
                    setStateAsync(stateBaseNameGes + 'endTime', formatTime(hour, minute), true);
                });

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
    ind = 0;

    // Schleife zur Generierung der Zeitfolge
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

    ind = 0;

    for (let hour = startTime.hour; hour <= stunden; hour++) {
        for (let minute = (hour === startTime.hour ? startTime.minute : 0); minute < 60; minute += 30) {

            let stateBaseNameGes = dp + ind + '.';

            if (ind < 48) {
                if (hour == 24) {
                    hour = 0;
                }

                createUserStates('0_userdata.0', false, [stateBaseNameGes + 'endTime', { 'name': 'Gultigkeitsende (Uhrzeit)', 'type': 'string', 'read': true, 'write': false, 'role': 'state' }], function () {
                    setStateAsync(stateBaseNameGes + 'endTime', formatTime(hour, minute), true);
                });

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

function formatTime(hour, minute) {
    return (hour < 10 ? '0' + hour : hour) + ':' + (minute < 10 ? '0' + minute : minute);
}

//------------ graph

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

