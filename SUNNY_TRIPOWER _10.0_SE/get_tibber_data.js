const _tibber = 'tibberlink.0.Homes.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.';     // Anpassen!

const _tibberDP1 = '0_userdata.0';
const _tibberDP2 = 'strom.tibber.';
const _tibberDP = _tibberDP1 + '.' + _tibberDP2;
const heute  = 'PricesToday.';
const morgen = 'PricesTomorrow.';
const _options = { hour12: false, hour: '2-digit', minute: '2-digit' };


//createUserStates(userDataDP, false, [tibberStromDP + 'extra.tibberNutzenManuellHH', { 'name': 'nutze Tibber Preise manuell ab Stunde ', 'type': 'number', 'read': true, 'write': false, 'role': 'value', 'def': 0 }], function () {
//    setState(tibberDP + 'extra.tibberNutzenManuellHH', 0, true);
//});

createUserStates(_tibberDP1, false, [_tibberDP2 + 'extra.tibberBestPreisArray', { 'name': 'tibber bester preis als array', 'type':'array', 'read': true, 'write': false, 'role': 'object'}], function () {  });       
createUserStates(_tibberDP1, false, [_tibberDP2 + 'extra.tibberBestPreisArrayLang', { 'name': 'tibber bester preis als array', 'type':'array', 'read': true, 'write': false, 'role': 'object'}], function () {  }); 

createUserStates(_tibberDP1, false, [_tibberDP2 + 'extra.tibberBestPreis', { 'name': 'tibber Best Preis', 'type':'number', 'read': true, 'write': false, 'role': 'state', 'def':0 , "unit": "ct" }], function () {      
  setState(_tibberDP + 'extra.tibberBestPreis', 0, true);
}); 

createUserStates(_tibberDP1, false, [_tibberDP2 + 'extra.tibberPreisJetzt', { 'name': 'tibber Preis Jetzt', 'type':'number', 'read': true, 'write': false, 'role': 'state', 'def':0, "unit": "ct" }], function () {        
  setState(_tibberDP + 'extra.tibberPreisJetzt', 0, true);
}); 
createUserStates(_tibberDP1, false, [_tibberDP2 + 'extra.tibberPreisNächsteStunde', { 'name': 'tibber Preis Nächste Stunde', 'type':'number', 'read': true, 'write': false, 'role': 'state', 'def':0, "unit": "ct" }], function () {        
  setState(_tibberDP + 'extra.tibberPreisNächsteStunde', 0, true);
}); 

createUserStates(_tibberDP1, false, [_tibberDP2 + 'extra.tibberLevelJetzt', { 'name': 'tibber Level', 'type':'string', 'read': true, 'write': false, 'role': 'state' }], function () {        
  setState(_tibberDP + 'extra.tibberLevelJetzt', 'NORMAL', true);
}); 
createUserStates(_tibberDP1, false, [_tibberDP2 + 'extra.tibberLevelNächsteStunde', { 'name': 'tibber next Level', 'type':'string', 'read': true, 'write': false, 'role': 'state' }], function () {        
  setState(_tibberDP + 'extra.tibberLevelNächsteStunde', 'NORMAL', true);
}); 


if (getHH() > 13) {
    holePreis(heute,morgen);
} else {
    holePreis(heute,heute);
}


aktualisiereStunde();

function holePreis(preisHeute,preisMorgen) {
    let preise = [];
    
    for(let i = 14; i < 24; i++) {      
        let obj = {};
        
        const stateBaseName = _tibberDP2 + i + ".";
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
        createUserStates('0_userdata.0', false, [stateBaseName+ 'price', { 'name': 'Preis', 'type':'number', 'read': true, 'write': false, 'role': 'state',  'def':0, "unit": "ct" }], function () {       
            setState('0_userdata.0.' + stateBaseName + 'price', preis, true);
        });   
        createUserStates('0_userdata.0', false, [stateBaseName+ 'level', { 'name': 'Preis Level', 'type':'string', 'read': true, 'write': false, 'role': 'text',  'def': '' }], function () {        
            setState('0_userdata.0.' + stateBaseName + 'level', levelText, true);
        });  
    }
    
    for(let i = 0; i < 14; i++) {
        let obj = {};
        const stateBaseName = _tibberDP2 + i + ".";
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
        createUserStates('0_userdata.0', false, [stateBaseName+ 'price', { 'name': 'Preis', 'type':'number', 'read': true, 'write': false, 'role': 'state',  'def':0, "unit": "ct" }], function () {      
            setState('0_userdata.0.' + stateBaseName + 'price', preis, true);
        });  
        createUserStates('0_userdata.0', false, [stateBaseName+ 'level', { 'name': 'Preis Level', 'type':'string', 'read': true, 'write': false, 'role': 'text',  'def': '' }], function () {        
            setState('0_userdata.0.' + stateBaseName + 'level', levelText, true);
        });  
    }

    let preiseLang = preise;
    preiseLang.sort(function(a, b) {
        return a.start - b.start;
    });

    setState(_tibberDP + 'extra.tibberBestPreisArrayLang', preiseLang, true);

    errechneBesteUhrzeit(preise);
    
}


function errechneBesteUhrzeit(allePreise) {
    const [niedrigsterIndex, zweitNiedrigsterIndex] = findeBenachbarteNiedrigstePreise(allePreise);
    const preiseKurzArr = [];

    preiseKurzArr.push(allePreise[niedrigsterIndex]);
    preiseKurzArr.push(allePreise[zweitNiedrigsterIndex]);
    startZeit(preiseKurzArr);
}

function findeBenachbarteNiedrigstePreise(preisArray) {     
    let niedrigsterPreis = Number.POSITIVE_INFINITY;
    let zweitNiedrigsterPreis = Number.POSITIVE_INFINITY;
    let niedrigsterPreisIndex = -1;
    let zweitNiedrigsterPreisIndex = -1;

    for (let i = 0; i < preisArray.length; i++) {
        if (preisArray[i].preis < niedrigsterPreis) {
            zweitNiedrigsterPreis = niedrigsterPreis;
            zweitNiedrigsterPreisIndex = niedrigsterPreisIndex;
            niedrigsterPreis = preisArray[i].preis;
            niedrigsterPreisIndex = i;
        } else if (preisArray[i].preis < zweitNiedrigsterPreis) {
            zweitNiedrigsterPreis = preisArray[i].preis;
            zweitNiedrigsterPreisIndex = i;
        }
    }
    return [niedrigsterPreisIndex, zweitNiedrigsterPreisIndex];
}

function startZeit(preiseKurz) {    
    const obj = preiseKurz[0];
    const start = obj.start * 1;
    const preis = obj.preis * 1;

    preiseKurz.splice(0, 1);

    setState(_tibberDP + 'extra.tibberNutzenManuellHH', start, true);
    setState(_tibberDP + 'extra.tibberBestPreis', preis, true);
    setState(_tibberDP + 'extra.tibberBestPreisArray', preiseKurz, true);
}


function aktualisiereStunde() {
    let stunde = Number(getHH());

    setState(_tibberDP + 'extra.tibberPreisJetzt' , getState(_tibberDP + stunde + '.price'/*Preis*/).val, true);
    setState(_tibberDP + 'extra.tibberLevelJetzt' , getState(_tibberDP + stunde + '.level'/*level*/).val, true);
    
    stunde = stunde + 1;
    if (stunde == 24) {
        stunde = 0;
    }

    setState(_tibberDP + 'extra.tibberPreisNächsteStunde' , getState(_tibberDP + stunde + '.price'/*Preis*/).val, true);
    setState(_tibberDP + 'extra.tibberLevelNächsteStunde' , getState(_tibberDP + stunde + '.level'/*level*/).val, true);
}

schedule('*/60 14-23 * * *', function() {
    holePreis(heute,morgen);     
});

schedule('*/60 0-14 * * *', function() {
    holePreis(heute,heute);     
});

schedule('1 * * * *', function() {
    aktualisiereStunde();
});
  
