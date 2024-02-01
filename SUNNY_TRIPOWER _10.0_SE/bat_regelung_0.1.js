const tibberDP1 = '0_userdata.0';
const tibberDP2 = 'strom.tibber.';
const tibberDP = tibberDP1 + '.' + tibberDP2;
const pvforecastDP = tibberDP1 + '.strom.pvforecast.gesamt.';

// debug
let _debug = getState(tibberDP + 'debug').val == 'null' ? true : false;
const datenAnWR = true;

//-------------------------------------------------------------------------------------
const _pvPeak = 13100;                      // PV-Anlagenleistung in Wp
const _batteryCapacity = 12800;             // Netto Batterie Kapazität in Wh
const _surplusLimit = 1;                    // PV-Einspeise-Limit in %
const _batteryThreshold = 1;                // Nutzbare Mindestladung der Batterie (zusätzlich zur unteren Entladegrenze des Systems), BYD Batterie regelt selbst
const _batteryTarget = 100;                 // Gewünschtes Ladeziel der Regelung (e.g., 85% for lead-acid, 100% for Li-Ion)
const _baseLoad = 600;                      // Grundverbrauch in Watt (falls bekannt)
const _wr_efficiency = 0.9;                 // Batterie- und WR-Effizienz (e.g., 0.9 for Li-Ion, 0.8 for PB)
const _batteryPower = 5000;                 // Ladeleistung der Batterie in W (0 = automatisch)

const triggerDP = 'modbus.0.inputRegisters.3.30193_Systemzeit_als_trigger';

const communicationRegisters = {
    fedInSpntCom: 'modbus.0.holdingRegisters.3.40151_Kommunikation', // (802 active, 803 inactive)
    fedInPwrAtCom: 'modbus.0.holdingRegisters.3.40149_Wirkleistungvorgabe',
    batChaMaxW: 'modbus.0.holdingRegisters.3.40795_Maximale_Batterieladeleistung',
    batDsChaMaxW: 'modbus.0.holdingRegisters.3.40799_Maximale_Batterieentladeleistung', 
    //wMaxCha: 'modbus.0.holdingRegisters.3.40189_max_Ladeleistung_BatWR', // Max Ladeleistung BatWR
    wMaxDsch: 'modbus.0.holdingRegisters.3.40191_max_Entladeleistung_BatWR', 
}

const inputRegisters = {
    batSoC:   'modbus.0.inputRegisters.3.30845_Batterie_Prozent', 
    powerOut: 'modbus.0.inputRegisters.3.30867_Aktuelle_Netzeinspeisung', 
    powerAC:  'modbus.0.inputRegisters.3.30775_AC_Leistung', 
}

const  _SpntCom_def     = 803;
let    _lastSpntCom     = 0;
let    _lastmaxchrg     = 0;
let    _lastmaxdischrg  = 0;

// ab hier tibber Bereich
let      _tibber = true;                //wird _tibber benutzt (dyn. Strompreis) 
let      _snowmode = false;             //manuelles setzen des Schneemodus, dadurch wird in der Nachladeplanung die PV Prognose ignoriert, z.b. bei Schneebedeckten PV Modulen und der daraus resultierenden falschen Prognose
const    _start_charge = 0.19;          //Eigenverbrauchspreis
const    _lossfactor = 0.75;            //System gesamtverlust in % (Lade+Entlade Effizienz), nur für tibber Preisberechnung
const    _loadfact = 1/_lossfactor;
const    _stop_discharge = (_start_charge * _loadfact);

    createUserStates(tibberDP1, false, [tibberDP2 + 'extra.batprice', { 'name': 'stoppe Entladung bei Preis von', 'type':'number', 'read': true, 'write': false, 'role': 'state',  'def':0 }], function () {        
        setState(tibberDP + 'extra.batprice', _stop_discharge, true);
    });  
    createUserStates(tibberDP1, false, [tibberDP2 + 'extra.pvprice', { 'name': 'starte Ladung bei Preis von', 'type':'number', 'read': true, 'write': false, 'role': 'state',  'def':0 }], function () {        
        setState(tibberDP + 'extra.pvprice', _start_charge, true);
    });  
    createUserStates(tibberDP1, false, [tibberDP2 + 'debug', { 'name': 'debug', 'type':'boolean', 'read': true, 'write': true, 'role': 'state',  'def':false }], function () {        
        setState(tibberDP + 'debug', _debug, true);
    });
    createUserStates(tibberDP1, false, [tibberDP2 + 'extra.PV_Ueberschuss', { 'name': 'wie viele Wh Überschuss', 'type':'number', 'read': true, 'write': false, 'role': 'state', 'unit': 'Wh', 'def':0 }], function () {        
        setState(tibberDP + 'extra.PV_Ueberschuss', 0, true);
    });  
    createUserStates(tibberDP1, false, [tibberDP2 + 'extra.max_ladeleistung', { 'name': 'max ladeleistung', 'type':'number', 'read': true, 'write': false, 'role': 'state', 'unit': 'Wh', 'def':0 }], function () {        
        setState(tibberDP + 'extra.max_ladeleistung', 0, true);
    });  
  //  createUserStates(tibberDP1, false, [tibberDP2 + 'extra.tibber_laden_erlauben', { 'name': 'mit tibber laden erlauben', 'type':'boolean', 'read': true, 'write': true, 'role': 'state', 'def':true }], function () {        
  //      setState(tibberDP + 'extra.tibber_laden_erlauben', _tibber, true);
  //  }); 
    createUserStates(tibberDP1, false, [tibberDP2 + 'extra.PV_Prognose', { 'name': 'PV_Prognose', 'type':'number', 'read': true, 'write': false, 'role': 'state', 'unit': 'kWh', 'def':0 }], function () {        
        setState(tibberDP + 'extra.PV_Prognose', 0, true);
    }); 
    createUserStates(tibberDP1, false, [tibberDP2 + 'extra.PV_Prognose_kurz', { 'name': 'PV_Prognose_kurz', 'type':'number', 'read': true, 'write': false, 'role': 'state', 'unit': 'kWh', 'def':0 }], function () {        
        setState(tibberDP + 'extra.PV_Prognose_kurz', 0, true);
    }); 

// Ende tibber


// ab hier Programmcode
function processing() {
    if (_tibber) {
        let cur_power_out = getState(inputRegisters.powerOut).val * 1000;   //cur_power_out = Einspeisung an SHM    
        let batsoc = Math.min(getState(inputRegisters.batSoC).val, 100);    //batsoc = Batterieladestand vom WR
        let batminlimit = _batteryThreshold;                                //batminlimit = 10  

        if (_debug) { 
            console.error('Ladeleistung Batterie ' + _batteryPower + ' W'); 
            console.error('Einspeiseleistung ' + cur_power_out + ' W'); 
        }

        let maxdischrg_def = getState(communicationRegisters.wMaxDsch).val;
        let pwrAtCom_def = _batteryPower * (253 / 230);              //max power bei 253V 
        let power_ac = getState(inputRegisters.powerAC).val * -1;    //power_ac = -(Einspeisung an SHM)
        let pvlimit = (_pvPeak / 100 * _surplusLimit);               //pvlimit = 12000/100*0,9 = 5940
        

        /* Default Werte setzen*/    
        let maxchrg =  _batteryPower;
        let maxdischrg = maxdischrg_def;
        let PwrAtCom = pwrAtCom_def;          //PwrArCom = 11600
        let SpntCom = _SpntCom_def;           //   802: aktiv (Act)    803: inaktiv (Ina)
        let tibber_active = 0;
        let price0 = getState(tibberDP + 'extra.tibberJetzt').val;

        // Lademenge
        let ChaEnrg_full = Math.ceil((_batteryCapacity * (100 - batsoc) / 100) * (1 / _wr_efficiency));                            //Energiemenge bis vollständige Ladung
        let ChaEnrg      = Math.max(Math.ceil((_batteryCapacity * (_batteryTarget - batsoc) / 100) * (1 / _wr_efficiency)), 0);    //ChaEnrg = Energiemenge bis vollständige Ladung
        let ChaTm        = ChaEnrg / _batteryPower;                                                                                //Ladezeit = Energiemenge bis vollständige Ladung / Ladeleistung WR

        if (ChaTm <= 0) {
            ChaTm   = 0;
            ChaEnrg = ChaEnrg_full;
        }

        // Ende der Parametrierung
        if (_debug) { 
            console.error('Lademenge bis voll ' + ChaEnrg_full + ' Wh') ;
            console.error('Lademenge ' + ChaEnrg + ' Wh') ;
            console.error('Restladezeit ' + ChaTm.toFixed(2) + ' h') ;
        }

        let poi = [];
        for (let t = 0; t < 12 ; t++) {
            poi[t] = [getState(tibberDP + t + '.price').val, getState(tibberDP + t + '.startTime').val, getState(tibberDP + t + '.endTime').val];
        }
        poi.sort(function(a, b, c){
        return a[0] - b[0];
        });

        let lowprice = []; //wieviele Ladestunden unter Startcharge Preis
        for (let x = 0; x < poi.length; x++) {
            if (poi[x][0] < _start_charge) {
                lowprice[x] = poi[x];
            } 
        }

        if (price0 > 0) {
            let dt = new Date();
            let nowhalfhr  = dt.getHours() + ':' + ('0' + Math.round(dt.getMinutes()/60)*30).slice(-2);
            let batlefthrs = (_batteryCapacity/100*(batsoc))/(_baseLoad/Math.sqrt(_lossfactor));      
            let hrstorun = 24;
            
            if (Number(nowhalfhr.split(':')[0]) < 10) { 
                nowhalfhr= '0' + nowhalfhr;
            }
            
            if (_debug) { 
                console.error('Bat h verbleibend ' + batlefthrs.toFixed(2));
            }

            //wieviel wh kommen in etwa von PV in den nächsten 24h
            let pvwh = 0;
            for (let p = 0; p < hrstorun*2; p++) {                
                pvwh = pvwh + (getState(pvforecastDP + p + '.power').val / 2); // warum teilen
            }

            setState(tibberDP + 'extra.PV_Prognose', Math.round(pvwh), true);

            if (_debug) { 
                console.error('extra.PV_Prognose ' + Math.round(pvwh));
            }

            if (pvwh > (_baseLoad*hrstorun/2) && !_snowmode) {
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

                for (let sd = 0; sd < hrstorun*2 ; sd++) {
                    if (getState(pvforecastDP + sd + '.power').val <= _baseLoad) {
                        sundown = getState(pvforecastDP + sd + '.startTime').val;
                        for (let su = sd; su < hrstorun*2 ; su++) {
                            if (getState(pvforecastDP + su + '.power').val >= _baseLoad) {
                                sunup = getState(pvforecastDP + su + '.startTime').val;
                                su = hrstorun*2;
                            }
                        }  
                        sd = hrstorun*2;
                    }
                }
                let sunriseend = getDateObject(dateF + ' ' + sunup + ':00').getTime();
                let sundownend = getDateObject(dateF + ' ' + sundown + ':00').getTime();
                let sundownhr  = sundown;

                if (compareTime(sundown, sunup, 'between')) {
                    sundownend = dt.getTime();
                    sundownhr = nowhalfhr;
                }

                if (compareTime(sunriseend, null, '>', null)) { 
                    sunriseend = sunriseend + 86400000;
                }
                
                hrstorun = Math.min(((sunriseend - sundownend)/3600000),24);
                
                if (_debug) {
                    console.error('Nachtfenster:' + sundownhr + '-' + sunup + ' (' + hrstorun.toFixed(2) + ' h)');
                }
                
                pvwh = 0
                //wieviel wh kommen in etwa von PV die verkürzt
                for (let p = 24; p < hrstorun*2; p++) {
                    pvwh = pvwh + (getState(pvforecastDP + p + '.power').val/2);
                }

                setState(tibberDP + 'extra.PV_Prognose_kurz', Math.round(pvwh), true);
            }
            
            if (_debug) { 
                console.error('Erwarte ca ' + (pvwh/1000).toFixed(1) + ' kWh von PV');
            }
            
            let poihigh = [];        
            let pricehrs = hrstorun;

            //neue Preisdaten ab 14 Uhr
            if (compareTime('14:00', null, '<', null)) {
                let remainhrs = 24-dt.getHours();
                if (pricehrs > remainhrs) {
                    pricehrs = remainhrs;
                }
            }
            
            let tti = 0;

            for (let t = 0; t < pricehrs ; t++) {
                let hrparse = getState(tibberDP + t + '.startTime').val.split(':')[0];
                let prcparse = getState(tibberDP + t + '.price').val;
                
                poihigh[tti] = [prcparse, hrparse + ':00', hrparse + ':30'];
                
                tti++;
                if (t == 0 && nowhalfhr == (hrparse + ':30')){ 
                    tti--;
                }
                poihigh[tti] = [prcparse, hrparse + ':30', getState(tibberDP + t + '.endTime').val];
                tti++;
            }
            
            // ggf nachladen?
            let prclow  = [];
            let prchigh = [];

            if (batlefthrs < hrstorun) {
                let pricelimit = 0;
                let m = 0;

                for (let h = 0; h < poihigh.length ; h++) {
                    pricelimit = (poihigh[h][0]*_loadfact);
                    for (let l = h; l < poihigh.length ; l++) {
                        if (poihigh[l][0] > pricelimit && poihigh[l][0] > _stop_discharge) {
                            prclow[m] = poihigh[h];
                            prchigh[m] = poihigh[l];
                            m++;
                        }
                    }
                }

                let uniqueprclow = prclow.filter(function(value, index, self) { 
                    return self.indexOf(value) === index;
                });

                let uniqueprchigh = prchigh.filter(function(value, index, self) { 
                    return self.indexOf(value) === index;
                });

                prclow = [];
                prclow = uniqueprclow;
                prchigh = [];
                prchigh = uniqueprchigh;

                prclow.sort(function(a, b){
                    return a[0] - b[0];
                })

                //nachlademenge 
                let chargewh = ((prchigh.length)*(_baseLoad/2)*1/_wr_efficiency);

                if (hrstorun < 24 && !_snowmode){
                    chargewh = chargewh-(pvwh*_wr_efficiency);
                }
                let curbatwh = ((_batteryCapacity/100)*batsoc);
                let chrglength = Math.max((chargewh-curbatwh) / ( _batteryPower*_wr_efficiency),0)*2;

                // neuaufbau poihigh ohne Nachladestunden
                let poitmp = [];
                m = 0;

                for (let l = 0; l < poihigh.length ; l++) {
                    poitmp[m] = poihigh[l];
                    m++;
                    if (prclow.length > 0){
                        for (let p = 0; p < prclow.length ; p++) {
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
                prchigh.sort(function(a, b) {
                    return b[0] - a[0];
                });
                
                if (chrglength > prclow.length) {
                    chrglength=prclow.length;
                }

                if (chrglength > 0 && prclow.length > 0) {
                    if (_debug){
                        for (let o = 0; o < chrglength ; o++){
                            console.error('Nachladezeit: ' + prclow[o][1] +'-'+ prclow[o][2] + ' (' + Math.round(chargewh-curbatwh) + ' Wh)');
                        }
                    }

                    if (prclow.length > 0 && chargewh-curbatwh > 0) {
                        for (let n = 0; n < chrglength ; n++) {
                            if (compareTime(prclow[n][1],prclow[n][2],'between')) {
                                maxchrg =  _batteryPower;
                                maxdischrg = 0;
                                SpntCom = 802;
                                PwrAtCom = pwrAtCom_def * -1;
                            }
                        }  
                    }
                }
            }

            poihigh.sort(function(a, b){
                return b[0] - a[0];
            });
            
            let lefthrs = batlefthrs * 2;
            if (lefthrs > 0 && lefthrs > poihigh.length) {
                lefthrs = poihigh.length;
            }

            if (lefthrs > 0 && lefthrs < hrstorun*2 && pvwh < _baseLoad*24*_wr_efficiency) {
                if (batlefthrs*2 <= lefthrs) {
                    maxdischrg = 0
                    for (let d = 0; d < lefthrs; d++) {
                        if (poihigh[d][0] > _stop_discharge){
                            if (_debug) {
                                console.error('Entladezeiten: ' + poihigh[d][1] +'-'+ poihigh[d][2]);
                            }
                            if (compareTime(poihigh[d][1], poihigh[d][2], 'between')) {
                                maxdischrg = maxdischrg_def;
                            }
                        }
                    }
                } 
            }
            //entladung stoppen wenn preisschwelle erreicht
            if (price0 <= _stop_discharge) {
                if ( _debug) { 
                console.error('Stoppe Entladung, Preis unter Batterieschwelle von ' + _stop_discharge.toFixed(2) + ' ct/kWh');
                }
                maxdischrg = 0;
            }
            //ladung stoppen wenn Restladezeit kleiner Billigstromzeitfenster
            if (lowprice.length > 0 && ChaTm <= lowprice.length) {
                maxchrg = 0;
                tibber_active = 1;
            }

            if (price0 < _start_charge) {
                maxchrg = 0;
                maxdischrg = 0;
                tibber_active = 1;

                let length = Math.ceil(ChaTm);
                if (length > lowprice.length) { 
                    length = lowprice.length;           
                }
                for (let i = 0; i < length; i++) {
                    if (compareTime(lowprice[i][1], lowprice[i][2], 'between')) {
                    maxchrg =  _batteryPower;
                    maxdischrg = 0;
                    SpntCom = 802;
                    PwrAtCom = pwrAtCom_def * -1;
                    }
                }
            }
        }

// ----------------------------------------------------  Start der PV Prognose Sektion
        let latesttime;
        let pvfc = [];
        let f = 0;
        for (let p = 0; p < 48; p++) { /* 48 = 24h a 30min Fenster*/
            let pvpower50   = getState(pvforecastDP + p + '.power').val;
            let pvpower90   = getState(pvforecastDP + p + '.power90').val;
            let pvendtime   = getState(pvforecastDP + p + '.endTime').val;
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
            console.error('Abschluss bis ' + latesttime);
        }

        let max_pwr = _batteryPower;

        // verschieben des Ladevorgangs in den Bereich der PV Limitierung.
        if (ChaTm > 0 && (ChaTm * 2) <= pvfc.length && batsoc >= batminlimit) {
            // Bugfix zur behebung der array interval von 30min und update interval 1h
            if ((compareTime(latesttime, null, '<=', null)) && tibber_active == 0) {
                maxchrg = 0;
            }
            //berechnung zur entzerrung entlang der pv kurve, oberhalb des einspeiselimits
            let get_wh = 0;
            for (let k = 0; k < pvfc.length; k++) {
                let pvpower = pvfc[k][0];
                let minutes = 30;

                if (pvpower < (pvlimit + _baseLoad)) {
                    pvpower = pvfc[k][1];
                }

                minutes = pvfc[k][2];
                
                if (compareTime(pvfc[k][3], pvfc[k][4], 'between')) {
                    //rechne restzeit aus
                    const now           = new Date();
                    const options       = { hour12: false, hour: '2-digit', minute: '2-digit' }
                    // @ts-ignore
                    const nowTime       = now.toLocaleTimeString('de-DE', options);
                    const startsplit    = nowTime.split(':');
                    const endsplit      = pvfc[k][4].split(':');
                    const minutescalc   = (Number(endsplit[0]) * 60 + Number(endsplit[1])) - (Number(startsplit[0]) * 60 + Number(startsplit[1]));
                    if (minutescalc < minutes) {
                        minutes = minutescalc;
                    }
                }
                get_wh = get_wh + (((pvpower / 2) - ((pvlimit + _baseLoad) / 2)) * (minutes / 30)); // wieviele Wh Überschuss???
                setState(tibberDP + 'extra.PV_Ueberschuss', Math.round(get_wh), true);
            }

            if (_debug) { 
                console.error('Überschuß ' + Math.round(get_wh) + ' Wh');            
            }

            let pvlimit_calc = pvlimit;
            let min_pwr = 0;
                    
            if (ChaEnrg > get_wh && ChaEnrg > 0 && ChaTm > 0) {
                if ((ChaTm * 2) <= pvfc.length) {
                    ChaTm = pvfc.length / 2;                          //entzerren des Ladevorganges
                }

                pvlimit_calc = Math.max((Math.round(pvlimit - ((ChaEnrg - get_wh) / ChaTm))), 0); //virtuelles reduzieren des pvlimits
                min_pwr = Math.max(Math.round((ChaEnrg - get_wh) / ChaTm), 0);

                get_wh = ChaEnrg; 
                
                if (_debug) { 
                    console.error('Verschiebe Einspeiselimit auf ' + pvlimit_calc + ' W' + ' mit mindestens ' + min_pwr + ' W');                
                }
            }

            if (get_wh >= ChaEnrg && ChaEnrg > 0) {
                ChaTm = pvfc.length / 2;
                const current_pwr_diff = 100 - pvlimit_calc + cur_power_out;  //bleibe 100W unter dem Limit (PV-WR Trigger)

                max_pwr = Math.round(power_ac + current_pwr_diff);
                
                if (power_ac <= 0 && current_pwr_diff < 0) {
                    max_pwr = 0;
                }

                //aus der begrenzung holen...
                if (power_ac <= 10 && current_pwr_diff > 0) {
                    max_pwr = Math.round(pvfc[0][1] - pvlimit_calc);
                    if (current_pwr_diff > max_pwr) {
                        max_pwr = Math.round(current_pwr_diff);
                    }
                }
            }

            max_pwr = Math.round(Math.min(Math.max(max_pwr, min_pwr), _batteryPower)); //abfangen negativer werte, limitiere auf min_pwr

            for (let h = 0; h < (ChaTm * 2); h++) {
                if ((compareTime(pvfc[h][3], pvfc[h][4], 'between')) || (cur_power_out + power_ac) >= (pvlimit - 100)) {
                    maxchrg = max_pwr;
                }
            }

            setState(tibberDP + 'extra.max_ladeleistung', maxchrg, true);

        }
// ---------------------------------------------------- Ende der PV Prognose Sektion


// ----------------------------------------------------           write data
        if (datenAnWR) {
            if (maxchrg != _batteryPower || maxchrg != _lastmaxchrg || maxdischrg != maxdischrg_def || maxdischrg != _lastmaxdischrg) {
                if (_debug) {
                    console.error('Daten gesendet an WR max_ladeleistung : ' + maxchrg + ' , max_entladeleistung ' + maxdischrg);
                }

                setState(communicationRegisters.batChaMaxW, maxchrg);        // 40795_Maximale_Batterieladeleistung
                setState(communicationRegisters.batDsChaMaxW, maxdischrg);   // 40799_Maximale_Batterieentladeleistung
            }

            _lastmaxchrg = maxchrg;
            _lastmaxdischrg = maxdischrg;
            

            if (SpntCom != _SpntCom_def || SpntCom != _lastSpntCom) {
                if (_debug) {             
                    console.error('Daten gesendet an WR : ' + PwrAtCom + ', ' + SpntCom ); 
                }
                setState(communicationRegisters.fedInSpntCom, SpntCom);         // 40151_Kommunikation
                setState(communicationRegisters.fedInPwrAtCom, PwrAtCom);       // 40149_Wirkleistungvorgabe
            }
            _lastSpntCom = SpntCom;

            if (_debug) { 
                console.error('SpntCom ' + SpntCom + ' ' + _lastSpntCom);        
                console.error('----------------------------------------------------------------');    
            }
        }
    }
}

// processing();

on({id: triggerDP, change: 'any'}, function() {  // aktualisiere laut adapter abfrageintervall
    _debug                          = getState(tibberDP  + 'debug').val;
    _tibber                         = getState(tibberDP  + 'extra.tibber_laden_erlauben').val;
    _snowmode                       = getState(tibberDP1 + '.strom.tibber.extra.PV_Schneebedeckt').val;

    setTimeout(function () {  
        processing(); /*start processing in interval*/
    }, 500);           // verzögerung zwecks Datenabholung
});
