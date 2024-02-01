const _tibber = 'tibberlink.0.Homes.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.';     // Anpassen!
const _tibberDP1 = '0_userdata.0';
const _tibberDP2 = 'strom.tibber.';
const _tibberDP = _tibberDP1 + '.' + _tibberDP2;
const heute  = 'PricesToday.';
const morgen = 'PricesTomorrow.';

createUserStates(_tibberDP1, false, [_tibberDP2 + 'extra.tibberBestPreisArray', { 'name': 'tibber bester preis als array', 'type':'array', 'read': true, 'write': false, 'role': 'object'}], function () {  });       
createUserStates(_tibberDP1, false, [_tibberDP2 + 'extra.tibberBestPreisArrayLang', { 'name': 'tibber bester preis als array', 'type':'array', 'read': true, 'write': false, 'role': 'object'}], function () {  }); 
createUserStates(_tibberDP1, false, [_tibberDP2 + 'extra.batterieLadenHH', { 'name': 'batterieLadenHH', 'type':'number', 'read': true, 'write': false, 'role': 'state', 'def':0 }], function () {        
        setState(_tibberDP + 'extra.batterieLadenHH', 0, true);
}); 
createUserStates(_tibberDP1, false, [_tibberDP2 + 'extra.tibberBestPreis', { 'name': 'tibberBestPreis', 'type':'number', 'read': true, 'write': false, 'role': 'state', 'def':0 }], function () {        
    setState(_tibberDP + 'extra.tibberBestPreis', 0, true);
}); 

holePreis(heute,heute);

function holePreis(preisHeute,preisMorgen) {
    let preise = [];
    const options = { hour12: false, hour: '2-digit', minute:'2-digit'};
   
    for(let i = 14; i < 24; i++) {      
        let obj = {};
        
        const stateBaseName = "strom.tibber." + i + ".";
        const idStart = _tibber + preisHeute + i + '.startsAt';
        const idPreis = _tibber + preisHeute + i + '.total';
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
        const level = _tibber + preisHeute + i + '.level';
        const levelText  = getState(level).val;

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
        createUserStates('0_userdata.0', false, [stateBaseName+ 'level', { 'name': 'Preis Level', 'type':'string', 'read': true, 'write': false, 'role': 'text',  'def': '' }], function () {        
            setState('0_userdata.0.' + stateBaseName + 'level', levelText, true);
        });  
    }
    
    for(let i = 0; i < 14; i++) {
        let obj = {};
        const stateBaseName = "strom.tibber." + i + ".";
        const idStart = _tibber + preisMorgen + i + '.startsAt';
        const idPreis = _tibber + preisMorgen + i + '.total';
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
    
        const level = _tibber + preisMorgen + i + '.level';
        const levelText  = getState(level).val;

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
        createUserStates('0_userdata.0', false, [stateBaseName+ 'level', { 'name': 'Preis Level', 'type':'string', 'read': true, 'write': false, 'role': 'text',  'def': '' }], function () {        
            setState('0_userdata.0.' + stateBaseName + 'level', levelText, true);
        });  
    }

    errechneBesteUhrzeit(preise);

    preise.sort(function(a, b) {
        return a.start - b.start;
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


schedule('*/60 14-23 * * *', function() {
    holePreis(heute,morgen);     
});

schedule('*/60 0-14 * * *', function() {
    holePreis(heute,heute);     
});

schedule('0 * * * *', function() {
    let stunde = getHH();       
    setState('0_userdata.0.strom.tibber.extra.tibberJetzt' , getState('0_userdata.0.strom.tibber.' + stunde + '.price'/*Preis*/).val, true);
    setState('0_userdata.0.strom.tibber.extra.tibberJetztLevel' , getState('0_userdata.0.strom.tibber.' + stunde + '.level'/*level*/).val, true);
    
    stunde += 1;
    if (stunde == 24) {
        stunde = 0;
    }

    setState('0_userdata.0.strom.tibber.extra.tibberNächsteStunde' , getState('0_userdata.0.strom.tibber.' + stunde + '.price'/*Preis*/).val, true);
    setState('0_userdata.0.strom.tibber.extra.tibberNächsteStundeLevel' , getState('0_userdata.0.strom.tibber.' + stunde + '.level'/*level*/).val, true);


});