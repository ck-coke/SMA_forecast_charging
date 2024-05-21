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
const _pvPeak                   = 13100;                                // PV-Anlagenleistung in Wp
const _batteryCapacity          = 12800;                                // Netto Batterie Kapazität in Wh BYD 2.56 pro Modul
const _surplusLimit             = 0;                                    // PV-Einspeise-Limit in %  . 0 keine Einspeisung
const _batteryTarget            = 100;                                  // Gewünschtes Ladeziel der Regelung (e.g., 85% for lead-acid, 100% for Li-Ion)
const _lastPercentageLoadWith   = -500;                                 // letzten 5 % laden mit xxx Watt
const _baseLoad                 = 850;                                  // Grundverbrauch in Watt
const _wr_efficiency            = 0.93;                                 // Batterie- und WR-Effizienz (e.g., 0.9 for Li-Ion, 0.8 for PB)
const _batteryPowerEmergency    = -4000;                                // Ladeleistung der Batterie in W notladung
const _mindischrg               = -1;                                   // min entlade W
const _batteryLadePowerMax      = 5000;                                 // max Batterie ladung 
const _lossfactor               = 0.75;                                 // System gesamtverlust in % (Lade+Entlade Effizienz)
const _pwrAtCom_def             = _batteryLadePowerMax * (253 / 230);   // max power bei 253V = 5500 W
const _sma_em                   = 'sma-em.0.3015242334';                // Name der SMA EnergyMeter/HM2 Instanz bei installierten SAM-EM Adapter, leer lassen wenn nicht vorhanden
let _batteryLadePower           = _batteryLadePowerMax;                 // Ladeleistung laufend der Batterie in W
const _loadfact                 = 1 / _lossfactor;                      // 1,33

// manuelles reduzieren der PV um x Watt
let _power50Reduzierung         = 0;                                    // manuelles reduzieren der pv prognose pro stunde bewölkt
let _power90Reduzierung         = 0;                                    // manuelles reduzieren der pv prognose pro stunde ohne wolken


// tibber Preis Bereich
let _snowmode                   = false;                                        // manuelles setzen des Schneemodus, dadurch wird in der Nachladeplanung die PV Prognose ignoriert, z.b. bei Schneebedeckten PV Modulen und der daraus resultierenden falschen Prognose
let _start_charge               = 0.1881;                                       // Eigenverbrauchspreis
const _stop_discharge           = aufrunden(4, _start_charge * _loadfact);      // 0.19 * 1.33 = 0.2533 €


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

const bydDirectSOCDP            = 'bydhvs.0.State.SOC';                            // battSOC netto direkt von der Batterie

let _dc_now                     = 0;  
let _einspeisung                = 0;
let _powerAC                    = 0;

const _InitCom_Aus              = 803;
const _InitCom_An               = 802;

let _SpntCom                    = _InitCom_Aus;           //   802: aktiv (Act)    803: inaktiv (Ina)
let _verbrauchJetzt             = 0;
let _lastSpntCom                = 0;
let _lastpwrAtCom               = 0;
let _bydDirectSOC               = 5;
let _bydDirectSOCMrk            = 0;
let _batsoc                     = 0;
let _max_pwr                    = _mindischrg;
let _maxchrg                    = _mindischrg;
let _tick                       = 0;
let _tibber_active_idx          = 0;
let _today                      = new Date();

let _pvforecastTodayArray       = [];
let _pvforecastTomorrowArray    = [];

let _notLadung                  = false;
let _entladung_zeitfenster      = false;

// für tibber
let _tibberNutzenSteuerung      = true;    //wird _tibberNutzenAutomatisch benutzt (dyn. Strompreis)
let _tibberNutzenAutomatisch    = _tibberNutzenSteuerung;
let _tibberPreisJetzt           = getState(tibberPreisJetztDP).val;

// für prognose
let _prognoseNutzenSteuerung            = true;    //wird _tibberNutzenAutomatisch benutzt (dyn. Strompreis)
let _prognoseNutzenAutomatisch          = _prognoseNutzenSteuerung; //wird _prognoseNutzenAutomatisch benutzt
let _batterieLadenUebersteuernManuell   = false;
let _tomorrow_kW = 0;

let _sunup              = '00:00';
let _sunupAstro         = '00:00';
let _sundown            = '00:00';
let _sundownAstro       = '00:00';
let _sunupTodayAstro    = '00:00';


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
createUserStates(userDataDP, false, [tibberStromDP + 'extra.max_Batterieladung', { 'name': 'wie viele Wh Überschuss', 'type': 'number', 'read': true, 'write': false, 'role': 'value', 'unit': 'W', 'def': 0 }], function () {
    setState(tibberDP + 'extra.max_Batterieladung', 0, true);
});
createUserStates(userDataDP, false, [tibberStromDP + 'extra.Batterielaufzeit', { 'name': 'Batterielaufzeit laut SOC', 'type': 'string', 'read': true, 'write': false, 'role': 'value', 'unit': 'h'}], function () {
    setState(tibberDP + 'extra.Batterielaufzeit', '00:00', true);
});
createUserStates(userDataDP, false, [tibberStromDP + 'extra.BatterieRestladezeit', { 'name': 'Batterierestladezeit laut max_Batterieladung', 'type': 'number', 'read': true, 'write': false, 'role': 'value', 'def': 0, 'unit': 'h'}], function () {
    setState(tibberDP + 'extra.BatterieRestladezeit', 0, true);
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
createUserStates(userDataDP, false, [tibberStromDP + 'extra.entladeZeitenArray', { 'name': 'entladezeiten als array', 'type': 'array', 'read': true, 'write': false, 'role': 'json' }], function () {
    setState(tibberDP + 'extra.entladeZeitenArray', [], true);
});
createUserStates(userDataDP, false, [tibberStromDP + 'extra.ladeZeitenArray', { 'name': 'lade- und nachladezeiten als array', 'type': 'array', 'read': true, 'write': false, 'role': 'json' }], function () {
    setState(tibberDP + 'extra.ladeZeitenArray', [], true);
});
createUserStates(userDataDP, false, [tibberStromDP + 'extra.pvLadeZeitenArray', { 'name': 'PV Ladezeiten als array', 'type': 'array', 'read': true, 'write': false, 'role': 'json' }], function () {
    setState(tibberDP + 'extra.pvLadeZeitenArray', [], true);
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

//            zum einmaligen Erzeugen der Datenpunkte 

/*   Zeile entfernen 
createUserStates(userDataDP, false, [tibberStromDP + 'extra.tibberNutzenManuellHH', { 'name': 'nutze Tibber Preise manuell ab Stunde ', 'type': 'number', 'read': true, 'write': false, 'role': 'value', 'def': 0 }], function () {
    setState(tibberDP + 'extra.tibberNutzenManuellHH', 0, true);
});
createUserStates(userDataDP, false, [tibberStromDP + 'extra.PV_Schneebedeckt', { 'name': 'ist die PV mit Schnee bedekt ', 'type': 'boolean', 'read': true, 'write': true, 'role': 'state', 'def': false }], function () {
    setState(tibberDP + 'extra.PV_Schneebedeckt', false, true);
});
createUserStates(userDataDP, false, ['strom.40151_Kommunikation_Check', { 'name': '40151_Kommunikation_Check', 'type': 'number', 'read': true, 'write': false, 'role': 'value', 'def': 803 }], function () {
    setState(spntComCheckDP, _InitCom_Aus, true);
});
createUserStates(userDataDP, false, [strom.Momentan_Verbrauch', { 'name': 'Momentan_Verbrauch', 'type': 'number', 'read': true, 'write': false, 'role': 'value', 'def': 0, 'unit': 'kW', }], function () {
    setState(momentan_VerbrauchDP, 0, true);
});
createUserStates(userDataDP, false, ['strom.PV_Leistung_aktuell', { 'name': 'PV_Leistung_aktuell dc1 + dc2', 'type': 'number', 'read': true, 'write': false, 'role': 'value', 'def': 0, 'unit': 'kW', }], function () {
    setState(pV_Leistung_aktuellDP, 0, true);
});

Zeile entfernen  */ 

setState(communicationRegisters.fedInSpntCom, _InitCom_Aus);
setState(spntComCheckDP, _InitCom_Aus, true);

console.info('***************************************************');
console.info('starte ladenNachPrognose mit debug ' + _debug);

// bei start immer initialisieren
if (_tibberPreisJetzt <= _stop_discharge && _dc_now <= _verbrauchJetzt) {
    console.warn('starte direkt mit Begrenzung da Preis unter schwelle');
    _entladung_zeitfenster = true;
}

holePVDatenAb();      // hole daten ab nach start

// ab hier Programmcode
async function processing() {

    _tick ++;

    if (_tick >= 60) {         // alle 60 ticks reset damit der WR die Daten bekommt, WR ist auf 10 min reset Eingestellt
        setState(spntComCheckDP, Math.floor(Math.random() * 100) + 1, true);               // schreibe irgendwas da rein.. 
        _tick = 0;
    }

    let macheNix        = false;
    let wirdGeladen     = false;
 
    _bydDirectSOCMrk = 0;

    if (_dc_now < 2) {              // alles was unter 2 W kann weg
        _dc_now = 0;
    }

    let dc_now_DP     = _dc_now;

    if (dc_now_DP <= 0) {
        dc_now_DP = 0;
    } else {
        dc_now_DP = aufrunden(2, dc_now_DP) /1000;  // in kW
    }

    setState(pV_Leistung_aktuellDP, dc_now_DP, true);

    let pvlimit                         = (_pvPeak / 100 * _surplusLimit);      //pvlimit = 13100/100*0 = 0
    const getErtrag                     = getPvErtrag(pvlimit);                   
    const pvfc                          = getErtrag.pvfc;
  //  const pvfcAll                       = getErtrag.pvfcAll;
    let batterieLadenUhrzeit            = getState(batterieLadenUhrzeitDP).val;
    let batterieLadenUhrzeitStart       = getState(batterieLadenUhrzeitStartDP).val;
    let battStatus                      = getState(inputRegisters.betriebszustandBatterie).val;

    _batteryLadePower = getState(tibberDP + 'extra.max_Batterieladung').val;  

    if (_batteryLadePower == undefined) {
        _batteryLadePower = 1;
    }

    if (_batteryLadePower < 0) {
        _batteryLadePower = _batteryLadePower * -1;
    }

    _tibberPreisJetzt = getState(tibberPreisJetztDP).val;
    _tomorrow_kW      = getState(tomorrow_kWDP).val;
    _powerAC          = getState(inputRegisters.powerAC).val * -1;

    // Lademenge
    let lademenge_full = Math.ceil((_batteryCapacity * (100 - _batsoc) / 100) * (1 / _wr_efficiency));                             //Energiemenge bis vollständige Ladung
    let lademenge      = Math.max(Math.ceil((_batteryCapacity * (_batteryTarget - _batsoc) / 100) * (1 / _wr_efficiency)), 0);     //lademenge = Energiemenge bis vollständige Ladung
    
    let restlademenge  = aufrunden(2, (_batteryCapacity - (_batteryCapacity *_batsoc) / 100));   
    let restladezeit   = aufrunden(2, (lademenge / _batteryLadePower));                                                            //Ladezeit = Energiemenge bis vollständige Ladung / Ladeleistung WR

    if (_batteryLadePower == 1) {
    //    restladezeit    = 0;
        restladezeit   = aufrunden(2, (restlademenge / _batteryLadePowerMax));
    }
    

    setState(tibberDP + 'extra.BatterieRestladezeit', restladezeit, true);

    if (_debug) {
        console.info('_tick___________________________ ' + _tick);
        console.info('pvlimit_________________________ ' + pvlimit + ' W');
        console.info('Verbrauch jetzt_________________ ' + _verbrauchJetzt + ' W');
        console.info('PV Produktion___________________ ' + _dc_now + ' W');
        console.info('Ladeleistung max Batterie_______ ' + _batteryLadePower + ' W');
        console.info('Batt_SOC________________________ ' + _batsoc + ' %');
        const battsts = battStatus == 2291 ? 'Batterie Standby' : battStatus == 3664 ? 'Notladebetrieb' : battStatus == 2292 ? 'Batterie laden' : battStatus == 2293 ? 'Batterie entladen' : 'Aus';
        console.info('Batt_Status_____________________ ' + battsts + ' = ' + battStatus);
        console.info('Lademenge bis voll______________ ' + lademenge_full + ' Wh');
        console.info('Lademenge_______________________ ' + lademenge + ' Wh');
        console.info('Restladezeit____________________ ' + restladezeit + ' h');
        console.info('Restlademenge___________________ ' + restlademenge + ' Wh');
        console.info('Einspeisung_____________________ ' + aufrunden(2, _einspeisung) + ' W');

    }
    
    _SpntCom                = _InitCom_Aus;     // initialisiere AUS
    _max_pwr                = _mindischrg;      // initialisiere
    _maxchrg                = _mindischrg;      // initialisiere
    
    if (_dc_now > _verbrauchJetzt && _batsoc < 100) {
        _max_pwr = (_dc_now - _verbrauchJetzt) * -1;   // vorbelegung zum laden
    } 

    if (_tibberNutzenSteuerung) {
        if (_tibber_active_idx == 88) { // komme aus notladung
            setState(spntComCheckDP, 888, true);
        }

        const nowhour       = _hhJetzt + ':00'; // stunde jetzt zur laufzeit 
        const tomorrow      = new Date(_today.getFullYear(), _today.getMonth(), _today.getDate() + 1);  

        _tibber_active_idx  = 0;    // initialisiere

        const tibberPvForcast       = getState(tibberPvForcastDP).val;
        const tibberPoihigh         = sortArrayByCurrentHour(tibberPvForcast, true, _hhJetzt);  // sortiert ab jetzt
        const tibberPoihighSorted   = sortArrayByCurrentHour(tibberPvForcast, false, '00');     // sortiert ab = Uhr
        
        //console.info('tibberPoihigh ' +  JSON.stringify(tibberPoihigh));
        //console.info('tibberPoihighSorted ' +  JSON.stringify(tibberPoihighSorted));

        let poiTemp = [];   
        for (let t = 0; t < 48; t++) { 
            const zeitMM = tibberPoihighSorted[t][1].slice(3, 5);
            const zeitHH = tibberPoihighSorted[t][1].slice(0, 2);
            if (zeitMM == 30) {
                if (_hhJetzt > 13) {
                    poiTemp.push([tibberPoihighSorted[t][0], tibberPoihighSorted[t][1].slice(0, 2)+':00', tibberPoihighSorted[t][2]]);
                } else {
                    poiTemp.push([tibberPoihighSorted[t][0], tibberPoihighSorted[t][1].slice(0, 2)+':00', tibberPoihighSorted[t][2]]);
                    if (zeitHH == 14) {
                        break;
                    }
                }
            }   
        }       
        
        poiTemp.sort(function (a, b) {  // niedrieg preis sort
            return a[0] - b[0];
        });

        let tibberPoilow = [];          //wieviele Ladestunden unter Startcharge Preis

        for (let x = 0; x < poiTemp.length; x++) {
            if (poiTemp[x][0] <= _start_charge) {
                tibberPoilow.push(poiTemp[x]);
            }
        }

        let restLaufzeit = _batsoc * _batteryCapacity / 100;
        let batlefthrs = aufrunden(2, restLaufzeit / (_baseLoad / Math.sqrt(_lossfactor)));    /// 12800 / 100 * 30  Batterielaufzeit laut SOC und berücksichtige Grundverbrauch        

        restLaufzeit = Math.round((restLaufzeit / 1000) * 60);
        setState(tibberDP + 'extra.Batterielaufzeit', getMinHours(restLaufzeit), true);

        //wieviel wh kommen in etwa von PV in den nächsten 24h
        let hrstorun        = 24;
        let pvwhToday       = 0;
        let pvwhTomorrow    = 0;

        for (let p = 0; p < hrstorun * 2; p++) {   // *2 weil 48 PV Datenpunkte
            pvwhToday       = pvwhToday     + _pvforecastTodayArray[p][2] / 2;
            pvwhTomorrow    = pvwhTomorrow  + _pvforecastTomorrowArray[p][2] / 2;
        }

        if (_debug) {
            console.info('Bat h restLaufzeit______________ ' + getMinHours(restLaufzeit));
            console.info('Bat h verbleibend_____batlefthrs ' + batlefthrs);
            console.info('Erwarte ca______________________ ' + aufrunden(2, pvwhToday / 1000) + ' kWh von PV');
        }

        setState(tibberDP + 'extra.PV_Prognose', aufrunden(2, pvwhToday), true);

        _sundownAstro       = getAstroDate('sunsetStart').getHours() + ':' + getAstroDate('sunsetStart').getMinutes().toString().padStart(2, '0');                           // untergang heute  
        _sunupTodayAstro    = getAstroDate('sunriseEnd').getHours() + ':' + getAstroDate('sunriseEnd').getMinutes().toString().padStart(2, '0');                             // aufgang heute
        _sunupAstro         = getAstroDate('sunriseEnd', tomorrow).getHours() + ':' + getAstroDate('sunriseEnd', tomorrow).getMinutes().toString().padStart(2, '0');         // aufgang nächster Tag
        
        _sundown       = _sundownAstro; 
        _sunup         = _sunupAstro;

        if (_debug) {
            console.info('Nachtfenster nach Astro : ' + _sundownAstro + ' - ' + _sunupAstro);
        }

        let neuberechnen = false;

        if (!_snowmode) {    
            if (pvfc.length > 0) {
                _sundown = pvfc[(pvfc.length - 1)][4];
            } else {
                _sundown = nowhour;         
            }

            let su = 0;
            for (su = 0; su < 48; su++) {
                if (_pvforecastTodayArray[su][2] >= _baseLoad) {
                    _sunup = _pvforecastTodayArray[su][0];

                    const sunupHH = parseInt(_sunup.slice(0, 2));

                    if (Number(_hhJetzt) > sunupHH) {
                        neuberechnen = true;
                    }
                    break;
                }
            }
 
            if (neuberechnen) {
                _sunup = _pvforecastTomorrowArray[su][0];
            }
        }

        let sundownhr  = _sundown;
        if (compareTime(_sundown, _sunup, 'between')) {
            sundownhr  = nowhour;
        }

        hrstorun          = Math.min(zeitDifferenzInStunden(sundownhr, _sunup, true), 24);
        const toSundownhr = Math.min(zeitDifferenzInStunden(nowhour, _sundown, false), 24);

        if (_debug) {
            console.info('Nachtfenster nach Berechnung : ' + sundownhr + ' - ' + _sunup + '. bis zum Sonnenaufgang nach Untergang sind es ' + hrstorun + ' hrstorun und zum nächsten Untergang toSundownhr ' + toSundownhr);
        }        

        if (compareTime(_sunupTodayAstro, _sundownAstro, 'between')) {  // Astro stunde 
            pvwhToday = 0;                                                       // initialisiere damit die entladung läuft
            let t = 0;
            if (toSundownhr > 0) {                
                //wieviel kwh kommen in etwa von PV ab jetzt
                for (t = 0; t < pvfc.length; t++) {                                 
                    pvwhToday = pvwhToday + pvfc[t][0];                
                }
                pvwhToday = aufrunden(2, (pvwhToday /2));
                
                setState(tibberDP + 'extra.PV_Prognose_kurz', pvwhToday, true);

                if (_debug) {
                    console.info('Erwarte ca______________________ ' + aufrunden(2, pvwhToday / 1000) + ' kWh von PV verkürzt');
                  //  console.info('_pvforecastTodayArray : ' + JSON.stringify(_pvforecastTodayArray[p]));
                }
            }
        }

        if (_debug) {
            console.info('Tibber tibberPoihigh.length ' + tibberPoihigh.length);
            //    console.info('tibberPoihigh vor nachladen: ' + JSON.stringify(tibberPoihigh));
        }

        // Nachladestunden Ermittlung
        let starteLadungTibber  = false;
        let prclow              = [];
        let prchigh             = [];
        let ladeZeitenArray     = [];

        let curbatwh   = aufrunden(2, ((_batteryCapacity / 100) * _batsoc));     // batterie ladung 

        if (batlefthrs < hrstorun) {
            for (let h = 0; h < tibberPoihigh.length; h++) {
                if (tibberPoihigh[h][0] <= _start_charge) {
                    prclow.push(tibberPoihigh[h]);
                }
                if (tibberPoihigh[h][0] > _stop_discharge) {
                    prchigh.push(tibberPoihigh[h]);
                }
            }

            prclow.sort(function (a, b) {
                return a[0] - b[0];
            })

            //nachlademengeWh nach höchstpreisen am Tag
            let nachlademengeWh = (prchigh.length) * (_baseLoad / 2) * 1 / _wr_efficiency;

            if (hrstorun < 24 && !_snowmode) {
                nachlademengeWh = nachlademengeWh - (pvwhToday * _wr_efficiency);
            }           

            nachlademengeWh =  aufrunden(2, nachlademengeWh);

            let nachladeStunden = aufrunden(2, (Math.max((nachlademengeWh - curbatwh) / (_batteryLadePowerMax * _wr_efficiency), 0) * 2));

            // neuaufbau tibberPoihigh ohne Nachladestunden, billigstunden
            if (_debug) {
             //   console.info(JSON.stringify(prclow)); 
                console.info('in Nachladestunden nachladeStunden ' + nachladeStunden + ' curbatwh ' + curbatwh + ' nachlademengeWh ' + nachlademengeWh);
            }

            if (nachladeStunden > prclow.length) {
                nachladeStunden = prclow.length;
            }

            if (_debug) {
                console.info('nach Nachladestunden nachladeStunden ' + nachladeStunden + ' curbatwh ' + curbatwh);
          //    console.info('prclow  Nachladestunden ' + JSON.stringify(prclow));
          //    console.info('prchigh Nachladestunden ' + JSON.stringify(prchigh));
            }
            
            if (nachladeStunden > 0 && prclow.length > 0 && _dc_now <= _verbrauchJetzt) {       // aber nicht wenn genug sonne in der zeit              
                // aufbau der zeiten zum nachladen weiter im _tibber_active_idx = 5
                if (aufrunden(2, nachlademengeWh - curbatwh) > 0) {
                    for (let i = 0; i < nachladeStunden; i++) {
                        if (_debug) {
                            console.warn('Nachladezeit: ' + prclow[i][1] + '-' + prclow[i][2] + ' zum Preis ' + prclow[i][0] + ' (' + aufrunden(2, nachlademengeWh - curbatwh) + ' Wh)');
                        }
                        if (compareTime(prclow[i][1], prclow[i][2], 'between')) {
                            tibberPoilow.push(prclow[i]);
                         //    ladeZeitenArray.push(prclow[i]);
                            if (_debug) {
                                console.warn('-->> Bingo nachladezeit');
                            }
                            // aus der nachladung starten setzen
                            starteLadungTibber = true;
                            _tibber_active_idx = 1;
                        }
                    }
                }
            }
        }        // Nachladestunden Ermittlung ende

        let entladeZeitenArray = [];
        let tibberPoihighNew = filterZeit14Uhr(tibberPoihigh);         // sortiert nach preis und stunden grösser jetzt
        let lefthrs = batlefthrs *2;                                   // Batterielaufzeit laut SOC

        if (_debug) {
            console.info('tibberPoihighNew.length '+ tibberPoihighNew.length);
         //   console.info('tibberPoihighNew nach filter ' + JSON.stringify(tibberPoihighNew));
        }

        if (lefthrs > 0 && lefthrs > tibberPoihighNew.length) {        // limmitiere auf Tibber höchstpreise
            lefthrs = tibberPoihighNew.length;
        }

        if (_debug) {
            console.info('------>>  laufzeit mit tibber höchstpreise: lefthrs ' + lefthrs + ' Batterielaufzeit: batlefthrs ' + batlefthrs +  ' von PV kommt heute: pvwhToday ' + pvwhToday);
        }
        
        if (lefthrs > 0) {                                     // wir haben höchstpreise 
            for (let d = 0; d < lefthrs; d++) {
                if (tibberPoihighNew[d][0] > _stop_discharge) {                               
                    //    console.info('alle Entladezeiten: ' + tibberPoihighNew[d][1] + '-' + tibberPoihighNew[d][2] + ' Preis ' + tibberPoihighNew[d][0] + ' Fahrzeug zieht ' + _vehicleConsum + ' W');
                    entladeZeitenArray.push(tibberPoihighNew[d]);    // alle passende höchstpreiszeiten                           
                }  
            }

            const entladeZeitenArrayOut = sortHourToSunup(sortArrayByCurrentHour(entladeZeitenArray, true, _hhJetzt), _sunup);   // nur für die darstellung in VIS
            setState(tibberDP + 'extra.entladeZeitenArray', entladeZeitenArrayOut, true); 
        }

        if (compareTime(_sunupTodayAstro, _sundown, 'between')) {     // wir sind am Tag 
            if (_debug) {
                console.warn('Tag verarbeitung');
            }
            if (_dc_now > 1 && _dc_now < _verbrauchJetzt) {                            
                // wenn genug PV am Tag aber gerade nicht genug Sonne aber tibber klein genug
                if (_debug) {
                    console.info('pvwhToday ' + pvwhToday + ' berechnung ' + (_baseLoad * toSundownhr * _wr_efficiency));                
                }
                
                // Entladezeit wenn was im akku und preis hochgenug um zu sparen
                if (batlefthrs > 0 && _tibberPreisJetzt > _stop_discharge) {      // wenn noch was im akku und PV läuft aber nicht genug liefert          
                    _tibber_active_idx = 21;
                    macheNix = true;
                }
                if (pvwhToday > (_baseLoad * toSundownhr * _wr_efficiency) && _tibberPreisJetzt <= _stop_discharge) {
                // if (pvwhToday > _batteryCapacity - curbatwh && _tibberPreisJetzt <= _stop_discharge) {        
                    _tibber_active_idx = 20;          
                    macheNix = true;
                } 
            }          
        } else {          // wir sind nach Sonnenuntergang
            if (_debug) {
                console.warn('Nacht verarbeitung');
            }
            // Entladezeit
            if (batlefthrs > 0) {
                if (batlefthrs >= hrstorun) { 
                    if (compareTime(nowhour, _sunup, 'between')) {                    // wenn rest battlaufzeit > als bis zum sonnenaufgang
                        if (_debug) {
                            console.warn('Entladezeit reicht aus bis zum Sonnaufgang und genug PV');
                        }

                        macheNix = true;
                        _tibber_active_idx = 22;
                        entladeZeitenArray = [];
                        entladeZeitenArray.push([0.0,"--:--","--:--"]);  //  initialisiere für Vis
                    }
                } else {
                    if (entladeZeitenArray.length > 0) {                                     // wir haben höchstpreise                       
                        for (let c = 0; c < entladeZeitenArray.length; c++) {
                            if (compareTime(entladeZeitenArray[c][1], entladeZeitenArray[c][2], "between")) {
                                if (_vehicleConsum > 0) {                        // wenn fahrzeug am laden dann aber nicht aus der batterie laden
                                    break;
                                } else {
                                    macheNix = true;
                                    _tibber_active_idx = 2;
                                }
                            }
                        }
                    }                                                              
                }
            }
                        
            // in der nacht starten setzen
            if (_tibberPreisJetzt <= _start_charge && _batsoc < 100) {
                let vergleichepvWh = 0;
                
                if (compareTime('00:00', null, ">", null)) {
                    vergleichepvWh = pvwhTomorrow;              // vor 00:00 bruachen wir den morgen wert
                } else {
                    vergleichepvWh = pvwhToday;                 // danach den tageswert
                }
                
                if (vergleichepvWh < (_baseLoad * 24 * _wr_efficiency)) {
                    starteLadungTibber = true;
                }
            
                if (_debug) {                                        
                    console.info('pvwh ' + vergleichepvWh + ' ist kleiner als ' + (_baseLoad * 24 * _wr_efficiency));
                }
            }
        }

        // stoppe die Ladung/Entladung
        if (!macheNix) {            
            if ((_tibberPreisJetzt <= _stop_discharge || _batsoc == 0) ) {
                if (_debug) {                                        
                    console.warn('Stoppe Entladung, Preis jetzt ' + _tibberPreisJetzt + ' ct/kWh unter Batterieschwelle von ' + aufrunden(2, _stop_discharge) + ' ct/kWh oder battSoc = 0 ist ' + _batsoc );
                    console.info(' _SpntCom ' + _SpntCom + ' _max_pwr ' + _max_pwr + ' macheNix ' + macheNix + ' _tibber_active_idx ' + _tibber_active_idx);                    
                }
                _tibber_active_idx = 3;
            }
        }

        // starte die ladung
        if (starteLadungTibber) {
            if (restladezeit == 0) {
                restladezeit = lademenge / _batteryLadePowerMax; 
            }

            let length = aufrunden(2, restladezeit);
            tibberPoilow = doppelteRausAusArray(tibberPoilow);

            if (length > tibberPoilow.length) {
                length = tibberPoilow.length;
                if (_debug) {
                    console.info('Starte Ladung mit tibber : ' + JSON.stringify(tibberPoilow));
                }
            }

            for (let g = 0; g < length; g++) {
                ladeZeitenArray.push(tibberPoilow[g]);
            }    
                
            ladeZeitenArray = sortArrayByCurrentHour(ladeZeitenArray, false, '00');      

            for (let i = 0; i < ladeZeitenArray.length; i++) {                    
                if (compareTime(ladeZeitenArray[i][1], ladeZeitenArray[i][2], 'between') && _dc_now < _verbrauchJetzt) {
                    if (_debug) {
                        console.info('Starte Ladung: ' + ladeZeitenArray[i][1] + '-' + ladeZeitenArray[i][2] + ' Preis ' + ladeZeitenArray[i][0]);
                    }
                    _tibber_active_idx = 5;
                    wirdGeladen = true;
                    break;
                }
            }
        }

        //ladung stoppen wenn Restladezeit kleiner Billigstromzeitfenster
        if (tibberPoilow.length > 0 && restladezeit <= tibberPoilow.length && _tibber_active_idx == 5) {
            if (_debug) {
                console.info('Stoppe Ladung');
            }
            _tibber_active_idx = 4;            
        }    
        
        setState(tibberDP + 'extra.ladeZeitenArray', ladeZeitenArray, true);

        tibber_active_auswertung();
    }

    setState(tibberDP + 'extra.tibberProtokoll', _tibber_active_idx, true);

    // ----------------------------------------------------  Start der PV Prognose Sektion

//      _tibber_active_idx = 0;                 initial
//      _tibber_active_idx = 1;                 Nachladezeit
//      _tibber_active_idx = 2;                 Entladezeiten
//      _tibber_active_idx = 20;                pv reicht für den Tag und wir sind in zwischenzeit wo nix produziert wird und preis unter schwelle     
//      _tibber_active_idx = 21;                Entladezeit wenn akku > 0 aber keine entladezeit, aber der Preis hoch genug um zu sparen
//      _tibber_active_idx = 22;                Entladezeit reicht aus bis zum Sonnaufgang
//      _tibber_active_idx = 3;                 entladung stoppen wenn preisschwelle erreicht
//      _tibber_active_idx = 4;                 ladung stoppen wenn Restladezeit kleiner Billigstromzeitfenster
//      _tibber_active_idx = 5;                 starte die ladung
//      _tibber_active_idx = 88;                notladung

    if (_debug) {
        console.error('-->> Verlasse Tibber Sektion mit _SpntCom ' + _SpntCom + ' _max_pwr ' + _max_pwr + ' macheNix ' + macheNix + ' _tibber_active_idx ' + _tibber_active_idx);
        console.error('-->  PV ' + _dc_now + ' Verbrauch ' + _verbrauchJetzt + ' Restladezeit ' + restladezeit);
    }

    if ((batterieLadenUhrzeitStart && _hhJetzt >= batterieLadenUhrzeit)) {    // laden übersteuern ab bestimmter uhrzeit
        if (_debug) {
            console.warn('-->> übersteuert mit nach Uhrzeit laden');
        }
        _SpntCom  = _InitCom_Aus;
        _prognoseNutzenSteuerung = false;
    }    

    if (_prognoseNutzenSteuerung && compareTime(_sunupTodayAstro, _sundownAstro, 'between')) {                
        if (_tibber_active_idx == 88) {                                        // komme aus notladung
            setState(spntComCheckDP, 888, true);
        }

        let latesttime = 0;

        if ((restladezeit * 2) <= pvfc.length && pvfc.length > 1) {          // überschreibe die restladezeit mit mäglichen pv ladezeiten
            restladezeit = Math.ceil(pvfc.length / 2);                          
        }

        setState(tibberDP + 'extra.PV_Abschluss', '--:--', true);

        if (pvfc.length > 0) {            
            latesttime = pvfc[(pvfc.length - 1)][4];
            setState(tibberDP + 'extra.PV_Abschluss', latesttime, true);
        }
        
        if (_debug && latesttime) {
            console.info('Abschluss PV bis ' + latesttime);
            console.info('pvfc.length ' + pvfc.length + ' Restladezeit nach pvfc Ermittlung ' + restladezeit);
        //    console.warn('pvfc ' + JSON.stringify(pvfc));
        }

        setState(tibberDP + 'extra.pvLadeZeitenArray', pvfc, true);

        // if (restladezeit > 0 && (restladezeit * 2) <= pvfc.length) {  // wenn die ladedauer kleiner ist als die vorhersage 
        if (_batsoc < 100 && pvfc.length > 0) {     // wenn Batt voll dann keine Ladung von pv 
            let get_wh = 0;
            let get_wh_einzeln = 0;

            for (let k = 0; k < pvfc.length; k++) {
                let pvpower = pvfc[k][0];
                let minutes = pvfc[k][2];

                if (pvpower < (pvlimit + _baseLoad)) {
                    pvpower = pvfc[k][1];
                }

                if (compareTime(pvfc[k][3], pvfc[k][4], 'between')) {
                    const nowTime       = _today.toLocaleTimeString('de-DE', _options);
                    const startsplit    = nowTime.split(':');
                    const endsplit      = pvfc[k][4].split(':');
                    const minutescalc   = (Number(endsplit[0]) * 60 + Number(endsplit[1])) - (Number(startsplit[0]) * 60 + Number(startsplit[1]));
                    if (minutescalc < minutes) {
                        minutes = minutescalc;
                    }
                }
                get_wh_einzeln = (((pvpower / 2) - ((pvlimit + _baseLoad) / 2)) * (minutes / 30)); 
                get_wh = get_wh + aufrunden(2, get_wh_einzeln);
            }

            setState(tibberDP + 'extra.PV_Ueberschuss', get_wh, true);            

            if (_debug) {
                console.info('Überschuss get_wh vor entzerren ' + get_wh);
            }

            let pvlimit_calc = pvlimit;
            let min_pwr = 0;

            if (lademenge > 0 && lademenge > get_wh) {
                pvlimit_calc = Math.max((Math.round(pvlimit - ((lademenge - get_wh) / restladezeit))), 0);      //virtuelles reduzieren des pvlimits
                min_pwr      = Math.max(Math.round((lademenge - get_wh) / restladezeit), 0);
            //    min_pwr      = min_pwr * -1;                                                                    // muss negativ sein ??

                get_wh = lademenge;       
            }

            get_wh = aufrunden(2, get_wh);     

            if (_debug) {
                console.info('-->  Verschiebe Einspeiselimit auf pvlimit_calc ' + pvlimit_calc + ' W' + ' mit mindestens ' + min_pwr + ' W  get_wh ' + get_wh + ' restladezeit ' + restladezeit );
            }

            let current_pwr_diff = 0;

            if (lademenge > 0 && get_wh >= lademenge) {                   

                current_pwr_diff  = aufrunden(2, 100 - pvlimit_calc + _einspeisung);         

                _max_pwr = Math.round(_powerAC + current_pwr_diff);
                
                if (_powerAC <= 0 && current_pwr_diff < 0) {
                    _max_pwr = _mindischrg;
                }               

                if (_powerAC <= 10 && current_pwr_diff > 0 ){ 
                    _max_pwr = Math.ceil(pvfc[0][0] - pvlimit_calc);
                    
                    if (current_pwr_diff > _max_pwr) {
                        _max_pwr = Math.round(current_pwr_diff);                        
                    }
                }                
            }

            if (_debug) {
                console.info('restladezeit möglich ' + restladezeit + ' _powerAC ' + _powerAC);
                console.info('nach der Begrenzung  :_max_pwr ' + _max_pwr + ' startzeit ' + pvfc[0][3] + ' pvfc[0][0] ' + pvfc[0][0] + ' oder pvfc[0][1] ' + pvfc[0][1] + ' pvlimit_calc ' + pvlimit_calc);
                console.info('Ausgabe A  :_max_pwr ' + _max_pwr + ' min_pwr ' + min_pwr + ' current_pwr_diff ' + current_pwr_diff);
            }

            _max_pwr = Math.ceil(Math.min(Math.max(_max_pwr, min_pwr), _batteryLadePowerMax));     //abfangen negativer werte, limitiere auf min_pwr orginal

            if (_debug) {
                console.info('Ausgabe B  :_max_pwr ' + _max_pwr);
            }           

            if (_dc_now < _verbrauchJetzt && _tibber_active_idx == 0) {
                _max_pwr = _mindischrg;
            }           

            try {
                for (let h = 0; h < (restladezeit *2); h++) {  // nur wenn überschuss wirklich da ist
                    if ((compareTime(pvfc[h][3], pvfc[h][4], 'between')) || (_einspeisung + _powerAC) >= (pvlimit - 100)) { 
                        
                        _SpntCom = _InitCom_An;

                        if (_debug) {
                            console.warn('-->> Bingo ladezeit' );
                        }
                        
                        if (_dc_now < _verbrauchJetzt) { // kann sein dass die prognose nicht stimmt und wir haben ladezeiten aber draussen regnets
                            if (_debug) {
                                console.warn('-->> breche ab, da nicht genug Sonne ' );
                            }
                            if (_tibber_active_idx == 20 || _tibber_active_idx == 21) {   // komme von oben
                                _SpntCom = _InitCom_Aus;
                            }
                            break;
                        }

                        if (_debug) {
                            console.warn('-->> mit überschuss _max_pwr ' + _max_pwr + ' pv50 ' + pvfc[h][0] + ' pv90 ' + pvfc[h][1]);
                        }
                        
                        if (_max_pwr > _dc_now - _verbrauchJetzt) {  // wenn das ermittelte wert grösser ist als die realität dann limmitiere, check nochmal besser ist es
                            _max_pwr = _dc_now - _verbrauchJetzt;
                            if (_debug) {
                                console.warn('-->> limmitiere auf ' + _max_pwr);
                            }
                        }
            
                        _max_pwr = _max_pwr * -1;

                        if (_lastpwrAtCom != _max_pwr) {
                            _lastSpntCom = 95;    // damit der WR auf jedenfall daten bekommt
                        }

                        if (_batsoc < 100) {  // batterie ist nicht voll
                            wirdGeladen = true;
                        }

                        break;                        
                    }
                }
            } catch(err) {
                console.error('pvfc Problem ' + JSON.stringify(pvfc));
            }
        }

        if (_max_pwr > 0) {        // hier muss immer was negatives rauskommen.. sonst keine pv ladung
            //console.warn('-->> problem ' + _max_pwr);
            _max_pwr = _mindischrg;          
        }
    }

    _maxchrg = _max_pwr;

// ---------------------------------------------------- Ende der PV Prognose Sektion
    if (_batsoc > 90 && wirdGeladen) {              // letzten 10 % langsam laden
        if (_maxchrg < _lastPercentageLoadWith) {            
            _maxchrg = _lastPercentageLoadWith;
            if (_debug) {
                console.warn('-->> limmitiere letzte 10 % auf ' + _maxchrg);
            }
        }        
    }

// ----------------------------------------------------           write WR data

    sendToWR(_SpntCom, aufrunden(0, _maxchrg));
}


async function sendToWR(commWR, pwrAtCom) {
    const commNow = await getStateAsync(spntComCheckDP);

    if ((_lastpwrAtCom != pwrAtCom || commWR != commNow.val || commWR != _lastSpntCom) && !_batterieLadenUebersteuernManuell) {
        if (_debug) {
            console.error('------ > Daten gesendet an WR kommunikation : ' + commWR  + ' Wirkleistungvorgabe ' + pwrAtCom);
        }
        setState(communicationRegisters.fedInPwrAtCom, pwrAtCom);       // 40149_Wirkleistungvorgabe
        setState(communicationRegisters.fedInSpntCom, commWR);          // 40151_Kommunikation
        setState(spntComCheckDP, commWR, true);                         // check DP für vis        
        setState(tibberDP + 'extra.max_Batterieladung', pwrAtCom, true);
    }

    if (_debug && !_batterieLadenUebersteuernManuell) {
        console.warn('SpntCom jetzt --> ' + commWR + ' <-- davor war ' + _lastSpntCom + ' und commNow ist ' + commNow.val + ' .. Wirkleistungvorgabe jetzt ' + pwrAtCom + ' davor war ' + _lastpwrAtCom);
        console.info('----------------------------------------------------------------------------------');
    }

    _lastSpntCom    = commWR;
    _lastpwrAtCom   = pwrAtCom;
}


/* ***************************************************************************************************************************************** */

on({ id: inputRegisters.triggerDP, change: 'any' }, function () {  // aktualisiere laut adapter abfrageintervall
    setTimeout(function() {
        vorVerarbeitung();
    }, 500);     
});


on({id: [tibberDP + 'extra.tibberNutzenAutomatisch',
         tibberDP + 'extra.prognoseNutzenAutomatisch',
        ], change: 'any', val: false}, function () {
    _lastSpntCom = 97;
});


//  reduzierung lesezugroffe, hole die PV nur wenn sich was geändert hat
on({id: '0_userdata.0.strom.pvforecast.lastUpdated', change: 'any'}, async function() {  
    setTimeout(function() { 
        holePVDatenAb();
    }, 1000);     // warte 5 sekunden   
});

async function vorVerarbeitung() {
    const dc1 = await getStateAsync(inputRegisters.dc1);
    const dc2 = await getStateAsync(inputRegisters.dc2);

    _dc_now                     = dc1.val + dc2.val;                                                    // pv vom Dach zusammen in W
    _verbrauchJetzt             = await berechneVerbrauch(_dc_now);

    _hhJetzt                    = getHH();
    _today                      = new Date();
    _batsoc                     = Math.min(getState(inputRegisters.batSoC).val, 100);                   //batsoc = Batterieladestand vom WR
    _bydDirectSOC               = Math.min(getState(bydDirectSOCDP).val, 100);                          // nimm den bydSoc da der WR nicht oft diesen übermittelt
    _debug                      = getState(tibberDP + 'debug').val;

    _snowmode                   = getState(tibberDP + 'extra.PV_Schneebedeckt').val;
    _tibberNutzenAutomatisch    = getState(tibberDP + 'extra.tibberNutzenAutomatisch').val;             // aus dem DP kommend sollte true sein für vis
    _prognoseNutzenAutomatisch  = getState(tibberDP + 'extra.prognoseNutzenAutomatisch').val;           // aus dem DP kommend sollte true sein für vis

    _tibberNutzenSteuerung      = _tibberNutzenAutomatisch;         // init
    _prognoseNutzenSteuerung    = _prognoseNutzenAutomatisch;       // init

    // übersteuern nach prio manuell zuerst dann autoamtisch oder battsoc unter 5 %
    const _tibberNutzenManuell          = getState(tibberDP + 'extra.tibberNutzenManuell').val;
    const _tibberNutzenManuellHH        = getState(tibberDP + 'extra.tibberNutzenManuellHH').val;

    _batterieLadenUebersteuernManuell   = getState(batterieLadenManuellStartDP).val;

    if (_batterieLadenUebersteuernManuell || (_tibberNutzenManuell && _hhJetzt == _tibberNutzenManuellHH)) {       // wird durch anderes script geregelt
        _tibberNutzenSteuerung      = false;    // der steuert intern ob lauf gültig  für tibber laden/entladen
        _prognoseNutzenSteuerung    = false;    // der steuert intern ob lauf gültig  für pv laden
        _lastSpntCom                = 98;       // manuellel laden
    }

    if (_debug) {
        console.info('tibberNutzenAutomatisch ' + _tibberNutzenAutomatisch + ' prognoseNutzenAutomatisch ' + _prognoseNutzenAutomatisch);
    }

    // ---     check ob notladung nötig
    _notLadung = notLadungCheck();

    if (_notLadung) {         
        _tibber_active_idx            = 88          // notladung mrk
        sendToWR(_InitCom_An, _batteryPowerEmergency);
    } else {
        processing();             
    }

    if (_debug) {
        console.info('tibberNutzenSteuerung ' + _tibberNutzenSteuerung + ' prognoseNutzenSteuerung ' + _prognoseNutzenSteuerung);
    }
}


function notLadungCheck() {    
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

async function berechneVerbrauch(pvNow) {
    if (_sma_em.length > 0) {
        inputRegisters.powerOut = _sma_em + ".psurplus" /*aktuelle Einspeiseleistung am Netzanschlußpunkt, SMA-EM Adapter*/
    }

    _einspeisung        = aufrunden(2, getState(inputRegisters.powerOut).val);     // Einspeisung  in W
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

    const verbrauchJetzt   = 100 + (pvNow + battOut.val + netzbezug.val) - (_einspeisung + battIn.val);          // verbrauch in W , 100W reserve obendruaf _vehicleConsum nicht rein nehmen
    setState(momentan_VerbrauchDP, aufrunden(2, (_verbrauchJetzt - 100 - _vehicleConsum)) /1000, true);                  // für die darstellung können die 100 W wieder raus und fahrzeug auch

    return aufrunden(0, verbrauchJetzt);
}
// ------------------------------------------- functions

function filterZeit14Uhr(arrZeit) {
    const newArray = [];
    for (let i = 0; i < arrZeit.length; i++) {
        const startTime = parseInt(arrZeit[i][1].split(':')[0]);
        newArray.push(arrZeit[i]);
        if (startTime == 14) {
            break;    
        }
    }

    newArray.sort(function (a, b) {  // niedrieg preis sort
        return b[0] - a[0];
    });

    return newArray;    
}

function aufrunden(stellen, zahl) {
    return +(Math.round(Number(zahl) + 'e+' + Number(stellen)) + 'e-' + Number(stellen));
}

function zeitDifferenzInStunden(zeit1, zeit2, nextDay) {
    const [stunden1, minuten1] = zeit1.split(':').map(Number);
    const [stunden2, minuten2] = zeit2.split(':').map(Number);

    let zeit1InMinuten = stunden1 * 60 + minuten1;
    let zeit2InMinuten = stunden2 * 60 + minuten2;

    // füge 24 Stunden zu Zeit 2 hinzu (Tagesübergang)
    if (nextDay && _hhJetzt >= 0) {
        zeit2InMinuten += 24 * 60;
    }

    let differenzInMinuten = zeit2InMinuten - zeit1InMinuten;

    // Differenz in Stunden und Minuten aufteilen
    const differenzStunden = Math.floor(differenzInMinuten / 60);
    const differenzMinuten = differenzInMinuten % 60;

   // console.error('zeit1 ' + zeit1 + ' zeit2 ' + zeit2 + ' ' + differenzStunden + ' ' + differenzMinuten);

    return `${differenzStunden}.${(differenzMinuten < 10 ? '0' : '') + differenzMinuten}`;
}

function sortHourToSunup(zeiten, sunup) {
    let arrOut = [];

    for (let p = 0; p < zeiten.length; p++) { /* 48 = 24h a 30min Fenster*/
        const hh  = zeiten[p][1].split(':')[0];
        const min = zeiten[p][1].split(':')[1];

        if (min == 0) {
            arrOut.push(zeiten[p]);
        }    

        if (hh == sunup.split(':')[0]) {
            break;
        }

    }

    return arrOut;
}

function sortArrayByCurrentHour(zeiten, toEnd, currentHour) {
    // Sortiere den Array nach der Startzeit
    zeiten.sort((a, b) => {
        const timeA = a[1].split(":").map(Number);
        const timeB = b[1].split(":").map(Number);
        
        // Vergleiche Stunden
        if (timeA[0] !== timeB[0]) {
            return timeA[0] - timeB[0];
        }
        
        // Wenn Stunden gleich sind, vergleiche Minuten
        return timeA[1] - timeB[1];
    });

    let sortedArray = [];
    
    if (toEnd) {
        // Finde den Index des aktuellen Zeitpunkts
        let startIndex = zeiten.findIndex(item => {
            const time = item[1].split(":").map(Number);
            return time[0] >= currentHour || (time[0] === currentHour && time[1] >= 30);
        });

    // Schneide den Array ab startIndex und setze ihn an das Ende
        sortedArray = zeiten.slice(startIndex).concat(zeiten.slice(0, startIndex));
    } else {
        sortedArray = zeiten;   
    }

    return sortedArray;
}

function getPvErtrag(pvlimit) {
    let pvfc = [];
    let pvfcAll = [];
  
    for (let p = 0; p < 48; p++) { /* 48 = 24h a 30min Fenster*/
        const pvstarttime = _pvforecastTodayArray[p][0];
        const pvendtime   = _pvforecastTodayArray[p][1];               
        const pvpower50   = _pvforecastTodayArray[p][2];
        const pvpower90   = _pvforecastTodayArray[p][3];

        if (pvpower90 > (pvlimit + _baseLoad)) {
            let minutes = 30;
            pvfcAll.push([pvpower50, pvpower90, minutes, pvstarttime, pvendtime]);
            if (compareTime(pvendtime, null, '<=', null)) {
                if (pvpower50 < pvlimit) {          
                    minutes = Math.round((100 - (((pvlimit - pvpower50) / ((pvpower90 - pvpower50) / 40)) + 50)) * 18 / 60);
                }
                pvfc.push([pvpower50, pvpower90, minutes, pvstarttime, pvendtime]);                
            }
        }
    }
    return {pvfc, pvfcAll};
}

async function holePVDatenAb() {
    for (let p = 0; p < 48; p++) {   
        const startTime = await getStateAsync(pvforecastTodayDP + p + '.startTime');
        const endTime   = await getStateAsync(pvforecastTodayDP + p + '.endTime');
        let power50     = getState(pvforecastTodayDP + p + '.power').val;
        let power90     = getState(pvforecastTodayDP + p + '.power90').val;

        // manuelles reduzieren pv
        power50 = power50 - _power50Reduzierung;
        power90 = power90 - _power90Reduzierung;

        // keine negativen werte 
        if (power50 < 0) {
            power50 = 0;
        }

        if(power90 < 0) {
            power90 = 0;    
        }

        _pvforecastTodayArray.push([startTime.val,endTime.val,power50,power90]);
    }

    for (let p = 0; p < 48; p++) {   
        const startTime = await getStateAsync(pvforecastTomorrowDP + p + '.startTime');
        const endTime   = await getStateAsync(pvforecastTomorrowDP + p + '.endTime');
        const power50   = getState(pvforecastTomorrowDP + p + '.power').val;
        const power90   = getState(pvforecastTomorrowDP + p + '.power90').val;
      
        _pvforecastTomorrowArray.push([startTime.val,endTime.val,power50,power90]);
    }
}

function getMinHours(minutes) {
    let mins = minutes;
    let m = mins % 60;
    let h = (mins - m) / 60;
    let HHMM = (h < 10 ? '0' : '') + h.toString() + ':' + (m < 10 ? '0' : '') + m.toString();
    return HHMM;
}

function doppelteRausAusArray(arr) {
  let uniqueArray = [];
  let seen = new Set();

  for (let item of arr) {
    let serialized = JSON.stringify(item);
    if (!seen.has(serialized)) {
      seen.add(serialized);
      uniqueArray.push(item);
    }
  }

  return uniqueArray;
}

function tibber_active_auswertung() {
    _max_pwr = _mindischrg;
  
    switch (_tibber_active_idx) {
        case 0:
            if (compareTime(_sundown, _sunup, 'between')) {
                _SpntCom = _InitCom_An;
            }
            break;
        case 1:                             //      _tibber_active_idx = 1;    Nachladezeit
            _SpntCom = _InitCom_An;
            _max_pwr = _pwrAtCom_def * -1;            
            break;
        case 2:                             //      _tibber_active_idx = 2;    Entladezeiten
        case 20:                            //      _tibber_active_idx = 20;   pv reicht für den Tag und wir sind in zwischenzeit wo nix produziert wird und preis unter schwelle  
        case 21:                            //      _tibber_active_idx = 21;   Entladezeit wenn akku > 0 aber keine entladezeit, aber der Preis hoch genug um zu sparen               
        case 22:                            //      _tibber_active_idx = 22;   Entladezeit reicht aus bis zum Sonnaufgang
            _SpntCom = _InitCom_Aus;
            break;
        case 3:                             //      _tibber_active_idx = 3;    entladung stoppen wenn preisschwelle erreicht
            _SpntCom = _InitCom_An;
            break;
        case 4:                             //      _tibber_active_idx = 4;    ladung stoppen wenn Restladezeit kleiner Billigstromzeitfenster
            _SpntCom = _InitCom_An;
            break;
        case 5:                             //      _tibber_active_idx = 5;    starte die ladung
            _SpntCom = _InitCom_An;
            _max_pwr = _pwrAtCom_def * -1;
            break;
        default:
            _SpntCom = _InitCom_Aus;        
    }
}
