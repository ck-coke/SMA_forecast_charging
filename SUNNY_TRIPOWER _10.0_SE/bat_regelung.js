const userDataDP            = '0_userdata.0';
const tibberStromDP         = 'strom.tibber.';
const tibberDP              = userDataDP + '.' + tibberStromDP;
const pvforecastTodayDP     = userDataDP + '.strom.pvforecast.today.gesamt.';
const pvforecastTomorrowDP  = userDataDP + '.strom.pvforecast.tomorrow.gesamt.';
const spntComCheckDP        = userDataDP + '.strom.40151_Kommunikation_Check'; // nochmal ablegen zur kontrolle
const tomorrow_kWDP         = userDataDP + '.strom.pvforecast.tomorrow.gesamt.tomorrow_kW';
const tibberPreisJetztDP    = tibberDP + 'extra.tibberPreisJetzt';
const tibberPvForcastDP     = tibberDP + 'extra.tibberPvForcast';

const batterieLadenUhrzeitDP      = userDataDP + '.strom.batterieLadenUhrzeit';
const batterieLadenUhrzeitStartDP = userDataDP + '.strom.batterieLadenUhrzeitStart';
const batterieLadenManuellStartDP = userDataDP + '.strom.batterieLadenManuellStart';

const momentan_VerbrauchDP  = userDataDP + '.strom.Momentan_Verbrauch';
const pV_Leistung_aktuellDP = userDataDP + '.strom.PV_Leistung_aktuell';

const _options = { hour12: false, hour: '2-digit', minute: '2-digit' };

// debug
let _debug = getState(tibberDP + 'debug').val == null ? false : getState(tibberDP + 'debug').val;

//-------------------------------------------------------------------------------------
const _pvPeak = 13100;                                  // PV-Anlagenleistung in Wp
//const _batteryCapacity = 12800;                       // Netto Batterie Kapazität in Wh 2.56 pro Modul
const _batteryCapacity = 10240;                         // Netto Batterie Kapazität in Wh
const _surplusLimit = 0;                                // PV-Einspeise-Limit in % 0 keine Einspeisung
const _batteryTarget = 100;                             // Gewünschtes Ladeziel der Regelung (e.g., 85% for lead-acid, 100% for Li-Ion)
const _lastPercentageLoadWith = -500;                   // letzten 5 % laden mit xxx Watt
const _baseLoad = 750;                                  // Grundverbrauch in Watt
const _wr_efficiency = 0.94;                             // Batterie- und WR-Effizienz (e.g., 0.9 for Li-Ion, 0.8 for PB)
const _batteryLadePower = 5000;                         // Ladeleistung der Batterie in W, BYD mehr geht nicht
const _batteryPowerEmergency = -4000;                   // Ladeleistung der Batterie in W notladung
const _mindischrg = 0;                                  // 0 geht nicht da sonst max entladung .. also die kleinste mögliche Einheit 1
const _pwrAtCom_def = _batteryLadePower * (253 / 230);  // max power bei 253V = 5500 W 
const _sma_em = 'sma-em.0.3015242334';                  // Name der SMA EnergyMeter/HM2 Instanz bei installierten SAM-EM Adapter, leer lassen wenn nicht vorhanden


 // Fahrzeug mit berücksichtigen in Verbrauchsrechnung EVCC Adapter benötigt
const considerVehicle = true;                   
const max_VehicleConsum = 4000;                       // max Wert wenn Fahrzeug lädt 
const isVehicleConnDP = 'evcc.0.loadpoint.1.status.connected';   // ist Fahrzeug gerade an der Ladeseule DP
const vehicleConsumDP = 'evcc.0.loadpoint.1.status.chargePower'; // angaben in W

let isVehicleConn = false;  
let _vehicleConsum = 0;               

let _hhJetzt = getHH(); 

const communicationRegisters = {
    fedInSpntCom: 'modbus.0.holdingRegisters.3.40151_Kommunikation', // (802 active, 803 inactive)
    fedInPwrAtCom: 'modbus.0.holdingRegisters.3.40149_Wirkleistungvorgabe',
    wMaxCha: 'modbus.0.holdingRegisters.3.40189_max_Ladeleistung_BatWR',        // Max Ladeleistung BatWR
}

const inputRegisters = {
    batSoC: 'modbus.0.inputRegisters.3.30845_Batterie_Prozent',
    powerOut: 'modbus.0.inputRegisters.3.30867_Aktuelle_Netzeinspeisung',
    netzbezug: 'modbus.0.inputRegisters.3.30865_Aktueller_Netzbezug',
    triggerDP: 'modbus.0.inputRegisters.3.30193_Systemzeit_als_trigger',
    betriebszustandBatterie: 'modbus.0.inputRegisters.3.30955_Batterie_Zustand',
    battOut: 'modbus.0.inputRegisters.3.31395_Momentane_Batterieentladung',
    battIn: 'modbus.0.inputRegisters.3.31393_Momentane_Batterieladung',
    dc1: 'modbus.0.inputRegisters.3.30773_DC-Leistung_1',
    dc2: 'modbus.0.inputRegisters.3.30961_DC-Leistung_2',
}

const bydDirectSOCDP    = 'bydhvs.0.State.SOC';                            // battSOC netto direkt von der Batterie

let _dc_now             = getState(inputRegisters.dc1).val + getState(inputRegisters.dc2).val;  // pv vom Dach zusammen in W

const _InitCom_Aus      = 803;
const _InitCom_An       = 802;

let _SpntCom            = _InitCom_Aus;           //   802: aktiv (Act)    803: inaktiv (Ina)
let _verbrauchJetzt     = 0;
let _lastSpntCom        = 0;
let _lastpwrAtCom       = 0;
let _bydDirectSOC       = 5;
let _bydDirectSOCMrk    = 0;
let _batsoc             = Math.min(getState(inputRegisters.batSoC).val, 100);    //batsoc = Batterieladestand vom WR      
let _max_pwr            = _mindischrg;
let _tick               = 0;
let _isTibber_active    = 0;

let _notLadung = false;
let _entladung_zeitfenster = false;

// für tibber
let _tibberNutzenSteuerung      = true;    //wird _tibberNutzenAutomatisch benutzt (dyn. Strompreis) 
let _tibberNutzenAutomatisch    = _tibberNutzenSteuerung;
let _tibberPreisJetzt           = getState(tibberPreisJetztDP).val;

// für prognose
let _prognoseNutzenSteuerung    = true;    //wird _tibberNutzenAutomatisch benutzt (dyn. Strompreis)
let _prognoseNutzenAutomatisch  = _prognoseNutzenSteuerung; //wird _prognoseNutzenAutomatisch benutzt
let _batterieLadenUebersteuernManuell = false;
let _tomorrow_kW = 0;

let _sunup    = '00:00';
let _sundown  = '00:00';

// tibber Preis Bereich
let _snowmode = false;                  //manuelles setzen des Schneemodus, dadurch wird in der Nachladeplanung die PV Prognose ignoriert, z.b. bei Schneebedeckten PV Modulen und der daraus resultierenden falschen Prognose
const _start_charge = 0.1805;           //Eigenverbrauchspreis
const _lossfactor = 0.75;               //System gesamtverlust in % (Lade+Entlade Effizienz), nur für tibber Preisberechnung
const _loadfact = 1 / _lossfactor;      /// 1,33
const _stop_discharge =  aufrunden(4, _start_charge * _loadfact);    /// 0.19 * 1.33 = 0.2533 € 

createUserStates(userDataDP, false, [tibberStromDP + 'debug', { 'name': 'debug', 'type': 'boolean', 'read': true, 'write': true, 'role': 'state', 'def': false }], function () {
    setState(tibberDP + 'debug', _debug, true);
});
createUserStates(userDataDP, false, [tibberStromDP + 'extra.PV_Abschluss', { 'name': 'PV Abschluss ermittelt bis Uhrzeit', 'type': 'string', 'read': true, 'write': false, 'role': 'value', 'def': '00:00' }], function () {
    setState(tibberDP + 'extra.PV_Abschluss', '--:--', true);
});
createUserStates(userDataDP, false, [tibberStromDP + 'extra.schwellenwert_Entladung', { 'name': 'stoppe Entladung bei Preis von', 'type': 'number', 'read': true, 'write': false, 'role': 'value', 'unit': 'ct', 'def': 0 }], function () {
    setState(tibberDP + 'extra.schwellenwert_Entladung', _stop_discharge, true);
});
createUserStates(userDataDP, false, [tibberStromDP + 'extra.schwellenwert_Ladung', { 'name': 'starte Ladung mit Strom bei Preis von', 'type': 'number', 'read': true, 'write': false, 'role': 'value', 'unit': 'ct', 'def': 0 }], function () {
    setState(tibberDP + 'extra.schwellenwert_Ladung', _start_charge, true);
});
createUserStates(userDataDP, false, [tibberStromDP + 'extra.PV_Ueberschuss', { 'name': 'wie viele Wh Überschuss', 'type': 'number', 'read': true, 'write': false, 'role': 'value', 'unit': 'Wh', 'def': 0 }], function () {
    setState(tibberDP + 'extra.PV_Ueberschuss', 0, true);
});
createUserStates(userDataDP, false, [tibberStromDP + 'extra.tibberNutzenAutomatisch', { 'name': 'mit tibber laden erlauben', 'type': 'boolean', 'read': true, 'write': true, 'role': 'state', 'def': true }], function () {
    setState(tibberDP + 'extra.tibberNutzenAutomatisch', _tibberNutzenAutomatisch, true);
});
createUserStates(userDataDP, false, [tibberStromDP + 'extra.tibberNutzenManuell', { 'name': 'nutze Tibber Preise manuell', 'type': 'boolean', 'read': true, 'write': true, 'role': 'state', 'def': false }], function () {
    setState(tibberDP + 'extra.tibberNutzenManuell', false, true);
});
createUserStates(userDataDP, false, [tibberStromDP + 'extra.tibberProtokoll', { 'name': 'Tibberprotokoll', 'type': 'number', 'read': true, 'write': false, 'role': 'value', 'def': 0 }], function () {
    setState(tibberDP + 'extra.tibberProtokoll', 0, true);
});
//createUserStates(userDataDP, false, [tibberStromDP + 'extra.tibberNutzenManuellHH', { 'name': 'nutze Tibber Preise manuell ab Stunde ', 'type': 'number', 'read': true, 'write': false, 'role': 'value', 'def': 0 }], function () {
//    setState(tibberDP + 'extra.tibberNutzenManuellHH', 0, true);
//});
createUserStates(userDataDP, false, [tibberStromDP + 'extra.entladeZeitenArray', { 'name': 'entladezeiten als array', 'type': 'array', 'read': true, 'write': false, 'role': 'object' }], function () {
    setState(tibberDP + 'extra.entladeZeitenArray', [], true);
});
createUserStates(userDataDP, false, [tibberStromDP + 'extra.ladeZeitenArray', { 'name': 'lade- und nachladezeiten als array', 'type': 'array', 'read': true, 'write': false, 'role': 'object' }], function () {
    setState(tibberDP + 'extra.ladeZeitenArray', [], true);
});
createUserStates(userDataDP, false, [tibberStromDP + 'extra.PV_Prognose', { 'name': 'PV_Prognose', 'type': 'number', 'read': true, 'write': false, 'role': 'value', 'unit': 'kWh', 'def': 0 }], function () {
    setState(tibberDP + 'extra.PV_Prognose', 0, true);
});
createUserStates(userDataDP, false, [tibberStromDP + 'extra.PV_Prognose_kurz', { 'name': 'PV_Prognose_kurz', 'type': 'number', 'read': true, 'write': false, 'role': 'value', 'unit': 'kWh', 'def': 0 }], function () {
    setState(tibberDP + 'extra.PV_Prognose_kurz', 0, true);
});
createUserStates(userDataDP, false, [tibberStromDP + 'extra.prognoseNutzenAutomatisch', { 'name': 'prognose Basiertes Laden ', 'type': 'boolean', 'read': true, 'write': true, 'role': 'state', 'def': true }], function () {
    setState(tibberDP + 'extra.prognoseNutzenAutomatisch', _prognoseNutzenAutomatisch, true);
});


// zum manuellen übersteuern
createUserStates(userDataDP, false, ['strom.batterieLadenManuellStart', { 'name': 'starte manuelles Laden der Batterie', 'type': 'boolean', 'read': true, 'write': true, 'role': 'state', 'def': false }], function () {
    setState(batterieLadenManuellStartDP, false, true);
});
createUserStates(userDataDP, false, ['strom.batterieLadenUhrzeitStart', { 'name': 'automatisch starten ab stunde', 'type': 'boolean', 'read': true, 'write': true, 'role': 'state', 'def': false }], function () {
    setState(batterieLadenUhrzeitStartDP, false, true);
});
createUserStates(userDataDP, false, ['strom.batterieLadenUhrzeit', { 'name': 'Batterie Laden ab Uhr', 'type': 'number', 'read': true, 'write': false, 'role': 'value', 'def': 15 }], function () {
    setState(batterieLadenUhrzeitDP, 15, true);
});

/*
createUserStates(userDataDP, false, [strom.Momentan_Verbrauch', { 'name': 'Momentan_Verbrauch', 'type': 'number', 'read': true, 'write': false, 'role': 'value', 'def': 0, 'unit': 'kW', }], function () {
    setState(momentan_VerbrauchDP, 0, true);
});

createUserStates(userDataDP, false, ['strom.PV_Leistung_aktuell', { 'name': 'PV_Leistung_aktuell dc1 + dc2', 'type': 'number', 'read': true, 'write': false, 'role': 'value', 'def': 0, 'unit': 'kW', }], function () {
    setState(pV_Leistung_aktuellDP, 0, true);
});
*/

setState(communicationRegisters.fedInSpntCom, _InitCom_Aus);
setState(spntComCheckDP, _InitCom_Aus, true);

console.info('***************************************************');
console.info('starte ladenNachPrognose mit debug ' + _debug);

// bei start immer initialisieren
if (_tibberPreisJetzt <= _stop_discharge || _batsoc <= 1) {
    console.warn('starte direkt mit Begrenzung da Preis unter schwelle');
    _entladung_zeitfenster = true;
} 

// ab hier Programmcode
async function processing() {

    _tick ++;            

    if (_tick >= 30) {         // alle 5 min (30 ticks) reset damit der WR die Daten bekommt, WR ist auf 10 min reset Eingestellt
        setState(spntComCheckDP, 998, true);  
        _tick = 0;   
    }

    let macheNix = false;
    let wirdGeladen   = false;

    _bydDirectSOCMrk = 0;
    _SpntCom = _InitCom_Aus;     // initialisiere AUS    
    
    if (_dc_now < 10) {              // alles was unter 10 KW kann weg
        _dc_now = 0;
    }

    let dc_now_DP     = _dc_now; 

    if (dc_now_DP <= 0) {
        dc_now_DP = 0;
    } else {
        dc_now_DP = aufrunden(2, dc_now_DP)/1000;
    }

    setState(pV_Leistung_aktuellDP, dc_now_DP, true);

    let pvlimit                       = (_pvPeak / 100 * _surplusLimit);                       //pvlimit = 12000/100*0 = 0
    let batterieLadenUhrzeit          = getState(batterieLadenUhrzeitDP).val;
    let batterieLadenUhrzeitStart     = getState(batterieLadenUhrzeitStartDP).val;

     /* Default Werte setzen*/
    let battStatus = getState(inputRegisters.betriebszustandBatterie).val;   

    _tibberPreisJetzt = getState(tibberPreisJetztDP).val;
    _tomorrow_kW      = getState(tomorrow_kWDP).val;

    if (_dc_now > _verbrauchJetzt && _batsoc < 100) {
        _max_pwr = (_dc_now - _verbrauchJetzt) * -1;   // vorbelegung zum laden
    } else {
        _max_pwr = _mindischrg;
    }
   
    // Lademenge
    let lademenge_full = Math.ceil((_batteryCapacity * (100 - _batsoc) / 100) * (1 / _wr_efficiency));                             //Energiemenge bis vollständige Ladung
    let lademenge      = Math.max(Math.ceil((_batteryCapacity * (_batteryTarget - _batsoc) / 100) * (1 / _wr_efficiency)), 0);     //lademenge = Energiemenge bis vollständige Ladung
    let restladezeit   = Math.ceil(lademenge / _batteryLadePower);                                                                 //Ladezeit = Energiemenge bis vollständige Ladung / Ladeleistung WR

    if (restladezeit <= 0) {
        restladezeit = 0;
        lademenge = lademenge_full;
    }

    if (_debug) {
        console.info('pvlimit        _________________ ' + pvlimit + ' W');
        console.info('Verbrauch jetzt_________________ ' + _verbrauchJetzt + ' W');
        console.info('PV Produktion___________________ ' + _dc_now + ' W');
        console.info('Ladeleistung Batterie___________ ' + _batteryLadePower + ' W');
        console.info('Batt_SOC________________________ ' + _batsoc + ' %');
        const battsts = battStatus == 2291 ? 'Batterie Standby' : battStatus == 3664 ? 'Notladebetrieb' : battStatus == 2292 ? 'Batterie laden' : battStatus == 2293 ? 'Batterie entladen' : 'Aus';
        console.info('Batt_Status_____________________ ' + battsts + ' = ' + battStatus);
        console.info('Lademenge bis voll______________ ' + lademenge_full + ' Wh');
        console.info('Lademenge_______________________ ' + lademenge + ' Wh');
        console.info('Restladezeit____________________ ' + aufrunden(2, restladezeit) + ' h');
        
    }

    if (_tibberNutzenSteuerung) {
        if (_isTibber_active == 88) { // komme aus notladung
            setState(spntComCheckDP, 888, true);
        }

        _isTibber_active = 0;       // initialisiere

        let poi = [];
        for (let t = 0; t < 24; t++) {  // nur bis 13 uhr da um 14 nächste Preise 
            if (t < 13) {
                poi[t] = [getState(tibberDP + t + '.price').val, getState(tibberDP + t + '.startTime').val, getState(tibberDP + t + '.endTime').val];
            }
        }

        poi.sort(function (a, b) {  // niedrieg preis um
            return a[0] - b[0];
        });

        let lowprice = []; //wieviele Ladestunden unter Startcharge Preis
        for (let x = 0; x < poi.length; x++) {
            if (poi[x][0] <= _start_charge) {
                lowprice.push(poi[x]);
            }
        }
        
        let nowhour     = _hhJetzt + ':00'; // stunde jetzt zur laufzeit
        let hhJetztNum  = Number(_hhJetzt);
        
        let batlefthrs = ((_batteryCapacity / 100) * _batsoc) / (_baseLoad / Math.sqrt(_lossfactor));    /// 12800 / 100 * 30
        batlefthrs = aufrunden(2, batlefthrs);

        //wieviel wh kommen in etwa von PV in den nächsten 24h
        let hrstorun = 24;   
        let pvwh = 0;

        for (let p = 0; p < hrstorun * 2; p++) {   // *2 weil 48 PV Datenpunkte
            pvwh = pvwh + (getState(pvforecastTodayDP + p + '.power').val / 2);
        }
        
        if (_debug) {          
            console.info('Bat h verbleibend_____batlefthrs ' + batlefthrs);  
            console.info('Erwarte ca______________________ ' + aufrunden(2, pvwh / 1000) + ' kWh von PV');
        }

        setState(tibberDP + 'extra.PV_Prognose', aufrunden(2, pvwh), true);

        _sundown       = getAstroDate('sunsetStart').getHours() + ':' + getAstroDate('sunsetStart').getMinutes().toString().padStart(2, '0');                               // aufgang
        const today    = new Date();
        const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
        _sunup         = getAstroDate('sunriseEnd', tomorrow).getHours() + ':' + getAstroDate('sunriseEnd', tomorrow).getMinutes().toString().padStart(2, '0');         // untergang
        
        if (_debug) {
            console.info('Nachtfenster nach Astro : ' + _sundown + ' - ' + _sunup);
        }

        let neuberechnen = false;

        if (!_snowmode) {    // ist genug PV da am tag  
            for (let sd = 47; sd >= 0; sd--) {
                const pow = getState(pvforecastTodayDP + sd + '.power').val;

                if (pow <= _baseLoad && pow != 0) {
                    _sundown = getState(pvforecastTodayDP + sd + '.startTime').val;                                
                    break;
                }                
            }            

            let su = 0;
            for (su = 0; su < 48; su++) {
                if (getState(pvforecastTodayDP + su + '.power').val >= _baseLoad) {
                    _sunup = getState(pvforecastTodayDP + su + '.startTime').val;
                    
                    const sunupHH = parseInt(_sunup.slice(0, 2));

                    if (hhJetztNum > sunupHH) {
                        neuberechnen = true;
                    }                    
                    break;
                }
            }

            if (neuberechnen) {                
                _sunup = getState(pvforecastTomorrowDP + su + '.startTime').val;
            }             
        }
      
        let sundownhr  = _sundown;
        if (compareTime(_sundown, _sunup, 'between')) {
            sundownhr  = nowhour;
        }

        hrstorun          = Math.min(Number(zeitDifferenzInStunden(sundownhr, _sunup)), 24);
        const toSundownhr = Math.min(Number(zeitDifferenzInStunden(nowhour, _sundown)), 24);        

        if (_debug) {
            console.info('Nachtfenster nach Berechnung : ' + sundownhr + ' - ' + _sunup + ' bis zum Sonnenaufgang sind es noch hrstorun ' + hrstorun + ' h und nur zum Untergang toSundownhr ' + toSundownhr);
        }        


        if (toSundownhr >= 0 && toSundownhr < 24) {                            
            pvwh = 0;         // initialisiere damit die entladung läuft
            let t = 0;
            if (toSundownhr > 1) { 
            //wieviel wh kommen in etwa von PV die verkürzt
                for (t = 0; t < 48; t++) {           // suche nach jetziger zeit 
                    const startT  = getState(pvforecastTodayDP + t + '.startTime').val; 
                    const startHH = parseInt(startT.slice(0, 2));
                    if (startHH == hhJetztNum) {                        
                        break;
                    }
                }
                for (let p = t; p < 48; p++) { // übernehme werte von jetzt aus
                    pvwh = pvwh + (getState(pvforecastTodayDP + p + '.power').val / 2);
                }

                setState(tibberDP + 'extra.PV_Prognose_kurz',aufrunden(2, pvwh), true);

                if (_debug) {
                    console.info('Erwarte ca______________________ ' + aufrunden(2, pvwh / 1000) + ' kWh von PV verkürzt');
                }
            }
        }
    
        let poihigh = getState(tibberPvForcastDP).val;

        if (_debug) {
            console.info('Tibber poihigh.length ' + poihigh.length);
        //    console.info('poihigh vor nachladen: ' + JSON.stringify(poihigh));
        }

        // ggf nachladen?
        let prclow = [];
        let prchigh = [];
        let ladeZeitenArray = [];    

        if (batlefthrs < hrstorun) {
            for (let h = 0; h < poihigh.length; h++) {
                if (poihigh[h][0] <= _start_charge) {
                    prclow.push(poihigh[h]);    
                }
                if (poihigh[h][0] > _stop_discharge) {
                    prchigh.push(poihigh[h]);    
                }
            }

            prclow.sort(function (a, b) {
                return a[0] - b[0];
            })

            //nachlademenge 
            let chargewh = (prchigh.length) * (_baseLoad / 2) * 1 / _wr_efficiency; 
            
            if (hrstorun < 24 && !_snowmode) {
                chargewh = (chargewh - (pvwh * _wr_efficiency)) * -1;
            }

            chargewh =  aufrunden(2, chargewh);

            let curbatwh   = aufrunden(2, ((_batteryCapacity / 100) * _batsoc));
            let chrglength = aufrunden(2, (Math.max((chargewh - curbatwh) / (_batteryLadePower * _wr_efficiency), 0) * 2));       

            // neuaufbau poihigh ohne Nachladestunden
            if (_debug) {
                console.info('vor  chrglength ' + chrglength + ' curbatwh ' + curbatwh + ' chargewh ' + chargewh);
            //    console.info('prclow  Nachladestunden ' + JSON.stringify(prclow));
            //    console.info('poihigh Nachladestunden ' + JSON.stringify(prchigh));
            }
                              
            if (chrglength > prclow.length) {
                chrglength = prclow.length;
            }

            if (_debug) {
            //    console.info('poihigh ohne Nachladestunden ' + JSON.stringify(poihigh));
                console.info('nach chrglength ' + chrglength + ' curbatwh ' + curbatwh);
            }

            if (chrglength > 0 && prclow.length > 0) {
                for (let o = 0; o < chrglength; o++) {
                    if (_debug) {
                        console.info('Nachladezeit: ' + prclow[o][1] + '-' + prclow[o][2] + ' (' + aufrunden(2, chargewh - curbatwh) + ' Wh)');
                    }
                }
                // nachladung starten da in der zwischenzeit
                if (chargewh - curbatwh > 0) {
                    for (let i = 0; i < chrglength; i++) {

                        ladeZeitenArray.push(prclow[i]);
                        if (compareTime(prclow[i][1], prclow[i][2], 'between')) {    
                            if (_debug) {
                                console.warn('-->> Bingo nachladezeit');
                            }                                                         
                            _SpntCom = _InitCom_An;
                            _max_pwr = _pwrAtCom_def * -1;                           
                            _isTibber_active = 1;
                            _prognoseNutzenSteuerung = false;
                            macheNix = true;
                            break;
                        }
                    }
                }
            }
        }

        if (!macheNix) {
            poihigh = filterTimes(poihigh); // übernehmen nur laufende und zukünftige werte
            
            let lefthrs = batlefthrs * 2;             // batlefthrs Bat h verbleibend

            if (_debug) {
                console.info('poihigh.length '+ poihigh.length);
            //    console.info('poihigh nach filter ' + JSON.stringify(poihigh));
            }


            if (lefthrs > 0 && lefthrs > poihigh.length) {        // limmitiere die Battlaufzeit wenn zu viel PV stunden
                lefthrs = poihigh.length;   
            }      

            let entladeZeitenArray = [];

            if (_debug) {
                console.warn('-->>  lefthrs ' + lefthrs + ' batlefthrs ' + batlefthrs + ' hrstorun ' + hrstorun + ' pvwh ' + pvwh);          
            }

// Entladezeit  wenn reste im akku           

            if (hrstorun == 0 && _tibberPreisJetzt > _stop_discharge) { // wenn jetzige stunde genau auf Teuerpreis trifft
                hrstorun = 1;    
            }

            if (hrstorun > 0 && batlefthrs > 0 && _batsoc > 1 && _tibberPreisJetzt > _stop_discharge && _dc_now > 1 && _dc_now < _verbrauchJetzt) {      // wenn noch was im akku 
                _SpntCom = _InitCom_Aus;    
                macheNix = true;
                _entladung_zeitfenster = true;
                _isTibber_active = 21;  
         //       entladeZeitenArray.push(poihigh[1]);
            }

// Entladezeit 
            if (lefthrs > 0 && lefthrs <= hrstorun * 2) { // && pvwh < _baseLoad * 24 * _wr_efficiency) {        //  16200 aus der berechung
                macheNix = false;
                if (batlefthrs >= hrstorun && compareTime(nowhour, _sunup, 'between')) {                    // wenn rest battlaufzeit > als bis zum sonnenaufgang
                    if (_debug) {
                        console.warn('Entladezeit reicht aus bis zum Sonnaufgang und genug PV');
                    }
                    _SpntCom = _InitCom_Aus;
                    _max_pwr = _mindischrg;
                    macheNix = true;
                    _isTibber_active = 22;                                        
                    _entladung_zeitfenster = true;
                    entladeZeitenArray.push('--:--');  //  [0.2856,"19:30","20:00"]
                } else {        
                    for (let d = 0; d < lefthrs; d++) {
                        if (poihigh[d] != null) {
                            if (poihigh[d][0] > _stop_discharge) {
                                _entladung_zeitfenster = false;
                                
                                if (_debug) {
                                    console.info('Entladezeiten: ' + poihigh[d][1] + '-' + poihigh[d][2] + ' Preis ' + poihigh[d][0] + ' Fahrzeug zieht ' + _vehicleConsum + ' W');
                                }

                                entladeZeitenArray.push(poihigh[d]);   

                                if (compareTime(poihigh[d][1], poihigh[d][2], "between")) {
                                    if (_vehicleConsum > 0) {                        // wenn fahrzeug am laden dann aber nicht aus der batterie laden
                                        break;                                            
                                    } else {
                                        if (_dc_now <= _verbrauchJetzt) {           // entlade nur wenn sich das lohnt
                                            _SpntCom = _InitCom_Aus;
                                            _max_pwr = _mindischrg;
                                            macheNix = true;
                                            _isTibber_active = 2;                                        
                                            _entladung_zeitfenster = true;                                                
                                        }
                                    }
                                }
                            } 
                        }
                    }
                }
            }

            entladeZeitenArray = filterUniquePrices(entladeZeitenArray);

            setState(tibberDP + 'extra.entladeZeitenArray', entladeZeitenArray, true);

            if (!macheNix) {

                _SpntCom = _InitCom_An;   

//entladung stoppen wenn preisschwelle erreicht aber nicht wenn ladung reicht bis zum nächsten sonnenaufgang
                if ((_tibberPreisJetzt <= _stop_discharge || _batsoc == 0) && _entladung_zeitfenster && _isTibber_active == 2) {
                    if (_debug) {
                        console.warn('Stoppe Entladung, Preis jetzt ' + _tibberPreisJetzt + ' ct/kWh unter Batterieschwelle von ' + aufrunden(2, _stop_discharge) + ' ct/kWh');
                    }
                    _SpntCom = _InitCom_An;
                    _max_pwr = _mindischrg;                    
                    _isTibber_active = 3;
                }
     
// starte die ladung
                if (_tibberPreisJetzt <= _start_charge) {
                    let length = Math.ceil(restladezeit);

                    if (length > lowprice.length) {
                        length = lowprice.length;
                        if (_debug) {
                            console.info('Starte Ladung : ' + JSON.stringify(lowprice));
                        }
                    }
                    for (let i = 0; i < length; i++) {
                        ladeZeitenArray.push(lowprice[i]);
                        if (compareTime(lowprice[i][1], lowprice[i][2], 'between') && _dc_now < _verbrauchJetzt) { 
                            if (_debug) {
                                console.info('Starte Ladung: ' + lowprice[i][1] + '-' + lowprice[i][2] + ' Preis ' + lowprice[i][0]);
                            }
                            _SpntCom = _InitCom_An;
                            _max_pwr = _pwrAtCom_def * -1;
                            _isTibber_active = 5;
                            _prognoseNutzenSteuerung = false;
                            break;
                        }
                    }
                } 

//ladung stoppen wenn Restladezeit kleiner Billigstromzeitfenster
                if (lowprice.length > 0 && restladezeit <= lowprice.length && _isTibber_active == 5) {
                    if (_debug) {
                        console.info('Stoppe Ladung, lowprice.length ' + lowprice.length);
                    }
                    _SpntCom = _InitCom_An;
                    _max_pwr = _mindischrg;
                    _isTibber_active = 4;
                    _prognoseNutzenSteuerung = true;
                }              
            }
        }

        ladeZeitenArray.sort(function (a, b) {
            return b[1] - a[1];
        });
        setState(tibberDP + 'extra.ladeZeitenArray', ladeZeitenArray, true);
    }

    setState(tibberDP + 'extra.tibberProtokoll', _isTibber_active, true);

// wenn tibber  = 3 und PV deckt Verbrauch zu 30 % dann nimm aus der batterie ist vielleicht ne Wolke unterwegs
    if (_isTibber_active == 3 && _dc_now >= (_verbrauchJetzt - (_verbrauchJetzt * 0.30))) {
        if (_debug) {
            console.error('Stoppe Zukauf da Verbrauch zu 30% gedeckt');
        }
        _SpntCom = _InitCom_Aus;
        _max_pwr = _mindischrg;
    }


    // ----------------------------------------------------  Start der PV Prognose Sektion

//      _isTibber_active = 0;    initial
//      _isTibber_active = 1;    Nachladezeit
//      _isTibber_active = 2;    Entladezeiten
//      _isTibber_active = 21;   Entladezeit wenn akku > 0 aber keine entladezeit, aber der Preis hoch genug um zu sparen
//      _isTibber_active = 22;   Entladezeit reicht aus bis zum Sonnaufgang
//      _isTibber_active = 3;    entladung stoppen wenn preisschwelle erreicht
//      _isTibber_active = 4;    ladung stoppen wenn Restladezeit kleiner Billigstromzeitfenster
//      _isTibber_active = 5;    starte die ladung
//      _isTibber_active = 98;   manuelles laden
//      _isTibber_active = 99;   notladung

    _max_pwr = aufrunden(2, _max_pwr);

    if (_debug) {
        console.error('-->> Start der PV Prognose Sektion _SpntCom ' + _SpntCom + ' _max_pwr ' + _max_pwr + ' macheNix ' + macheNix + ' _isTibber_active ' + _isTibber_active);
        console.error('-->  PV ' + _dc_now + ' Verbrauch ' + _verbrauchJetzt);
    }

    if ((batterieLadenUhrzeitStart && _hhJetzt >= batterieLadenUhrzeit)) {    // laden übersteuern ab bestimmter uhrzeit
        if (_debug) {
            console.warn('-->> übersteuert mit nach Uhrzeit laden');
        }
        _SpntCom  = _InitCom_Aus;
        _prognoseNutzenSteuerung = false;
    }
                                       
    if (_prognoseNutzenSteuerung) {
        if (_isTibber_active == 88) { // komme aus notladung
            setState(spntComCheckDP, 888, true);
        }
    
        let latesttime;
        let pvfc = [];
        let f = 0;
        
        for (let p = 0; p < 48; p++) { /* 48 = 24h a 30min Fenster*/
            let pvpower50 = getState(pvforecastTodayDP + p + '.power').val;
            let pvpower90 = getState(pvforecastTodayDP + p + '.power90').val;
            let pvendtime = getState(pvforecastTodayDP + p + '.endTime').val;
            let pvstarttime = getState(pvforecastTodayDP + p + '.startTime').val;

            if (pvpower90 > (pvlimit + _baseLoad)) {
                if (compareTime(pvendtime, null, '<=', null)) {
                    let minutes = 30;
                    if (pvpower50 < pvlimit) {
                        minutes = Math.round((100 - (((pvlimit - pvpower50) / ((pvpower90 - pvpower50) / 40)) + 50)) * 18 / 60);
                    }
                    pvfc[f] = [pvpower50, pvpower90, minutes, pvstarttime, pvendtime];
                    f++;
                }
            }
        }

        setState(tibberDP + 'extra.PV_Abschluss', '--:--', true); 

        if (pvfc.length > 0) {
            latesttime = pvfc[(pvfc.length - 1)][4];
            setState(tibberDP + 'extra.PV_Abschluss', latesttime, true);
        }

        pvfc.sort(function (b, a) {
            return a[1] - b[1];
        });

        if (_debug && latesttime) {
            console.info('Abschluss PV bis ' + latesttime);
        }

        // verschieben des Ladevorgangs in den Bereich der PV Limitierung. batterie ist nicht in notladebetrieb
        if (_debug) {
            console.info('pvfc.length ' + pvfc.length + ' Restladezeit ' + restladezeit);
        }

        if (restladezeit > 0 && (restladezeit * 2) <= pvfc.length) {  // wenn die ladedauer kleiner ist als die vorhersage 
            // Bugfix zur behebung der array interval von 30min und update interval 1h
       //     if (compareTime(latesttime, null, '<=', null)) {
       //         _max_pwr = _mindischrg;
       //     }
            //berechnung zur entzerrung entlang der pv kurve, oberhalb des einspeiselimits
            let get_wh = 0;
            let get_wh_einzeln = 0;
            
            for (let k = 0; k < pvfc.length; k++) {
                let pvpower = pvfc[k][0];
                let minutes = pvfc[k][2];

                if (pvpower < (pvlimit + _baseLoad)) {
                    pvpower = pvfc[k][1];
                }

                if (compareTime(pvfc[k][3], pvfc[k][4], 'between')) {
                    //rechne restzeit aus
                    const now = new Date();
                    const nowTime = now.toLocaleTimeString('de-DE', _options);
                    const startsplit = nowTime.split(':');
                    const endsplit = pvfc[k][4].split(':');
                    const minutescalc = (Number(endsplit[0]) * 60 + Number(endsplit[1])) - (Number(startsplit[0]) * 60 + Number(startsplit[1]));
                    if (minutescalc < minutes) {
                        minutes = minutescalc;
                    }
                }
                get_wh_einzeln = (((pvpower / 2) - ((pvlimit + _baseLoad) / 2)) * (minutes / 30)); // wieviele Wh Überschuss???   
                
                get_wh = get_wh + aufrunden(2, get_wh_einzeln);
            }

            setState(tibberDP + 'extra.PV_Ueberschuss', get_wh, true);

            pvfc = sortiereNachUhrzeit(pvfc);

            if (_debug) {
            //  console.info('pvfc ' + JSON.stringify(pvfc));
                console.info('Überschuss get_wh vor entzerren ' + get_wh);
            }

            let pvlimit_calc = pvlimit;
            let min_pwr = 0;

            if (lademenge > 0 && lademenge > get_wh) {
                if ((restladezeit * 2) <= pvfc.length) {
                    restladezeit = pvfc.length / 2;                          //entzerren des Ladevorganges
                }
                
                pvlimit_calc = Math.max((Math.round(pvlimit - ((lademenge - get_wh) / restladezeit))), 0);      //virtuelles reduzieren des pvlimits
                min_pwr      = Math.max(Math.round((lademenge - get_wh) / restladezeit), 0);                   
                min_pwr      = min_pwr * -1;                                                                    // muss negativ sein ??
                
                get_wh = lademenge;       //daran liegts damit der unten immer rein geht ????                    
            }

            get_wh = aufrunden(2, get_wh);     // aufrunden 2 stellen reichen

            if (_debug) {
                console.info('-->   Verschiebe Einspeiselimit auf pvlimit_calc ' + pvlimit_calc + ' W' + ' mit mindestens ' + min_pwr + ' W  get_wh ' + get_wh + ' restladezeit ' + restladezeit);
            }

            let current_pwr_diff = _dc_now - _verbrauchJetzt;

            if (lademenge > 0 && get_wh >= lademenge && _isTibber_active == 0) {                   // vielleicht so bei tibber = 21
                restladezeit = pvfc.length / 2;

                _max_pwr = Math.ceil(pvfc[0][1] - pvlimit_calc);

                if (_max_pwr > current_pwr_diff) {
                    _max_pwr = Math.ceil(current_pwr_diff);                       
                }
                
                if (_debug) { 
                    console.info('nach der Begrenzung  :_max_pwr ' + _max_pwr + ' pvfc[0][1] ' + pvfc[0][1] + ' startzeit ' + pvfc[0][3] + ' pvlimit_calc ' + pvlimit_calc);
                }
            }

            if (_debug) {               
                console.info('Ausgabe A  :_max_pwr ' + _max_pwr + ' min_pwr ' + min_pwr + ' current_pwr_diff ' + current_pwr_diff);
            }

            _max_pwr = Math.ceil(Math.min(Math.max(_max_pwr, min_pwr), _batteryLadePower));     //abfangen negativer werte, limitiere auf min_pwr orginal

            if (_debug) {               
                console.info('Ausgabe B  :_max_pwr ' + _max_pwr);
            }

            setState(tibberDP + 'extra.ladeZeitenArray', pvfc, true);

            if (_dc_now < _verbrauchJetzt && _isTibber_active == 0)       {
                _max_pwr = _mindischrg;    
            }     

            for (let h = 0; h < (restladezeit * 2) && _dc_now >= _verbrauchJetzt; h++) {  // nur wenn überschuss wirklich da ist
                if (compareTime(pvfc[h][3], pvfc[h][4], 'between')) {
                    if (_debug) {
                        console.warn('-->> Bingo ladezeit mit überschuss _max_pwr ' + _max_pwr + '  ' + pvfc[h][0] + ' ' + pvfc[h][1]);
                    }     
                    _SpntCom = _InitCom_An;                       
                            
                    if (_max_pwr > _dc_now - _verbrauchJetzt) {  // wenn das ermittelte wert grösser ist als die realität dann limmitiere, check nochmal besser ist es
                        _max_pwr = _dc_now - _verbrauchJetzt;   
                        if (_debug) {
                            console.warn('-->> Bingo ladezeit limmitiere auf ' + _max_pwr);
                        }     
                    }

                    _max_pwr = _max_pwr * -1;

                    if (_batsoc < 100) {  // batterie ist nicht voll 
                        wirdGeladen = true;
                    }
                  
                    break;
                }
            }
         
            if (_isTibber_active == 2 || _isTibber_active == 22) {
                wirdGeladen = true;    
            }            
        } 
    }    

// ---------------------------------------------------- Ende der PV Prognose Sektion

    if (_batsoc > 90 && wirdGeladen) {     // letzten 5 % langsam laden
        _max_pwr = _lastPercentageLoadWith;    
    }

// ----------------------------------------------------           write WR data 

    sendToWR(_SpntCom, aufrunden(0, _max_pwr));
}


function sendToWR(commWR, pwrAtCom) {
    const commNow = getState(spntComCheckDP).val;

   // if ((commWR == _InitCom_An || commWR != commNow || commWR != _lastSpntCom) && !_batterieLadenUebersteuernManuell) {
    if ((_lastpwrAtCom != pwrAtCom || commWR != commNow || commWR != _lastSpntCom) && !_batterieLadenUebersteuernManuell) {
        if (_debug) {
            console.warn('------ > Daten gesendet an WR kommunikation : ' + commWR  + ' Wirkleistungvorgabe ' + pwrAtCom);
        }
        setState(communicationRegisters.fedInPwrAtCom, pwrAtCom);       // 40149_Wirkleistungvorgabe
        setState(communicationRegisters.fedInSpntCom, commWR);        // 40151_Kommunikation
        setState(spntComCheckDP, commWR, true);                       // check DP für vis
    }

    if (_debug && !_batterieLadenUebersteuernManuell) {
        console.warn('SpntCom jetzt --> ' + commWR + ' <-- davor war ' + _lastSpntCom + ' .. Wirkleistungvorgabe jetzt ' + pwrAtCom + ' davor war ' + _lastpwrAtCom);
        console.info('----------------------------------------------------------------------------------');
    }

    _lastSpntCom    = commWR;
    _lastpwrAtCom   = pwrAtCom; 
}


/* ***************************************************************************************************************************************** */

on({ id: inputRegisters.triggerDP, change: 'any' }, async function () {  // aktualisiere laut adapter abfrageintervall
    setTimeout(async function () {   
        _hhJetzt                    = getHH(); 
        _batsoc                     = Math.min(getState(inputRegisters.batSoC).val, 100);    //batsoc = Batterieladestand vom WR         
        _debug                      = getState(tibberDP + 'debug').val;
        _dc_now                     = getState(inputRegisters.dc1).val + getState(inputRegisters.dc2).val;  // pv vom Dach zusammen in W

        _verbrauchJetzt = await berechneVerbrauch(_dc_now);

        _snowmode                   = getState(userDataDP + '.strom.tibber.extra.PV_Schneebedeckt').val;
        _tibberNutzenAutomatisch    = getState(tibberDP + 'extra.tibberNutzenAutomatisch').val;           // aus dem DP kommend sollte true sein für vis
        _prognoseNutzenAutomatisch  = getState(tibberDP + 'extra.prognoseNutzenAutomatisch').val;       // aus dem DP kommend sollte true sein für vis

        _tibberNutzenSteuerung      = _tibberNutzenAutomatisch;       // init
        _prognoseNutzenSteuerung    = _prognoseNutzenAutomatisch;      // init

        // übersteuern nach prio manuell zuerst dann autoamtisch oder battsoc unter 5 %
        const _tibberNutzenManuell          = getState(tibberDP + 'extra.tibberNutzenManuell').val;
        const _tibberNutzenManuellHH        = getState(tibberDP + 'extra.tibberNutzenManuellHH').val;

        _batterieLadenUebersteuernManuell   = getState(batterieLadenManuellStartDP).val;

        if (_batterieLadenUebersteuernManuell || (_tibberNutzenManuell && _hhJetzt == _tibberNutzenManuellHH)) {       // wird durch anderes script geregelt
            _tibberNutzenSteuerung      = false;     // der steuert intern ob lauf gültig  für tibber laden/entladen
            _prognoseNutzenSteuerung    = false;   // der steuert intern ob lauf gültig  für pv laden   
            _lastSpntCom                = 98;                                  
        }

        if (_debug) {
            console.info('tibberNutzenAutomatisch ' + _tibberNutzenAutomatisch + ' prognoseNutzenAutomatisch ' + _prognoseNutzenAutomatisch);
        }

        // ---     check ob notladung nötig
        _notLadung = notLadungCheck();

        if (_notLadung) {       
            _tibberNutzenSteuerung      = false;
            _prognoseNutzenSteuerung    = false;
            _isTibber_active            = 88      // notladung mrk 
            sendToWR(_InitCom_Aus, _batteryPowerEmergency);
        } else {        
                processing();             /*start processing in interval*/
        }

        if (_debug) {
            console.info('tibberNutzenSteuerung ' + _tibberNutzenSteuerung + ' prognoseNutzenSteuerung ' + _prognoseNutzenSteuerung);
        }
    }, 300);

});


on({id: [tibberDP + 'extra.tibberNutzenAutomatisch',
         tibberDP + 'extra.prognoseNutzenAutomatisch',
        ], change: 'any', val: false}, function () {
        _lastSpntCom = 97;
});



function notLadungCheck() {
    _bydDirectSOC = getState(bydDirectSOCDP).val;   // nimm den bydSoc da der WR nicht immer diesen übermittelt    

    if (_bydDirectSOC < 5 && _dc_now < _verbrauchJetzt) {
        if (_bydDirectSOC != _bydDirectSOCMrk) {
            console.error(' -----------------    Batterie NOTLADEN ' + _bydDirectSOC + ' %' + ' um ' + _hhJetzt + ':00');
            toLog(' -----------------    Batterie NOTLADEN ' + _bydDirectSOC + ' %', true);
            _bydDirectSOCMrk = _bydDirectSOC;
        }        
        return true;            
    }    
    return false;
}

function sortiereNachUhrzeit(arr) {
    return arr.sort((a, b) => {
        const zeitA = a[3];
        const zeitB = b[3];
        const stundenA = parseInt(zeitA.slice(0, 2));
        const minutenA = parseInt(zeitA.slice(3, 5));
        const stundenB = parseInt(zeitB.slice(0, 2));
        const minutenB = parseInt(zeitB.slice(3, 5));

        if (stundenA !== stundenB) {
            return stundenA - stundenB;
        } else {
            return minutenA - minutenB;
        }
    });
}

function filterUniquePrices(inputArray) {
    const uniquePrices = {}; // Ein Objekt, um eindeutige Preise zu verfolgen
    const outputArray = [];

    inputArray.forEach(element => {
        const price = element[0];

        // Wenn der Preis noch nicht im eindeutigen Preisobjekt vorhanden ist
        if (!uniquePrices[price]) {
            uniquePrices[price] = true; // Markiere ihn als bereits gesehen
            outputArray.push(element); // Füge das Element dem Ausgabearray hinzu
        }
    });

    return outputArray;
}

function filterTimes(array) {
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();

    const filteredArray = array.filter(item => {
        const startTime = parseInt(item[1].split(':')[0]) * 60 + parseInt(item[1].split(':')[1]);
        const endTime = parseInt(item[2].split(':')[0]) * 60 + parseInt(item[2].split(':')[1]);
        //return currentTime <= startTime || currentTime >= startTime && currentTime <= endTime;
        return currentTime <= startTime || currentTime >= startTime;
    });

    return filteredArray;
}

function getArrayDifference(array1, array2) {
    const map = new Map(array1.map(item => [item.toString(), item]));
    return array2.filter(item => !map.has(item.toString()));
}

async function berechneVerbrauch(pvNow) {
    if (_sma_em.length > 0) {
        inputRegisters.powerOut = _sma_em + ".psurplus" /*aktuelle Einspeiseleistung am Netzanschlußpunkt, SMA-EM Adapter*/
    }
    
    const einspeisung   = aufrunden(2, getState(inputRegisters.powerOut).val);     // Einspeisung  in W
    const battOut       = await getStateAsync(inputRegisters.battOut);
    const battIn        = await getStateAsync(inputRegisters.battIn);
    const netzbezug     = await getStateAsync(inputRegisters.netzbezug);
    
   _vehicleConsum = 0;

    if (considerVehicle) {
        isVehicleConn = getState(isVehicleConnDP).val;
        if (isVehicleConn) {
            _vehicleConsum = getState(vehicleConsumDP).val;

            if (_vehicleConsum < 0 || _vehicleConsum > max_VehicleConsum) { // sollte murks vom adapter kommen dann setze auf 0
                _vehicleConsum = 0;   
            }
        }
    }                                

    const verbrauchJetzt   = 100 + (pvNow + battOut.val + netzbezug.val) - (einspeisung + battIn.val);          // verbrauch in W , 100W reserve obendruaf _vehicleConsum nicht rein nehmen
    setState(momentan_VerbrauchDP, aufrunden(2, _verbrauchJetzt-100-_vehicleConsum)/1000, true);                  // für die darstellung können die 100 W wieder raus und fahrzeug auch

    return verbrauchJetzt;
}

function aufrunden(stellen, zahl) {
    return +(Math.round(zahl + 'e+' + stellen) + 'e-' + stellen);
}

function zeitDifferenzInStunden(zeit1, zeit2) {
    // Zeit 1 extrahieren
    const [stunden1, minuten1] = zeit1.split(':').map(Number);
    // Zeit 2 extrahieren
    const [stunden2, minuten2] = zeit2.split(':').map(Number);
    
    // Zeit 1 in Minuten umwandeln
    let zeit1InMinuten = stunden1 * 60 + minuten1;
    // Zeit 2 in Minuten umwandeln
    let zeit2InMinuten = stunden2 * 60 + minuten2;
    
    // Wenn Zeit 2 vor Zeit 1 liegt, füge 24 Stunden zu Zeit 2 hinzu (Tagesübergang)
    if (zeit2InMinuten < zeit1InMinuten) {
        zeit2InMinuten += 24 * 60;
    }
    
    // Differenz berechnen
    let differenzInMinuten = zeit2InMinuten - zeit1InMinuten;
    
    // Differenz in Stunden und Minuten aufteilen
    const differenzStunden = Math.floor(differenzInMinuten / 60);
    const differenzMinuten = differenzInMinuten % 60;

    // Rückgabe der Differenz als formatierte Zeichenkette
    return `${differenzStunden}.${(differenzMinuten < 10 ? '0' : '') + differenzMinuten}`;
}
