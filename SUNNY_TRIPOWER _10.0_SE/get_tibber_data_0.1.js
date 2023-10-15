const _tibber = 'tibberlink.0.Homes.cccccccccccccccccccccccccccccc.';     // Anpassen!
const _tibberDP1 = '0_userdata.0';
const _tibberDP2 = 'strom.tibber.';
const _tibberDP = _tibberDP1 + '.' + _tibberDP2;


createUserStates(_tibberDP1, false, [_tibberDP2 + 'extra.tibberBestPreisArray', { 'name': 'tibber bester preis als array', 'type':'array', 'read': true, 'write': false, 'role': 'object'}], function () {});       

createUserStates(_tibberDP1, false, [_tibberDP2 + 'extra.tibberBestPreisArrayLang', { 'name': 'tibber bester preis als array', 'type':'array', 'read': true, 'write': false, 'role': 'object'}], function () {}); 

createUserStates(_tibberDP1, false, [_tibberDP2 + 'extra.batterieLadenHH', { 'name': 'max ladeleistung', 'type':'number', 'read': true, 'write': false, 'role': 'state', 'def':0 }], function () {        
        setState(_tibberDP + 'extra.batterieLadenHH', 0, true);
}); 
createUserStates(_tibberDP1, false, [_tibberDP2 + 'extra.tibberBestPreis', { 'name': 'max ladeleistung', 'type':'number', 'read': true, 'write': false, 'role': 'state', 'def':0 }], function () {        
    setState(_tibberDP + 'extra.tibberBestPreis', 0, true);
}); 


holePreis();

function holePreis() {
    let preise = [];
    const options = { hour12: false, hour: '2-digit', minute:'2-digit'};
    const jetzt = new Date();
    const midn = new Date(
                    jetzt.getFullYear(),
                    jetzt.getMonth(),
                    jetzt.getDate(),
                    0,0,0);
                                  
    for(let i = 14; i < 24; i++) {      
        let obj = {};
        
        const stateBaseName = "strom.tibber." + i + ".";
        const idStart = _tibber + 'PricesToday.' + i + '.startsAt';
        const idPreis = _tibber + 'PricesToday.' + i + '.total';
        const startsAt  = getState(idStart).val;
        const start = new Date(startsAt);        
        const end = new Date(Date.parse(startsAt)).getTime()+3600000;            
        const startTime = start.toLocaleTimeString('de-DE', options);
        const startDate = start.toLocaleDateString('de-DE');        
        const endTime = new Date(end).toLocaleTimeString('de-DE', options);
        
        obj.start = start.getHours();
        const preis =  getState(idPreis).val;
        obj.preis = preis;
        preise.push(obj);

        createUserStates('0_userdata.0', false, [stateBaseName + 'startTime', { 'name': 'Gultigkeitsbeginn (Uhrzeit)', 'type':'string', 'read': true, 'write': false, 'role': 'state' }], function () {        
            setState('0_userdata.0.' + stateBaseName + 'startTime', startTime, true);
        });
        createUserStates('0_userdata.0', false, [stateBaseName+ 'startDate', { 'name': 'Gultigkeitsbeginn (Datum)', 'type':'string', 'read': true, 'write': false, 'role': 'state' }], function () {        
            setState('0_userdata.0.' + stateBaseName + 'startDate', startDate, true);
        });
        createUserStates('0_userdata.0', false, [stateBaseName+ 'endTime', { 'name': 'Gultigkeitsende (Uhrzeit)', 'type':'string', 'read': true, 'write': false, 'role': 'state' }], function () {        
            setState('0_userdata.0.' + stateBaseName + 'endTime', endTime, true);
        });
        createUserStates('0_userdata.0', false, [stateBaseName+ 'price', { 'name': 'Preis', 'type':'number', 'read': true, 'write': false, 'role': 'state',  'def':0 }], function () {        
            setState('0_userdata.0.' + stateBaseName + 'price', preis, true);
        });                  
    }
    
    for(let i = 0; i < 14; i++) {
        let obj = {};
        const stateBaseName = "strom.tibber." + i + ".";
        const idStart = _tibber + 'PricesTomorrow.' + i + '.startsAt';
        const idPreis = _tibber + 'PricesTomorrow.' + i + '.total';
        const startsAt  = getState(idStart).val;
        const start = new Date(startsAt);        
        const end = new Date(Date.parse(startsAt)).getTime()+3600000;            
        const startTime = start.toLocaleTimeString('de-DE', options);
        const startDate = start.toLocaleDateString('de-DE');        
        const endTime = new Date(end).toLocaleTimeString('de-DE', options);
        
        obj.start = start.getHours();
        const preis =  getState(idPreis).val;
        obj.preis = preis;
        preise.push(obj);

        createUserStates('0_userdata.0', false, [stateBaseName + 'startTime', { 'name': 'Gultigkeitsbeginn (Uhrzeit)', 'type':'string', 'read': true, 'write': false, 'role': 'state' }], function () {        
            setState('0_userdata.0.' + stateBaseName + 'startTime', startTime, true);
        });
        createUserStates('0_userdata.0', false, [stateBaseName+ 'startDate', { 'name': 'Gultigkeitsbeginn (Datum)', 'type':'string', 'read': true, 'write': false, 'role': 'state' }], function () {        
            setState('0_userdata.0.' + stateBaseName + 'startDate', startDate, true);
        });
        createUserStates('0_userdata.0', false, [stateBaseName+ 'endTime', { 'name': 'Gultigkeitsende (Uhrzeit)', 'type':'string', 'read': true, 'write': false, 'role': 'state' }], function () {        
            setState('0_userdata.0.' + stateBaseName + 'endTime', endTime, true);
        });
        createUserStates('0_userdata.0', false, [stateBaseName+ 'price', { 'name': 'Preis', 'type':'number', 'read': true, 'write': false, 'role': 'state',  'def':0 }], function () {        
            setState('0_userdata.0.' + stateBaseName + 'price', preis, true);
        });  
    }

    errechneBesteUhrzeit(preise);

    preise.sort(function(a, b) {
        return a.preis - b.preis;
    });

    setState(_tibberDP + 'extra.tibberBestPreisArrayLang', preise, true);
}


function errechneBesteUhrzeit(allePreise) {
    let preiseKurz = [];
    for (let i = 0; i < allePreise.length; i++) {
        const obj = allePreise[i];
        const start = obj.start * 1;

        if (start >= 0 && start <=5) {
            preiseKurz.push(obj);
        }       
    };
    
    preiseKurz.sort(function(a, b) {
        return a.preis - b.preis;
    });
   
    startZeit(preiseKurz);
}

function startZeit(preiseKurz) {    
    const obj = preiseKurz[0];
    const start = obj.start * 1;
    const preis = obj.preis * 1;

    preiseKurz.splice(0, 1);

    setState(_tibberDP + 'extra.batterieLadenHH', start, true);
    setState(_tibberDP + 'extra.tibberBestPreis', preis, true);
    setState(_tibberDP + 'extra.tibberBestPreisArray', preiseKurz, true);
}

schedule('57 13 * * *', function() {
    holePreis();      
});
