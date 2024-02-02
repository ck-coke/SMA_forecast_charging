
const axios = require('axios'); // Import the Axios library

const seite1 = "yyyy-yyyy-yyyy-yyyy";
const seite2 = "zzzz-zzzz-zzzz-zzzz";

const key_id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxx";


const baseUrl = "https://api.solcast.com.au/rooftop_sites/";

const mainObject = '0_userdata.0.strom.pvforecast';
const name1 = 'garten';         // name dp1    
const name2 = 'strasse';        // name dp2

const gesamt = 'gesamt';        // dp für zusammenrechnen
const abbrechenBei = '00:00';   // ab wieveil Uhr kommt nix mehr

let hours = 24;



// ------------------------------------------------------------------------------------------------------------------

//  erzeuge einmal in der nacht gesamt
schedule('0 2 * * *', function () { 
    initialPV();
});

schedule('1 5,9 * * *', function () { 
    const url = `${seite2}/forecasts?format=json&api_key=${key_id}`;
    requestData(url, name2);
});

schedule('1 6,12,13,14 * * *', function () {
    const url2 = `${seite1}/forecasts?format=json&api_key=${key_id}`;
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
   //     await deleteObjectAsync(mainObject + '.' + seite, true);            
        await seiteAnlegen(seite);    
        
        const array = response.data.forecasts;    

     //   console.warn('response seite ' + seite  + '--> ' +  JSON.stringify(response.data));

        const list = [];

        for (let i = 0; i < array.length; i++) {
            const endtime = Date.parse(array[i].period_end);
            const startTime = new Date(endtime - 1800000);
            const readpwr = array[i].pv_estimate;
            const readpwr90 = array[i].pv_estimate90;

            list[i] = {
                time: startTime / 1000,
                watt: Math.round(readpwr * 1000),
                watt90: Math.round(readpwr90 * 1000),
            };   
        }
               
        const startTime = new Date(list[0].time * 1000);        
        const startDPTime = startTime.toLocaleTimeString('de-DE', options);

    //    console.warn('suche startDPTime ' + startDPTime);
        
        let ind = 0;
        
        setTimeout(function () {   // warte 5 sekunden falls dp noch nicht angelegt
        // finde startzeit
            for (ind = 0; ind < hours * 2; ind++) {           
                const startTimeind = getState(mainObject + '.' + seite + '.' + ind + '.startTime').val;  
                if (startDPTime == startTimeind) {                 
       //             console.warn('gefunden startTime ' + startTimeind + ' bei index ' + ind);
                    break;       
                }
            }

      //      console.warn('start ind ' + ind + ' auf seite ' + seite);

            let listenDP = -1;    // dmit ich auf 0 komme bei ersten lauf
            
            for (let a = ind; a < hours * 2; a++) {
                listenDP += 1;

                if (list[listenDP] == undefined) {
                    break;
                }

                const start = new Date(list[listenDP].time * 1000);
                const end = new Date(list[listenDP].time * 1000 + 1800000);
                
                const startTime = start.toLocaleTimeString('de-DE', options);
                const endTime = end.toLocaleTimeString('de-DE', options);

                if (startTime == abbrechenBei) {   // wir brauchen nur bis nachts
                    break;
                }

                let stateBaseName1      = `${mainObject}.${name1}.${a}.`;
                let stateBaseName2      = `${mainObject}.${name2}.${a}.`;
                let stateBaseNameGes    = `${mainObject}.${gesamt}.${a}.`;

                let powerW = list[listenDP].watt;
                let power90W = list[listenDP].watt90;

                // console.warn(`start ${startTime} end ${endTime} powerW ${powerW} powerW90 ${power90W}`);
    
                if (seite == name1) {
                    setState(stateBaseName1 + 'power', powerW, true);
                    setState(stateBaseName1 + 'power90', power90W, true);

                }

                if (seite == name2) {
                    setState(stateBaseName2 + 'power', powerW, true);
                    setState(stateBaseName2 + 'power90', power90W, true);
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

                setState(stateBaseNameGes + 'power', powerWGes, true);
                setState(stateBaseNameGes + 'power90', power90WGes, true);

            }
        }, 5000);   
    } 
}

// --------------------------------------------------------------------

async function initialPV() {
   // await deleteObjectAsync(mainObject + '.' + gesamt, true);
    await seiteAnlegen(gesamt);
}

async function seiteAnlegen(seite) {
    const stunden = 24;
    const dp = mainObject + '.' + seite + '.';
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
    const startTime = { hour: 0, minute: 30 };

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

                createUserStates('0_userdata.0', false, [stateBaseNameGes + 'power', { 'name': 'power', 'type': 'number', 'read': true, 'write': false, 'role': 'state', 'def': 0 }], function () {
                    setStateAsync(stateBaseNameGes + 'power', 0, true);
                });

                createUserStates('0_userdata.0', false, [stateBaseNameGes + 'power90', { 'name': 'power90', 'type': 'number', 'read': true, 'write': false, 'role': 'state', 'def': 0 }], function () {
                    setStateAsync(stateBaseNameGes + 'power90', 0, true);
                });
            }

            ind += 1;
        }
    }
}


function formatTime(hour, minute) {
    return (hour < 10 ? '0' + hour : hour) + ':' + (minute < 10 ? '0' + minute : minute);
}
