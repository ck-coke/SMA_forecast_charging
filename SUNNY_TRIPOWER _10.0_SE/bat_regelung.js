const userDataDp = '0_userdata.0';
const tibberStromDP = 'strom.tibber.';
const tibberDP = userDataDp + '.' + tibberStromDP;
const pvforecastDP = userDataDp + '.strom.pvforecast.today.gesamt.';
const SpntComCheck = '0_userdata.0.strom.40151_Kommunikation_Check'; // nochmal ablegen zur kontrolle

const _options = { hour12: false, hour: '2-digit', minute: '2-digit' };

// debug
let _debug = getState(tibberDP + 'debug').val == null ? false : getState(tibberDP + 'debug').val;

//-------------------------------------------------------------------------------------
const _pvPeak = 13100;                   // PV-Anlagenleistung in Wp
const _batteryCapacity = 12800;          // Netto Batterie Kapazität in Wh
const _surplusLimit = 0;                 // PV-Einspeise-Limit in % 0 keine Einspeisung
const _batteryTarget = 100;              // Gewünschtes Ladeziel der Regelung (e.g., 85% for lead-acid, 100% for Li-Ion)
const _baseLoad = 750;                   // Grundverbrauch in Watt
const _wr_efficiency = 0.9;              // Batterie- und WR-Effizienz (e.g., 0.9 for Li-Ion, 0.8 for PB)
const _batteryLadePower = 5000;          // Ladeleistung der Batterie in W, BYD mehr geht nicht
const _batteryPowerEmergency = -5000;    // Ladeleistung der Batterie in W notladung
const _Mindischrg = 1;                   // 0 geht nicht da sonst max entladung .. also die kleinste mögliche Einheit 1

const communicationRegisters = {
    fedInSpntCom: 'modbus.0.holdingRegisters.3.40151_Kommunikation', // (802 active, 803 inactive)
    fedInPwrAtCom: 'modbus.0.holdingRegisters.3.40149_Wirkleistungvorgabe',
    wMaxCha: 'modbus.0.holdingRegisters.3.40189_max_Ladeleistung_BatWR',        // Max Ladeleistung BatWR
}

const inputRegisters = {
    batSoC: 'modbus.0.inputRegisters.3.30845_Batterie_Prozent',
    powerOut: 'modbus.0.inputRegisters.3.30867_Aktuelle_Netzeinspeisung',
    powerSupply: 'modbus.0.inputRegisters.3.30865_Aktueller_Netzbezug',
    triggerDP: 'modbus.0.inputRegisters.3.30193_Systemzeit_als_trigger',
    betriebszustandBatterie: 'modbus.0.inputRegisters.3.30955_Batterie_Zustand',
    battOut: 'modbus.0.inputRegisters.3.31395_Momentane_Batterieentladung',
    battIn: 'modbus.0.inputRegisters.3.31393_Momentane_Batterieladung',
    dc1: 'modbus.0.inputRegisters.3.30773_DC-Leistung_1',
    dc2: 'modbus.0.inputRegisters.3.30961_DC-Leistung_2',
}

const bydDirectSOCDP = 'bydhvs.0.State.SOC';          // battSOC netto direkt von der Batterie

const _SpntCom_Aus = 803;
const _SpntCom_An = 802;
let _lastSpntCom = 0;
let _bydDirectSOC = 5;
let _batsoc = 0;
let _macheNix = false;
let _entladung_zeitfenster = false;

// tibber Preis Bereich
let _tibberNutzenSteuerung = true;    //wird _tibberNutzenAutomatisch benutzt (dyn. Strompreis) 
let _tibberNutzenAutomatisch = _tibberNutzenSteuerung;
let _snowmode = false;                  //manuelles setzen des Schneemodus, dadurch wird in der Nachladeplanung die PV Prognose ignoriert, z.b. bei Schneebedeckten PV Modulen und der daraus resultierenden falschen Prognose
const _start_charge = 0.18;             //Eigenverbrauchspreis
const _pause_charge = 0.30;             //pausiere bis preis grösser 
const _lossfactor = 0.75;               //System gesamtverlust in % (Lade+Entlade Effizienz), nur für tibber Preisberechnung
const _loadfact = 1 / _lossfactor;      /// 1,33
const _stop_discharge = (_start_charge * _loadfact);    /// 0.18 * 1.33 = 0.239 €

createUserStates(userDataDp, false, [tibberStromDP + 'extra.schwellenwert_Entladung', { 'name': 'stoppe Entladung bei Preis von', 'type': 'number', 'read': true, 'write': false, 'role': 'state', 'def': 0 }], function () {
    setState(tibberDP + 'extra.Schwellenwert_Entladung', _stop_discharge, true);
});
createUserStates(userDataDp, false, [tibberStromDP + 'extra.schwellenwert_Ladung', { 'name': 'starte Ladung mit Strom bei Preis von', 'type': 'number', 'read': true, 'write': false, 'role': 'state', 'def': 0 }], function () {
    setState(tibberDP + 'extra.Schwellenwert_Ladung', _start_charge, true);
});
createUserStates(userDataDp, false, [tibberStromDP + 'debug', { 'name': 'debug', 'type': 'boolean', 'read': true, 'write': true, 'role': 'state', 'def': false }], function () {
    setState(tibberDP + 'debug', _debug, true);
});
createUserStates(userDataDp, false, [tibberStromDP + 'extra.PV_Ueberschuss', { 'name': 'wie viele Wh Überschuss', 'type': 'number', 'read': true, 'write': false, 'role': 'state', 'unit': 'Wh', 'def': 0 }], function () {
    setState(tibberDP + 'extra.PV_Ueberschuss', 0, true);
});
createUserStates(userDataDp, false, [tibberStromDP + 'extra.tibberNutzenAutomatisch', { 'name': 'mit tibber laden erlauben', 'type': 'boolean', 'read': true, 'write': true, 'role': 'state', 'def': true }], function () {
    setState(tibberDP + 'extra.tibberNutzenAutomatisch', _tibberNutzenAutomatisch, true);
});
createUserStates(userDataDp, false, [tibberStromDP + 'extra.PV_Prognose', { 'name': 'PV_Prognose', 'type': 'number', 'read': true, 'write': false, 'role': 'state', 'unit': 'kWh', 'def': 0 }], function () {
    setState(tibberDP + 'extra.PV_Prognose', 0, true);
});
createUserStates(userDataDp, false, [tibberStromDP + 'extra.PV_Prognose_kurz', { 'name': 'PV_Prognose_kurz', 'type': 'number', 'read': true, 'write': false, 'role': 'state', 'unit': 'kWh', 'def': 0 }], function () {
    setState(tibberDP + 'extra.PV_Prognose_kurz', 0, true);
});


console.warn('***************************************************');
console.warn('starte ladenNachPrognose mit debug ' + _debug);

// bei start immer initialisieren
setState(communicationRegisters.fedInSpntCom, _SpntCom_Aus);
setState(SpntComCheck, _SpntCom_Aus);
let _batterieLadenUebersteuernManuell = getState(userDataDp + '.strom.batterieLadenManuellStart').val;

const maxdischrg_def = getState(communicationRegisters.wMaxCha).val;  // 10600
setState('modbus.0.holdingRegisters.3.40795_Maximale_Batterieladeleistung', maxdischrg_def);
setState('modbus.0.holdingRegisters.3.40799_Maximale_Batterieentladeleistung', maxdischrg_def);


// ab hier Programmcode
async function processing() {
    if (_tibberNutzenSteuerung) {
        _macheNix = false;
        let cur_power_out = getState(inputRegisters.powerOut).val;   //cur_power_out = Einspeisung  in W
        _batsoc = Math.min(getState(inputRegisters.batSoC).val, 100);    //batsoc = Batterieladestand vom WR

        let dc = getState(inputRegisters.dc1).val + getState(inputRegisters.dc2).val;  // pv vom Dach zusammen in W
        let battOut = getState(inputRegisters.battOut).val;
        let battIn = getState(inputRegisters.battIn).val;
        let powerSupply = getState(inputRegisters.powerSupply).val;

        let pwrAtCom_def = _batteryLadePower * (253 / 230);                            //max power bei 253V = 5500 W 
        let verbrauchJetzt = (dc + battOut + powerSupply - cur_power_out - battIn);             // verbrauch in W negativ

        let pvlimit = (_pvPeak / 100 * _surplusLimit);                 //pvlimit = 12000/100*0 = 0

        /* Default Werte setzen*/
        let battStatus = getState(inputRegisters.betriebszustandBatterie).val;
        let PwrAtCom = pwrAtCom_def;          //PwrArCom = 11600
        let SpntCom = _SpntCom_Aus;           //   802: aktiv (Act)    803: inaktiv (Ina)

        let tibber_active = 0;
        let tibberPreisJetzt = getState(tibberDP + 'extra.tibberPreisJetzt').val;

        if (_debug) {
            console.warn('Verbrauch jetzt       ' + verbrauchJetzt + ' W');
            console.warn('Ladeleistung Batterie ' + _batteryLadePower + ' W');
            console.warn('Einspeiseleistung     ' + cur_power_out + ' W');
            console.warn('Batt_SOC              ' + _batsoc + ' %');
            const battsts = battStatus == 2291 ? 'Batterie Standby' : battStatus == 3664 ? 'Notladebetrieb' : battStatus == 2292 ? 'Batterie laden' : battStatus == 2293 ? 'Batterie entladen' : 'Aus';
            console.warn('Batt_Status           ' + battsts + ' = ' + battStatus);
        }

        // Lademenge
        let ChaEnrg_full = Math.ceil((_batteryCapacity * (100 - _batsoc) / 100) * (1 / _wr_efficiency));                            //Energiemenge bis vollständige Ladung
        let ChaEnrg = Math.max(Math.ceil((_batteryCapacity * (_batteryTarget - _batsoc) / 100) * (1 / _wr_efficiency)), 0);    //ChaEnrg = Energiemenge bis vollständige Ladung
        let ChaTm = ChaEnrg / _batteryLadePower;                                                                                //Ladezeit = Energiemenge bis vollständige Ladung / Ladeleistung WR

        if (ChaTm <= 0) {
            ChaTm = 0;
            ChaEnrg = ChaEnrg_full;
        }

        // Ende der Parametrierung
        if (_debug) {
            console.warn('Lademenge bis voll ChaEnrg_full ' + ChaEnrg_full + ' Wh');
            console.warn('Lademenge          ChaEnrg      ' + ChaEnrg + ' Wh');
            console.warn('Restladezeit       ChaTm        ' + ChaTm.toFixed(2) + ' h');
        }

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

        let dt = new Date();
        let nowhalfhr = dt.getHours() + ':' + ('0' + Math.round(dt.getMinutes() / 60) * 30).slice(-2);
        let batlefthrs = ((_batteryCapacity / 100) * _batsoc) / (_baseLoad / Math.sqrt(_lossfactor));    /// 12800 / 100 * 30
        let hrstorun = 24;

        if (Number(nowhalfhr.split(':')[0]) < 10) {
            nowhalfhr = '0' + nowhalfhr;
        }

        if (_debug) {
            console.warn('Bat h verbleibend ' + batlefthrs.toFixed(2));
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
            let sunup = getAstroDate('sunriseEnd').getHours() + ':' + getAstroDate('sunriseEnd').getMinutes();
            let sundown = getAstroDate('sunsetStart').getHours() + ':' + getAstroDate('sunsetStart').getMinutes();
            let dtmonth = '' + (dt.getMonth() + 1);
            let dtday = '' + dt.getDate();
            let dtyear = dt.getFullYear();

            if (dtmonth.length < 2) {
                dtmonth = '0' + dtmonth;
            }

            if (dtday.length < 2) {
                dtday = '0' + dtday;
            }

            let dateF = [dtyear, dtmonth, dtday];

            for (let sd = 0; sd < hrstorun * 2; sd++) {
                if (getState(pvforecastDP + sd + '.power').val <= _baseLoad) {
                    sundown = getState(pvforecastDP + sd + '.startTime').val;
                    for (let su = sd; su < hrstorun * 2; su++) {
                        if (getState(pvforecastDP + su + '.power').val >= _baseLoad) {
                            sunup = getState(pvforecastDP + su + '.startTime').val;
                            su = hrstorun * 2;
                        }
                    }
                    sd = hrstorun * 2;
                }
            }
            let sunriseend = getDateObject(dateF + ' ' + sunup + ':00').getTime();
            let sundownend = getDateObject(dateF + ' ' + sundown + ':00').getTime();
            let sundownhr = sundown;

            if (compareTime(sundown, sunup, 'between')) {
                sundownend = dt.getTime();
                sundownhr = nowhalfhr;
            }

            if (compareTime(sunriseend, null, '>', null)) {
                sunriseend = sunriseend + 86400000;
            }

            hrstorun = Math.min(((sunriseend - sundownend) / 3600000), 24);

            if (_debug) {
                console.warn('Nachtfenster:' + sundownhr + '-' + sunup + ' (' + hrstorun.toFixed(2) + ' h)');
            }

            pvwh = 0
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
            let remainhrs = 24 - dt.getHours();
            if (pricehrs > remainhrs) {
                pricehrs = remainhrs;
            }
        }

        let tti = 0;

        for (let t = 0; t < pricehrs; t++) {
            let hrparse = getState(tibberDP + t + '.startTime').val.split(':')[0];
            let prcparse = getState(tibberDP + t + '.price').val;

            poihigh[tti] = [prcparse, hrparse + ':00', hrparse + ':30'];

            tti++;
            if (t == 0 && nowhalfhr == (hrparse + ':30')) {
                tti--;
            }
            poihigh[tti] = [prcparse, hrparse + ':30', getState(tibberDP + t + '.endTime').val];
            tti++;
        }

        // ggf nachladen?
        let prclow = [];
        let prchigh = [];

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
                    if (poitmp.length > 0) {   /*&& prclow.length > 1 && poihigh[0][1] != prclow[0][1]*/
                        if (poihigh[l][2] == prclow[0][1]) {
                            l = poihigh.length;
                        }
                    }
                }
            }

            poihigh = [];
            poihigh = poitmp;

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
                        if (compareTime(prclow[n][1], prclow[n][2], 'between')) {
                            SpntCom = _SpntCom_An;
                            PwrAtCom = pwrAtCom_def * -1;
                            _macheNix = true;
                            tibber_active = 1;
                            break;
                        }
                    }
                }
            }
        }

        //console.warn('Stelle 1 ' + SpntCom + ' PwrAtCom ' + PwrAtCom + ' _macheNix ' + _macheNix);

        if (!_macheNix) {
            poihigh.sort(function (a, b) {      // sortiert höchster preis zuerst            
                return b[0] - a[0];
            });

            let lefthrs = batlefthrs * 2;             // batterie laufzeit in stunden initial

            if (lefthrs > 0 && lefthrs > poihigh.length) {
                lefthrs = poihigh.length;            // ist da was 
            }

            // hier problemm stelle
            if (_batsoc > 0) {
                if (lefthrs > 0 && lefthrs < hrstorun * 2 && pvwh < _baseLoad * 24 * _wr_efficiency) {
                    if (batlefthrs * 2 <= lefthrs) {
                        for (let d = 0; d < lefthrs; d++) {
                            if (poihigh[d][0] > _stop_discharge) {
                                _entladung_zeitfenster = false;
                                SpntCom = _SpntCom_An;
                                PwrAtCom = 0;

                                if (_debug) {
                                    console.warn('Entladezeiten: ' + poihigh[d][1] + '-' + poihigh[d][2] + ' Preis ' + poihigh[d][0]);
                                }
                                if (compareTime(poihigh[d][1], poihigh[d][2], "between")) {
                                    if (_debug) {
                                        console.warn('Bingo Entladezeit: ' + poihigh[d][1] + '-' + poihigh[d][2] + ' Preis ' + poihigh[d][0]);
                                    }
                                    SpntCom = _SpntCom_Aus;
                                    _macheNix = true;
                                    tibber_active = 1;
                                    _entladung_zeitfenster = true;
                                    break;
                                }
                                // wenn noch rest sonne
                                if (dc > 0 && dc > verbrauchJetzt) {
                                    PwrAtCom = dc - 100 - verbrauchJetzt; // 100 W reserve
                                    if (PwrAtCom > 0) {
                                        PwrAtCom = PwrAtCom * -1
                                    } else {
                                        PwrAtCom = 0;
                                    }
                                }
                            }
                        }
                    }
                }
            }

            //console.warn('Stelle 2 ' + SpntCom + ' PwrAtCom ' + PwrAtCom + ' _macheNix ' + _macheNix);

            if (!_macheNix) {
                //entladung stoppen wenn preisschwelle erreicht
                if ((tibberPreisJetzt <= _stop_discharge || _batsoc == 0) && _entladung_zeitfenster) {
                    if (_debug) {
                        console.warn('Stoppe Entladung, Preis jetzt ' + tibberPreisJetzt + ' ct/kWh unter Batterieschwelle von ' + _stop_discharge.toFixed(2) + ' ct/kWh');
                    }
                    SpntCom = _SpntCom_An;
                    PwrAtCom = 0;
                    _macheNix = true;
                    tibber_active = 1;
                }

                //console.warn('Stelle 3 ' + SpntCom + ' PwrAtCom ' + PwrAtCom + ' _macheNix ' + _macheNix);

                //ladung stoppen wenn Restladezeit kleiner Billigstromzeitfenster
                if (lowprice.length > 0 && ChaTm <= lowprice.length) {
                    SpntCom = _SpntCom_An;
                    PwrAtCom = 0;
                    tibber_active = 1;
                    _macheNix = true;
                }

                if (!_macheNix) {
                    // starte die ladung
                    if (tibberPreisJetzt < _start_charge) {
                        let length = Math.ceil(ChaTm);

                        if (length > lowprice.length) {
                            length = lowprice.length;
                            if (_debug) {
                                console.warn('Starte Ladung : ' + JSON.stringify(lowprice));
                            }
                        }
                        for (let i = 0; i < length; i++) {
                            if (compareTime(lowprice[i][1], lowprice[i][2], 'between')) {
                                if (_debug) {
                                    console.warn('Starte Ladung: ' + lowprice[i][1] + '-' + lowprice[i][2] + ' Preis ' + lowprice[i][0]);
                                }
                                SpntCom = _SpntCom_An;
                                PwrAtCom = pwrAtCom_def * -1;
                                tibber_active = 1;
                                break;
                            }
                        }
                    }
                }
            }
        }

        // ----------------------------------------------------  Start der PV Prognose Sektion
        if (_debug) {
            console.error('-->> Start der PV Prognose Sektion : SpntCom ' + SpntCom + ' ,PwrAtCom ' + PwrAtCom + ' _macheNix ' + _macheNix + ' tibber_active ' + tibber_active);
        }

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

        let max_pwr = _Mindischrg;

        // verschieben des Ladevorgangs in den Bereich der PV Limitierung. batterie ist nicht in notladebetrieb
        if (_debug && latesttime) {
            console.warn('pvfc.length ' + pvfc.length + ' ChaTm ' + ChaTm);
        }

// mal schauen 
        // ChaTm = Math.ceil(ChaTm);

        if (ChaTm > 0 && (ChaTm * 2) <= pvfc.length) {
            // Bugfix zur behebung der array interval von 30min und update interval 1h
            if ((compareTime(latesttime, null, '<=', null)) && tibber_active == 0) {
                PwrAtCom = max_pwr;
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

                if (_debug) {
                    console.warn('Überschuß ' + Math.round(get_wh_einzeln) + ' Wh');
                }

                get_wh = get_wh + get_wh_einzeln;
            }

            setState(tibberDP + 'extra.PV_Ueberschuss', Math.round(get_wh), true);

            if (_debug) {
                console.warn('pvfc ' + JSON.stringify(pvfc));
            }

            let pvlimit_calc = pvlimit;
            let min_pwr = 0;

            if (ChaEnrg > get_wh && ChaEnrg > 0 && ChaTm > 0) {
                if ((ChaTm * 2) <= pvfc.length) {
                    ChaTm = pvfc.length / 2;                          //entzerren des Ladevorganges
                }
                if (tibber_active == 0) {
                    pvlimit_calc = Math.max((Math.round(pvlimit - ((ChaEnrg - get_wh) / ChaTm))), 0); //virtuelles reduzieren des pvlimits
                    min_pwr = Math.max(Math.round((ChaEnrg - get_wh) / ChaTm), 0);
                }

                get_wh = ChaEnrg;

                if (_debug) {
                    console.warn('Verschiebe Einspeiselimit auf ' + pvlimit_calc + ' W' + ' mit mindestens ' + min_pwr + ' W,  tibber_active ' + tibber_active + ' get_wh ' + get_wh);
                }
            }

            let current_pwr_diff = 0;

            if (get_wh >= ChaEnrg && ChaEnrg > 0) {
                ChaTm = pvfc.length / 2;
                current_pwr_diff = 100 - pvlimit_calc + cur_power_out;  //bleibe 100W unter dem Limit (PV-WR Trigger)
                if (tibber_active == 0) {
                    max_pwr = Math.round(verbrauchJetzt + current_pwr_diff);

                    if (verbrauchJetzt <= 0 && current_pwr_diff < 0) {  // das sollte nie zutreffen
                        max_pwr = 0;
                    }
                }
                // cur_power_out = die einspeisung

                if (_debug) {
                    console.warn('-->> cur_power_out ' + cur_power_out + ' verbrauchJetzt ' + verbrauchJetzt + ' current_pwr_diff ' + current_pwr_diff);
                    console.warn('-->> aus der begrenzung holen... ' + max_pwr);
                }

                if (verbrauchJetzt <= 10 && current_pwr_diff > 0) {
                    max_pwr = Math.round(pvfc[0][1] - pvlimit_calc);

                    if (current_pwr_diff > max_pwr) {
                        max_pwr = Math.round(current_pwr_diff);
                        if (tibber_active == 1) {
                            SpntCom = _SpntCom_Aus;
                        }
                    }
                }
            }
            if (_debug) {
                console.warn('-->> nach berechnungn 1 ' + max_pwr);
            }

            PwrAtCom = max_pwr * -1;
            
            //if (SpntCom == _SpntCom_An) {  // dann kommst der von oben direkt
            if (_debug) {
                console.warn('max_pwr : ' + max_pwr + ' min_pwr ' + min_pwr + ' _batteryLadePower ' + _batteryLadePower);
            }
            
//  prüfen was hier los      max_pwr = Math.max(max_pwr, min_pwr);

            max_pwr = Math.round(Math.min(max_pwr, _batteryLadePower)); //abfangen negativer werte, limitiere auf min_pwr

            for (let h = 0; h < (ChaTm * 2); h++) {
                if ((compareTime(pvfc[h][3], pvfc[h][4], 'between')) || (cur_power_out + verbrauchJetzt) >= (pvlimit - 100)) {
                    PwrAtCom = max_pwr * -1;
                    SpntCom = _SpntCom_An;
                    break;
                }
            }

            if (_debug) {
                console.warn('max_ladeleistung : ' + SpntCom + ' PwrAtCom ' + PwrAtCom);
            }
            //}
        } else {  //  sonne ballert volle kanne und die reststunden sind kleiner als das was in der forcast
            if (tibber_active == 0 && pvfc.length > 0 && dc > 0) {
                SpntCom = _SpntCom_Aus;
            }
        }
        // ---------------------------------------------------- Ende der PV Prognose Sektion

        // ----------------------------------------------------           write data

        if (SpntCom == _SpntCom_An || SpntCom != _lastSpntCom) {
            if (_debug) {
                console.warn('Daten gesendet an WR kommunikation Wirkleistungvorgabe : ' + PwrAtCom + ' comm ' + SpntCom);
            }
            setState(communicationRegisters.fedInPwrAtCom, PwrAtCom);       // 40149_Wirkleistungvorgabe
            setState(communicationRegisters.fedInSpntCom, SpntCom);         // 40151_Kommunikation
            setState(SpntComCheck, SpntCom);
        }

        if (_debug) {
            console.warn('SpntCom jetzt ' + SpntCom + ' davor war ' + _lastSpntCom + ' Wirkleistungvorgabe ' + PwrAtCom);
            console.warn('------------------------------------------------------------------------------------------------------------');
        }

        _lastSpntCom = SpntCom;
    }
}

on({ id: inputRegisters.triggerDP, change: 'any' }, function () {  // aktualisiere laut adapter abfrageintervall
    _debug = getState(tibberDP + 'debug').val;
    _snowmode = getState(userDataDp + '.strom.tibber.extra.PV_Schneebedeckt').val;
    _tibberNutzenAutomatisch = getState(tibberDP + 'extra.tibberNutzenAutomatisch').val; // aus dem DP kommend sollte true sein für vis

    _tibberNutzenSteuerung = true;

    // übersteuern nach prio manuell zuerst dann autoamtisch oder battsoc unter 5 %
    _batterieLadenUebersteuernManuell = getState(userDataDp + '.strom.batterieLadenManuellStart').val;

    if (_batterieLadenUebersteuernManuell) {
        _tibberNutzenSteuerung = false;                                           // der steuert intern ob lauf gültig 
    }

    if (_debug) {
        console.warn(' _tibberNutzenAutomatisch ' + _tibberNutzenAutomatisch);        
    }

    if (_tibberNutzenAutomatisch) {
        // ---          notladung 
        const checkNotladung = notLadungCheck();
        if (checkNotladung) {
            _tibberNutzenSteuerung = false;
        }

        if (_debug) {
            console.warn(' _tibberNutzenSteuerung ' + _tibberNutzenSteuerung);        
        }

        setTimeout(function () {
            processing();             /*start processing in interval*/
        }, 400);                        // verzögerung zwecks Datenabholung
    }
});

function notLadungCheck() {
    _bydDirectSOC = getState(bydDirectSOCDP).val;
    let isChecked = false;

    if (!_batterieLadenUebersteuernManuell) {

        if (_debug) {
            console.warn('Check Batterie bydDirectSOC ' + _bydDirectSOC + ' %');
        }

        if (_bydDirectSOC < 5) {
            console.warn(' -----------------    Batterie NOTLADEN ');
            setState(communicationRegisters.fedInPwrAtCom, _batteryPowerEmergency);
            setState(communicationRegisters.fedInSpntCom, _SpntCom_An);
            setState(SpntComCheck, _SpntCom_An);
            _lastSpntCom = 0;
            isChecked = true;
        }
    }
    return isChecked;
}


on({ id: '0_userdata.0.strom.batterieLadenManuellStop', change: 'any', val: true }, function (obj) {
    _lastSpntCom = 0;
});

on({ id: tibberDP + 'extra.tibberNutzenManuell', change: 'any', val: true }, function (obj) {
    _lastSpntCom = 0;
});

on({ id: tibberDP + 'extra.tibberNutzenAutomatisch', change: 'any', val: false }, function (obj) {
    setState(communicationRegisters.fedInSpntCom, _SpntCom_Aus);
    setState(SpntComCheck, _SpntCom_Aus);
    _lastSpntCom = 0;
});
