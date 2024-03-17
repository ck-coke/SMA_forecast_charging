const userDataDP = '0_userdata.0';
const tibberStromDP = 'strom.tibber.';
const tibberDP = userDataDP + '.' + tibberStromDP;
const pvforecastDP = userDataDP + '.strom.pvforecast.today.gesamt.';
const spntComCheckDP = userDataDP + '.strom.40151_Kommunikation_Check'; // nochmal ablegen zur kontrolle
const tomorrow_kWDP = userDataDP + '.strom.pvforecast.tomorrow.gesamt.tomorrow_kW';
const tibberPreisJetztDP = tibberDP + 'extra.tibberPreisJetzt';

const batterieLadenUhrzeitDP      = userDataDP + '.strom.batterieLadenUhrzeit';
const batterieLadenUhrzeitStartDP = userDataDP + '.strom.batterieLadenUhrzeitStart';
const batterieLadenManuellStartDP = userDataDP + '.strom.batterieLadenManuellStart';

const _options = { hour12: false, hour: '2-digit', minute: '2-digit' };

// debug
let _debug = getState(tibberDP + 'debug').val == null ? false : getState(tibberDP + 'debug').val;

//-------------------------------------------------------------------------------------
const _pvPeak = 13100;                                  // PV-Anlagenleistung in Wp
const _batteryCapacity = 12800;                         // Netto Batterie Kapazität in Wh
const _surplusLimit = 0;                                // PV-Einspeise-Limit in % 0 keine Einspeisung
const _batteryTarget = 100;                             // Gewünschtes Ladeziel der Regelung (e.g., 85% for lead-acid, 100% for Li-Ion)
const _lastPercentageLoadWith = 500;                   // letzten 5 % laden mit xxx Watt
const _baseLoad = 750;                                  // Grundverbrauch in Watt
const _wr_efficiency = 0.9;                             // Batterie- und WR-Effizienz (e.g., 0.9 for Li-Ion, 0.8 for PB)
const   _batteryLadePower = 5000;                         // Ladeleistung der Batterie in W, BYD mehr geht nicht
const _batteryPowerEmergency = -5000;                   // Ladeleistung der Batterie in W notladung
const _mindischrg = 1;                                  // 0 geht nicht da sonst max entladung .. also die kleinste mögliche Einheit 1
const _pwrAtCom_def = _batteryLadePower * (253 / 230);  // max power bei 253V = 5500 W 
const _sma_em = 'sma-em.0.3015242334';                  // Name der SMA EnergyMeter/HM2 Instanz bei installierten SAM-EM Adapter, leer lassen wenn nicht vorhanden


 // Fahrzeug mit berücksichtigen in Verbrauchsrechnung EVCC Adapter benötigt
const considerVehicle = true;                   
const maxVehicleConsum = 4000;                       // max Wert wenn Fahrzeug lädt 
const isVehicleConnDP = 'evcc.0.loadpoint.1.status.connected';   // ist Fahrzeug gerade an der Ladeseule DP
const vehicleConsumDP = 'evcc.0.loadpoint.1.status.chargePower'; // angaben in W

let isVehicleConn = false;  
let vehicleConsum = 0;               



const communicationRegisters = {
    fedInSpntCom: 'modbus.0.holdingRegisters.3.40151_Kommunikation', // (802 active, 803 inactive)
    fedInPwrAtCom: 'modbus.0.holdingRegisters.3.40149_Wirkleistungvorgabe',
    wMaxCha: 'modbus.0.holdingRegisters.3.40189_max_Ladeleistung_BatWR',        // Max Ladeleistung BatWR
    maxchrg: 'modbus.0.holdingRegisters.3.40795_Maximale_Batterieladeleistung',
    maxdischrg: 'modbus.0.holdingRegisters.3.40799_Maximale_Batterieentladeleistung',
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
    powerAC: 'modbus.0.inputRegisters.3.30775_AC-Leistung',
}

const bydDirectSOCDP  = 'bydhvs.0.State.SOC';                            // battSOC netto direkt von der Batterie
const _maxdischrg_def = getState(communicationRegisters.wMaxCha).val;    // 10600
let _dc_now           = getState(inputRegisters.dc1).val + getState(inputRegisters.dc2).val;  // pv vom Dach zusammen in W
let _verbrauchJetzt   = 0;

const _InitCom_Aus = 803;
const _InitCom_An = 802;

let _SpntCom = _InitCom_Aus;           //   802: aktiv (Act)    803: inaktiv (Ina)
let _lastSpntCom = 0;
let _bydDirectSOC = 5;
let _bydDirectSOCMrk = 0;
let _batsoc = 0;
let _macheNix = false;
let _entladung_zeitfenster = false;
let _max_pwr = 0;
let _notLadung = false;


// für tibber
let _tibberNutzenSteuerung = true;    //wird _tibberNutzenAutomatisch benutzt (dyn. Strompreis) 
let _tibberNutzenAutomatisch = _tibberNutzenSteuerung;
let _tibberPreisJetzt = getState(tibberPreisJetztDP).val;

// für prognose
let _prognoseNutzenSteuerung = true;    //wird _tibberNutzenAutomatisch benutzt (dyn. Strompreis)
let _prognoseNutzenAutomatisch = _prognoseNutzenSteuerung; //wird _prognoseNutzenAutomatisch benutzt
let _batterieLadenUebersteuernManuell = false;
let _tomorrow_kW = 0;

// tibber Preis Bereich
let _snowmode = false;                  //manuelles setzen des Schneemodus, dadurch wird in der Nachladeplanung die PV Prognose ignoriert, z.b. bei Schneebedeckten PV Modulen und der daraus resultierenden falschen Prognose
const _start_charge = 0.18;             //Eigenverbrauchspreis
const _pause_charge = 0.30;             //pausiere bis preis grösser 
const _lossfactor = 0.75;               //System gesamtverlust in % (Lade+Entlade Effizienz), nur für tibber Preisberechnung
const _loadfact = 1 / _lossfactor;      /// 1,33
const _stop_discharge = (_start_charge * _loadfact);    /// 0.18 * 1.33 = 0.239 €

createUserStates(userDataDP, false, [tibberStromDP + 'extra.schwellenwert_Entladung', { 'name': 'stoppe Entladung bei Preis von', 'type': 'number', 'read': true, 'write': false, 'role': 'value', 'def': 0 }], function () {
    setState(tibberDP + 'extra.schwellenwert_Entladung', _stop_discharge, true);
});
createUserStates(userDataDP, false, [tibberStromDP + 'extra.schwellenwert_Ladung', { 'name': 'starte Ladung mit Strom bei Preis von', 'type': 'number', 'read': true, 'write': false, 'role': 'value', 'def': 0 }], function () {
    setState(tibberDP + 'extra.schwellenwert_Ladung', _start_charge, true);
});
createUserStates(userDataDP, false, [tibberStromDP + 'debug', { 'name': 'debug', 'type': 'boolean', 'read': true, 'write': true, 'role': 'state', 'def': false }], function () {
    setState(tibberDP + 'debug', _debug, true);
});
createUserStates(userDataDP, false, [tibberStromDP + 'extra.PV_Ueberschuss', { 'name': 'wie viele Wh Überschuss', 'type': 'number', 'read': true, 'write': false, 'role': 'value', 'unit': 'Wh', 'def': 0 }], function () {
    setState(tibberDP + 'extra.PV_Ueberschuss', 0, true);
});
createUserStates(userDataDP, false, [tibberStromDP + 'extra.tibberNutzenAutomatisch', { 'name': 'mit tibber laden erlauben', 'type': 'boolean', 'read': true, 'write': true, 'role': 'state', 'def': true }], function () {
    setState(tibberDP + 'extra.tibberNutzenAutomatisch', _tibberNutzenAutomatisch, true);
});
createUserStates(userDataDP, false, [tibberStromDP + 'extra.tibberNutzenManuell', { 'name': 'manuelles laden automatisch wird übersteuert', 'type': 'boolean', 'read': true, 'write': true, 'role': 'state', 'def': false }], function () {
    setState(tibberDP + 'extra.tibberNutzenManuell', false, true);
});
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


// zum übersteuern
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
createUserStates(userDataDP, false, ['.strom.PV_Leistung_aktuell', { 'name': 'dc1 + dc2', 'type': 'number', 'read': true, 'write': false, 'role': 'value', 'def': 0, 'unit': 'kW', }], function () {
    setState(userDataDP + '.strom.PV_Leistung_aktuell', _dc_now, true);
});
*/

console.warn('***************************************************');
console.warn('starte ladenNachPrognose mit debug ' + _debug);

// bei start immer initialisieren
if (_tibberPreisJetzt <= _stop_discharge || _batsoc == 0) {
    console.warn('starte direkt mit Begrenzung da Preis unter schwelle');
    _entladung_zeitfenster = true;
} else {
    setState(communicationRegisters.fedInSpntCom, _InitCom_Aus);
    setState(spntComCheckDP, _InitCom_Aus, true);
}


setState(communicationRegisters.maxchrg, _maxdischrg_def);
setState(communicationRegisters.maxdischrg, _maxdischrg_def);


// ab hier Programmcode
async function processing() {

    _macheNix = false;
    _SpntCom = _InitCom_Aus;

    if (_sma_em.length > 0){
        inputRegisters.powerOut = _sma_em + ".psurplus" /*aktuelle Einspeiseleistung am Netzanschlußpunkt, SMA-EM Adapter*/
    }

    let dateNow = new Date();

    let pvlimit       = (_pvPeak / 100 * _surplusLimit);                       //pvlimit = 12000/100*0 = 0
    let einspeisung   = Math.round(getState(inputRegisters.powerOut).val);     // Einspeisung  in W
    _batsoc           = Math.min(getState(inputRegisters.batSoC).val, 100);    //batsoc = Batterieladestand vom WR         

    _dc_now           = getState(inputRegisters.dc1).val + getState(inputRegisters.dc2).val;  // pv vom Dach zusammen in W

    if (_dc_now < 10) {              // alles was unter 10 KW kann weg
        _dc_now = 0;
    }

    let dc_now_DP     = _dc_now; 
    if (dc_now_DP <= 0) {
        dc_now_DP = 0;
    } else {
        dc_now_DP = Math.round((dc_now_DP /1000)*100)/100;
    }

    setState(userDataDP + '.strom.PV_Leistung_aktuell', dc_now_DP, true);

    let battOut     = getState(inputRegisters.battOut).val;
    let battIn      = getState(inputRegisters.battIn).val;
    let netzbezug   = getState(inputRegisters.netzbezug).val;
    let powerAC     = getState(inputRegisters.powerAC).val * -1;

    let batterieLadenUhrzeit          = getState(batterieLadenUhrzeitDP).val;
    let batterieLadenUhrzeitStart     = getState(batterieLadenUhrzeitStartDP).val;

    vehicleConsum = 0;

    if (considerVehicle) {
        isVehicleConn = getState(isVehicleConnDP).val;
        if (isVehicleConn) {
            vehicleConsum = getState(vehicleConsumDP).val;

            if (vehicleConsum < 0 || vehicleConsum > maxVehicleConsum) { // sollte murks vom adapter kommen dann setze auf 0
                 vehicleConsum = 0;   
            }
        }
    }                                

    _verbrauchJetzt = 100 + _dc_now + battOut + netzbezug - einspeisung - battIn;        // verbrauch in W , 100W reserve obendruaf

    /* Default Werte setzen*/
    let battStatus = getState(inputRegisters.betriebszustandBatterie).val;
    let PwrAtCom = _pwrAtCom_def;          //PwrArCom = 11600

    let isTibber_active = 0;
    _tibberPreisJetzt = getState(tibberPreisJetztDP).val;
    _tomorrow_kW     = getState(tomorrow_kWDP).val;

    if (_dc_now > _verbrauchJetzt) {
        _max_pwr = (_dc_now - _verbrauchJetzt) * -1;   // vorbelegung zum laden
    } else {
        _max_pwr = _mindischrg;
    }
    
    // Lademenge
    let lademenge_full = Math.ceil((_batteryCapacity * (100 - _batsoc) / 100) * (1 / _wr_efficiency));                       //Energiemenge bis vollständige Ladung
    let lademenge = Math.max(Math.ceil((_batteryCapacity * (_batteryTarget - _batsoc) / 100) * (1 / _wr_efficiency)), 0);    //lademenge = Energiemenge bis vollständige Ladung
    let restladezeit = lademenge / _batteryLadePower;                                                                               //Ladezeit = Energiemenge bis vollständige Ladung / Ladeleistung WR

    if (restladezeit <= 0) {
        restladezeit = 0;
        lademenge = lademenge_full;
    }
    if (_debug) {
        console.warn('Verbrauch jetzt_________________ ' + _verbrauchJetzt + ' W');
        console.warn('PV Produktion___________________ ' + _dc_now + ' W');
        console.warn('Ladeleistung Batterie___________ ' + _batteryLadePower + ' W');
        console.warn('Einspeiseleistung_______________ ' + einspeisung + ' W');
        console.warn('Batt_SOC________________________ ' + _batsoc + ' %');
        const battsts = battStatus == 2291 ? 'Batterie Standby' : battStatus == 3664 ? 'Notladebetrieb' : battStatus == 2292 ? 'Batterie laden' : battStatus == 2293 ? 'Batterie entladen' : 'Aus';
        console.warn('Batt_Status_____________________ ' + battsts + ' = ' + battStatus);
        console.warn('Lademenge bis voll______________ ' + lademenge_full + ' Wh');
        console.warn('Lademenge_______________________ ' + lademenge + ' Wh');
        console.warn('Restladezeit____________________ ' + restladezeit.toFixed(2) + ' h');
    }

    if (_tibberNutzenSteuerung) {
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
            if (poi[x][0] < _start_charge) {
                lowprice[x] = poi[x];
            }
        }
        
        const hhJetzt = getHH(); 
        let nowhalfhr = hhJetzt + ':00';
        
        let batlefthrs = ((_batteryCapacity / 100) * _batsoc) / (_baseLoad / Math.sqrt(_lossfactor));    /// 12800 / 100 * 30
        batlefthrs = Number(batlefthrs.toFixed(2));
        
        let hrstorun = 24;     

        if (_debug) {
            console.warn('Bat h verbleibend ' + batlefthrs);
        }

        //wieviel wh kommen in etwa von PV in den nächsten 24h
        let pvwh = 0;
        for (let p = 0; p < hrstorun * 2; p++) {
            pvwh = pvwh + (getState(pvforecastDP + p + '.power').val / 2);
        }

        setState(tibberDP + 'extra.PV_Prognose', Math.round(pvwh), true);

        if (_debug) {
            console.warn('Erwarte ca ' + (pvwh / 1000).toFixed(1) + ' kWh von PV');
        }

        if (pvwh > (_baseLoad * hrstorun / 2) && !_snowmode) {   
            let sunup    = getAstroDate('sunriseEnd').getHours() + ':' + getAstroDate('sunriseEnd').getMinutes();
            const today    = new Date();
            const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
            let sundown  = getAstroDate('sunsetStart', tomorrow).getHours() + ':' + getAstroDate('sunsetStart', tomorrow).getMinutes();
            
            if (_debug) {
                console.warn('Nachtfenster nach Astro : ' + sundown + ' - ' + sunup);
            }

            for (let sd = 47; sd >= 0; sd--) {
                const pow = getState(pvforecastDP + sd + '.power').val;

                if (pow <= 750 && pow != 0) {
                    sundown = getState(pvforecastDP + sd + '.startTime').val;

                    for (let su = 0; su < 48; su++) {
                        if (getState(pvforecastDP + su + '.power').val >= _baseLoad) {
                            sunup = getState(pvforecastDP + su + '.startTime').val;
                            break;
                        }
                    }                    
                    break;
                }
            }

            let sundownTime  = datumTimestamp(sundown, 0);     // untergang
            let sunriseTime  = datumTimestamp(sunup, 1);       // aufgang am nächsten tag  

            let sundownhr = sundown;

            if (compareTime(sundown, sunup, 'between')) {
                sundownTime = dateNow.getTime();
                sundownhr = nowhalfhr;  
                
                if (compareTime('00:00', sunup, 'between')) {
                    sunriseTime = datumTimestamp(sunup, 0);         
                }
            }

            hrstorun = Math.min((sunriseTime  - sundownTime) / (1000 * 60 * 60), 24);
            hrstorun = Number(hrstorun.toFixed(2));

            if (_debug) {
                console.warn('Nachtfenster : ' + sundownhr + ' - ' + sunup + ' hrstorun (' + hrstorun + ' h)');
            }

            pvwh = 0;
            //wieviel wh kommen in etwa von PV die verkürzt
            for (let p = 24; p < 48; p++) {
                pvwh = pvwh + (getState(pvforecastDP + p + '.power').val / 2);
            }

            setState(tibberDP + 'extra.PV_Prognose_kurz', Math.round(pvwh), true);

            if (_debug) {
                console.warn('Erwarte ca ' + (pvwh / 1000).toFixed(1) + ' kWh von PV verkürtzt');
            }
        }

        let poihigh = [];

        let pricehrs = hrstorun;

        //neue Preisdaten ab 14 Uhr
        if (compareTime('14:00', null, '<', null)) {
            let remainhrs = 24 - dateNow.getHours();
            if (pricehrs > remainhrs) {
                pricehrs = remainhrs;
            }
        }
        
        let tti = 0;        
        let nachtIdx = Number(hhJetzt);

        for (let t = 0; t < pricehrs; t++) {     // nimm alle stunden ab laufender stunde 
            let hrparse  = getState(tibberDP + nachtIdx + '.startTime').val.split(':')[0];
            let prcparse = getState(tibberDP + nachtIdx + '.price').val;

            poihigh[tti] = [prcparse, hrparse + ':00', hrparse + ':30'];

            tti++;
            if (t == 0 && nowhalfhr == (hrparse + ':30')) {
                tti--;
            }
            poihigh[tti] = [prcparse, hrparse + ':30', getState(tibberDP + nachtIdx + '.endTime').val];
            tti++;

            nachtIdx++;
            if (nachtIdx > 23) {
                nachtIdx = 0;
            }
        }

        if (_debug) {
            console.warn('poihigh.length ' + poihigh.length + ' poihigh vor nachladen: ' + JSON.stringify(poihigh) );
        }

        // ggf nachladen?
        let prclow = [];
        let prchigh = [];
        let ladeZeitenArray = [];

        if (_debug) {
            console.warn('batlefthrs ' + batlefthrs + ' hrstorun ' + hrstorun);
        }

        if (batlefthrs < hrstorun) {          
            let pricelimit = 0;
            let m = 0;

            for (let h = 0; h < poihigh.length; h++) {
                pricelimit = (poihigh[h][0] * _loadfact);
                for (let l = h; l < poihigh.length; l++) {
                    if (poihigh[l][0] > pricelimit && poihigh[l][0] > _stop_discharge) {
                        prclow[m] = poihigh[h];
                        prchigh[m] = poihigh[l];
                        m++;
                    }
                }
            }

            let uniqueprclow = prclow.filter(function (value, index, self) {
                return self.indexOf(value) === index;
            });

            let uniqueprchigh = prchigh.filter(function (value, index, self) {
                return self.indexOf(value) === index;
            });

            prclow = [];
            prclow = uniqueprclow;
            prchigh = [];
            prchigh = uniqueprchigh;

            prclow.sort(function (a, b) {
                return a[0] - b[0];
            })

            //nachlademenge 
            let chargewh = ((prchigh.length) * (_baseLoad / 2) * 1 / _wr_efficiency);

            if (hrstorun < 24 && !_snowmode) {
                chargewh = chargewh - (pvwh * _wr_efficiency);
            }
            let curbatwh = ((_batteryCapacity / 100) * _batsoc);
            let chrglength = Math.max((chargewh - curbatwh) / (_batteryLadePower * _wr_efficiency), 0) * 2;

            // neuaufbau poihigh ohne Nachladestunden
            let poitmp = [];
            m = 0;

            for (let l = 0; l < poihigh.length; l++) {
                poitmp[m] = poihigh[l];
                m++;
                if (prclow.length > 0) {
                    for (let p = 0; p < prclow.length; p++) {
                        if (poihigh[l][1] == prclow[p][1]) {
                            poitmp.pop();
                            m--;
                        }
                    }
                    if (poitmp.length > 0) {   // && prclow.length > 1 && poihigh[0][1] != prclow[0][1]
                        if (poihigh[l][2] == prclow[0][1]) {
                            break;
                        }
                    }
                }
            }

            if (poitmp.length > 0) {
                poihigh = [];
                poihigh = poitmp;
            }
            
            if (chrglength > prclow.length) {
                chrglength = prclow.length;
            }

            if (chrglength > 0 && prclow.length > 0) {
                for (let o = 0; o < chrglength; o++) {
                    if (_debug) {
                        console.warn('Nachladezeit: ' + prclow[o][1] + '-' + prclow[o][2] + ' (' + Math.round(chargewh - curbatwh) + ' Wh)');
                    }
                }
                // nachladung starten da in der zwischenzeit
                if (prclow.length > 0 && chargewh - curbatwh > 0) {
                    for (let n = 0; n < chrglength; n++) {

                        ladeZeitenArray.push(prclow[n]);
                        if (compareTime(prclow[n][1], prclow[n][2], 'between')) {
                            _SpntCom = _InitCom_An;
                            _max_pwr = _pwrAtCom_def * -1;
                            _macheNix = true;
                            isTibber_active = 1;
                            break;
                        }
                    }
                }
            }
        }

        if (!_macheNix) {
            poihigh.sort(function (a, b) {      // sortiert höchster preis zuerst            
                return b[0] - a[0];
            });
            
            if (_debug) {
                console.warn('poihigh.length '+ poihigh.length + ' poihigh sortiert ' + JSON.stringify(poihigh));
            }

            let lefthrs = batlefthrs * 2;             // batlefthrs Bat h verbleibend

            if (lefthrs > 0 && lefthrs > poihigh.length) {
                lefthrs = poihigh.length;            
            }      

            let entladeZeitenArray = [];

            if (_batsoc > 0) {             // doppelt hält besser
                if (lefthrs > 0 && lefthrs < hrstorun * 2 && pvwh < _baseLoad * 24 * _wr_efficiency) {
                    if (batlefthrs >= hrstorun) {             // die laufzeit reicht bis zum sonnenaufgang entlade alles
                        if (_debug) {
                            console.warn('Entladezeit reicht aus bis zum Sonnaufgang ' + hrstorun + ' - ' + batlefthrs);
                        }
                        _SpntCom = _InitCom_Aus;
                        _max_pwr = 0;
                        _macheNix = true;
                        isTibber_active = 2;                                        
                        _entladung_zeitfenster = true;
                        entladeZeitenArray.push(0.00, lefthrs, batlefthrs);  //  [0.2856,"19:30","20:00"]
                    } else {                        
                        for (let d = 0; d < lefthrs; d++) {
                            if (poihigh[d] != null) {
                                if (poihigh[d][0] > _stop_discharge) {
                                    _entladung_zeitfenster = false;
                                    _SpntCom = _InitCom_An;
                                    
                                    if (_debug) {
                                        console.warn('Entladezeiten: ' + poihigh[d][1] + '-' + poihigh[d][2] + ' Preis ' + poihigh[d][0] + ' Fahrzeug zieht ' + vehicleConsum + ' W');
                                    }

                                    entladeZeitenArray.push(poihigh[d]);                                        

                                    if (compareTime(poihigh[d][1], poihigh[d][2], "between")) {
                                        if (vehicleConsum > 0) {                        // wenn fahrzeug am laden dann aber nicht aus der batterie laden
                                            break;                                            
                                        } else {
                                            if (_dc_now <= _baseLoad) { // entlade nur wenn sich das lohnt
                                                _SpntCom = _InitCom_Aus;
                                                _max_pwr = 0;
                                                _macheNix = true;
                                                isTibber_active = 2;                                        
                                                _entladung_zeitfenster = true;
                                                break;
                                            }
                                        }
                                    }
                                } 
                            }
                        }
                    }
                }
            }

            // sortiere die zeiten für die Vis
            entladeZeitenArray = filterPastTimes(entladeZeitenArray);
            entladeZeitenArray = sortBySecondElement(entladeZeitenArray);           

            setState(tibberDP + 'extra.entladeZeitenArray', entladeZeitenArray, true);

            if (!_macheNix) {
                //entladung stoppen wenn preisschwelle erreicht
                if ((_tibberPreisJetzt <= _stop_discharge || _batsoc == 0) && _entladung_zeitfenster) {
                    if (_debug) {
                        console.warn('Stoppe Entladung, Preis jetzt ' + _tibberPreisJetzt + ' ct/kWh unter Batterieschwelle von ' + _stop_discharge.toFixed(2) + ' ct/kWh');
                    }
                    _SpntCom = _InitCom_An;
                    _max_pwr = _mindischrg;                    
                    isTibber_active = 3;
                }
     
                // starte die ladung
                if (_tibberPreisJetzt < _start_charge) {
                    let length = Math.ceil(restladezeit);

                    if (length > lowprice.length) {
                        length = lowprice.length;
                        if (_debug) {
                            console.warn('Starte Ladung : ' + JSON.stringify(lowprice));
                        }
                    }
                    for (let i = 0; i < length; i++) {
                        ladeZeitenArray.push(lowprice[i]);
                        if (compareTime(lowprice[i][1], lowprice[i][2], 'between') && _dc_now < _verbrauchJetzt) { 
                            if (_debug) {
                                console.warn('Starte Ladung: ' + lowprice[i][1] + '-' + lowprice[i][2] + ' Preis ' + lowprice[i][0]);
                            }
                            _SpntCom = _InitCom_An;
                            _max_pwr = _pwrAtCom_def * -1;
                            isTibber_active = 5;
                            break;
                        }
                    }
                } 

                     //ladung stoppen wenn Restladezeit kleiner Billigstromzeitfenster
                if (lowprice.length > 0 && restladezeit <= lowprice.length && isTibber_active == 5) {
                    if (_debug) {
                        console.warn('Stoppe Ladung, lowprice.length ' + lowprice.length);
                    }
                    _SpntCom = _InitCom_An;
                    _max_pwr = _mindischrg;
                    isTibber_active = 4;
                }              
            }
        }

        ladeZeitenArray.sort(function (a, b) {
            return b[1] - a[1];
        });
        setState(tibberDP + 'extra.ladeZeitenArray', ladeZeitenArray, true);
    }


    // ----------------------------------------------------  Start der PV Prognose Sektion

//    isTibber_active = 1;    Nachladezeit
//    isTibber_active = 2;    Entladezeiten
//    isTibber_active = 3;    entladung stoppen wenn preisschwelle erreicht
//    isTibber_active = 4;    ladung stoppen wenn Restladezeit kleiner Billigstromzeitfenster
//    isTibber_active = 5;    starte die ladung


    if (_debug) {
        console.error('-->> Start der PV Prognose Sektion : _SpntCom ' + _SpntCom + ' _max_pwr ' + _max_pwr + ' _macheNix ' + _macheNix + ' isTibber_active ' + isTibber_active);
        console.error('-->> PV jetzt ' + _dc_now + ' Verbrauch jetzt ' + _verbrauchJetzt);
    }

    if (batterieLadenUhrzeitStart && getHH() >= batterieLadenUhrzeit && _dc_now > _verbrauchJetzt) {    // laden übersteuern ab bestimmter uhrzeit
        if (_debug) {
            console.error('-->> übersteuert mit nach Uhrzeit laden und genug PV');
        }
        _SpntCom = _InitCom_Aus;
        _prognoseNutzenSteuerung = false;
    }

    if (_batsoc > 99 && _dc_now > 0) {
        _prognoseNutzenSteuerung = false;   
    }
   
    if (_dc_now > _verbrauchJetzt) {                                      // macht nur sinn wenn gunug PV      
        if (_prognoseNutzenSteuerung) {
        
            let latesttime;
            let pvfc = [];
            let f = 0;
            
            for (let p = 0; p < 48; p++) { /* 48 = 24h a 30min Fenster*/
                let pvpower50 = getState(pvforecastDP + p + '.power').val;
                let pvpower90 = getState(pvforecastDP + p + '.power90').val;
                let pvendtime = getState(pvforecastDP + p + '.endTime').val;
                let pvstarttime = getState(pvforecastDP + p + '.startTime').val;

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

            if (pvfc.length > 0) {
                latesttime = pvfc[(pvfc.length - 1)][4];
            }

            pvfc.sort(function (b, a) {
                return a[1] - b[1];
            });

            if (_debug && latesttime) {
                console.warn('Abschluss PV bis ' + latesttime);
            }

            // verschieben des Ladevorgangs in den Bereich der PV Limitierung. batterie ist nicht in notladebetrieb
            if (_debug) {
                console.warn('pvfc.length ' + pvfc.length + ' Restladezeit ' + restladezeit);
            }

            if (restladezeit > 0 && (restladezeit * 2) <= pvfc.length) {  // wenn die ladedauer kleiner ist als die vorhersage 
                // Bugfix zur behebung der array interval von 30min und update interval 1h
                if (compareTime(latesttime, null, '<=', null)) {
                    _max_pwr = _mindischrg;
                }
                //berechnung zur entzerrung entlang der pv kurve, oberhalb des einspeiselimits
                let get_wh = 0;
                let get_wh_einzeln = 0;
                
                for (let k = 0; k < pvfc.length; k++) {
                    let pvpower = pvfc[k][0];
                    let minutes = 30;

                    if (pvpower < (pvlimit + _baseLoad)) {
                        pvpower = pvfc[k][1];
                    }

                    minutes = pvfc[k][2];

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

                //    if (_debug) {
                //        console.warn('Überschuß ' + Math.round(get_wh_einzeln) + ' Wh für Minuten ' + minutes + ' mit PV ' + pvfc[k][0] + ' und startzeit ' + pvfc[k][3]);
                //    }

                    get_wh = get_wh + Number(get_wh_einzeln.toFixed(2));
                }

                setState(tibberDP + 'extra.PV_Ueberschuss', get_wh, true);

                pvfc = sortiereNachUhrzeit(pvfc);

                if (_debug) {
            //        console.warn('pvfc ' + JSON.stringify(pvfc));
                    console.warn('get_wh vor entzerren ' + get_wh);
                }

                let pvlimit_calc = pvlimit;
                let min_pwr = 0;

                if (restladezeit > 0 && lademenge > 0 && lademenge > get_wh) {
                    if ((restladezeit * 2) <= pvfc.length) {
                        restladezeit = pvfc.length / 2;                          //entzerren des Ladevorganges
                    }
                    
                    pvlimit_calc = Math.max((Math.round(pvlimit - ((lademenge - get_wh) / restladezeit))), 0); //virtuelles reduzieren des pvlimits
                    min_pwr = Math.max(Math.round((lademenge - get_wh) / restladezeit), 0);                   

                    get_wh = lademenge;       //daran liegts damit der unten immer rein geht ????                    

                }

                if (_debug) {
                    console.warn('-->   Verschiebe Einspeiselimit auf pvlimit_calc ' + pvlimit_calc + ' W' + ' mit mindestens ' + min_pwr + ' W  get_wh ' + get_wh);
                }

                let current_pwr_diff = 0;

                if (lademenge > 0 && get_wh >= lademenge) {
                    restladezeit = pvfc.length / 2;
                    current_pwr_diff =_dc_now - _verbrauchJetzt;
                    _max_pwr = Math.round(current_pwr_diff);
          
                    if (_debug) {
                        console.warn('-->> Einspeisung ' + einspeisung + ' _verbrauchJetzt ' + _verbrauchJetzt + ' current_pwr_diff ' + current_pwr_diff + ' restladezeit ' + restladezeit);
                        console.warn('-->> aus der Begrenzung holen... ' + _max_pwr + ' _SpntCom ' + _SpntCom + ' isTibber_active ' + isTibber_active);
                    }
                    
                    //aus der begrenzung holen.. her evtl. 
                    if (powerAC <= 10 && current_pwr_diff > 0) {
                        _max_pwr = Math.round(pvfc[0][1] - pvlimit_calc);

                        if (current_pwr_diff > _max_pwr) {
                            _max_pwr = Math.round(current_pwr_diff);                       
                        }
                        if (_debug) { 
                            console.warn('nach der Begrenzung  :_max_pwr ' + _max_pwr + ' pvfc[0][1] ' + pvfc[0][1] + ' startzeit ' + pvfc[0][3] + ' pvlimit_calc ' + pvlimit_calc);
                        }
                    }
                }

                if (_debug) {               
                    console.warn('Ausgabe A  :_max_pwr ' + _max_pwr + ' min_pwr ' + min_pwr + ' _batteryLadePower ' + _batteryLadePower);
                }

                _max_pwr = Math.round(Math.min(Math.max(_max_pwr, min_pwr), _batteryLadePower)); //abfangen negativer werte, limitiere auf min_pwr orginal

                if (_debug) {               
                    console.warn('Ausgabe B  :_max_pwr ' + _max_pwr);
                }
                
                let ladezeit = false;

                for (let h = 0; h < (restladezeit * 2); h++) {
                    if ((compareTime(pvfc[h][3], pvfc[h][4], 'between')) || (einspeisung + powerAC) >= (pvlimit - 100)) {
                        if (_debug) {
                            console.error('-->> Bingo ladezeit mit überschuss _max_pwr ' +_max_pwr + '  ' + pvfc[h][0] + ' ' + pvfc[h][1]);
                        }     
                        _SpntCom = _InitCom_An;                       
                               
                        if (_max_pwr > _dc_now - _verbrauchJetzt) {  // wenn das ermittelte wert grösser ist als die realität dann limmitiere
                            _max_pwr = _dc_now - _verbrauchJetzt;   
                        }

                        if (_batsoc > 95) {     // letzten 5 % langsam laden
                            _max_pwr = _lastPercentageLoadWith;    
                        }

                        _max_pwr = _max_pwr * -1;

                        ladezeit = true;
                        break;
                    }
                }

                if (!ladezeit) {          // sicherstellen dass die batterie nicht entladen wird wenn falsche Werte
                    _max_pwr = 0;        
                }

            } 
        }
    }

// ---------------------------------------------------- Ende der PV Prognose Sektion
    if (_max_pwr == _mindischrg || _max_pwr == 0) {
        _max_pwr = _mindischrg * -1;  // negiere das ganze 
    }

    PwrAtCom = _max_pwr;

    if (_tibberNutzenSteuerung || _prognoseNutzenSteuerung) {               // doppelt hält besser
// ----------------------------------------------------           write data

        if (_SpntCom == _InitCom_An || _SpntCom != _lastSpntCom) {
            if (_debug) {
                console.warn('Daten gesendet an WR kommunikation Wirkleistungvorgabe : ' + PwrAtCom + ' comm ' + _SpntCom);
            }
            setState(communicationRegisters.fedInPwrAtCom, PwrAtCom);       // 40149_Wirkleistungvorgabe
            setState(communicationRegisters.fedInSpntCom, _SpntCom);        // 40151_Kommunikation
            setState(spntComCheckDP, _SpntCom, true);                               // check DP für vis
        }

        if (_debug) {
            console.warn('SpntCom jetzt ' + _SpntCom + ' davor war ' + _lastSpntCom + ' Wirkleistungvorgabe ' + PwrAtCom + ' _verbrauchJetzt ' + _verbrauchJetzt + ' pv_jetzt ' + _dc_now);
            console.warn('----------------------------------------------------------------------------------');
        }

        _lastSpntCom = _SpntCom;
        
    }  else {
        if (!_notLadung) {
            if (_SpntCom != _lastSpntCom) {
                console.warn('Tibber und Prognose sind aus');
                _SpntCom = _InitCom_Aus;
                setState(communicationRegisters.fedInSpntCom, _SpntCom);        // 40151_Kommunikation
                setState(spntComCheckDP, _SpntCom, true);                               // check DP für vis
                _lastSpntCom = _SpntCom;
            }
        }
    }
}


/* ***************************************************************************************************************************************** */

on({ id: inputRegisters.triggerDP, change: 'any' }, function () {  // aktualisiere laut adapter abfrageintervall
    _debug = getState(tibberDP + 'debug').val;
    _snowmode = getState(userDataDP + '.strom.tibber.extra.PV_Schneebedeckt').val;
    _tibberNutzenAutomatisch = getState(tibberDP + 'extra.tibberNutzenAutomatisch').val;           // aus dem DP kommend sollte true sein für vis
    _prognoseNutzenAutomatisch = getState(tibberDP + 'extra.prognoseNutzenAutomatisch').val;       // aus dem DP kommend sollte true sein für vis

    _tibberNutzenSteuerung = _tibberNutzenAutomatisch;       // init
    _prognoseNutzenSteuerung = _prognoseNutzenAutomatisch;      // init

    // übersteuern nach prio manuell zuerst dann autoamtisch oder battsoc unter 5 %
    const _tibberNutzenManuell = getState(tibberDP + 'extra.tibberNutzenManuell').val;
    _batterieLadenUebersteuernManuell = getState(batterieLadenManuellStartDP).val;

    if (_batterieLadenUebersteuernManuell || _tibberNutzenManuell) {
        _tibberNutzenSteuerung = false;     // der steuert intern ob lauf gültig  für tibber laden/entladen
        _prognoseNutzenSteuerung = false;   // der steuert intern ob lauf gültig  für pv laden                                     
    }

    if (_debug) {
        console.error(' _tibberNutzenAutomatisch ' + _tibberNutzenAutomatisch + ' _prognoseNutzenAutomatisch ' + _prognoseNutzenAutomatisch);
    }

    // ---     check ob notladung nötig
    _notLadung = notLadungCheck();

    if (_notLadung) {
        _tibberNutzenSteuerung = false;
        _prognoseNutzenSteuerung = false;
    }

    if (_debug) {
        console.warn(' _tibberNutzenSteuerung ' + _tibberNutzenSteuerung + ' _prognoseNutzenSteuerung ' + _prognoseNutzenSteuerung);
    }

    setTimeout(function () {
        processing();             /*start processing in interval*/
    }, 500);                        // verzögerung zwecks Datenabholung

});

function notLadungCheck() {
    _bydDirectSOC = getState(bydDirectSOCDP).val;   

    if (!_batterieLadenUebersteuernManuell) {       
        if (_bydDirectSOC < 6 && _dc_now < _baseLoad) {
            if (_bydDirectSOC != _bydDirectSOCMrk) {
                console.warn(' -----------------    Batterie NOTLADEN ' + _bydDirectSOC + ' %');
                _bydDirectSOCMrk = _bydDirectSOC;
            }
           
            setState(communicationRegisters.fedInPwrAtCom, _batteryPowerEmergency);
            _SpntCom = _InitCom_An;
            setState(communicationRegisters.fedInSpntCom, _SpntCom);
            setState(spntComCheckDP, _SpntCom, true);
            _lastSpntCom = 0;
            return true;            
        }
    }
    return false;
}

function sortBySecondElement(arr) {
    arr.sort((a, b) => {
        const timeA = a[1];
        const timeB = b[1];
        if (timeA < timeB) return -1;
        if (timeA > timeB) return 1;
        return 0;
    });
    return arr;
}
function filterPastTimes(arr) {
    const currentTime = new Date();         // Aktuelle Zeit
    const currentHours = currentTime.getHours();
    const currentMinutes = currentTime.getMinutes();
    const currentTimeString = `${currentHours.toString().padStart(2, '0')}:${currentMinutes.toString().padStart(2, '0')}`;
    
    return arr.filter(item => {
        const endTime = item[2];            // Das Endzeitfeld des Unterarrays
        return endTime > currentTimeString; // Rückgabe, ob die Endzeit nach der aktuellen Zeit liegt
    });
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

function datumTimestamp(uhrzeit, val) {
    // Aktuelles Datum erstellen
    let currentDate = new Date();

    // Uhrzeit extrahieren und in Stunden und Minuten aufteilen
    let [stunden, minuten] = uhrzeit.split(':').map(Number);

    // Einen Tag hinzufügen
    currentDate.setDate(currentDate.getDate() + val);

    // Datum auf morgen setzen
    currentDate.setHours(stunden, minuten, 0, 0);
 
    return currentDate.getTime();
}

on({
    id: [
        tibberDP + 'extra.tibberNutzenAutomatisch',
        tibberDP + 'extra.prognoseNutzenAutomatisch',
    ], change: 'any', val: false
}, function () {
    const SpntCom = _InitCom_Aus;
    setState(communicationRegisters.fedInSpntCom, SpntCom);
    setState(spntComCheckDP, SpntCom, true);
    _lastSpntCom = 0;
});
